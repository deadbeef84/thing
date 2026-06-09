let tracked
const listeners = new Set()
const refCounts = new Map()

export function debug() {
  return { tracked, listeners, refCounts }
}

export function notifyChange(thing) {
  listeners.forEach((listener) => {
    if (listener.tracked.has(thing)) {
      listener.callback()
    }
  })
}

export function reportObserved(thing, onBecomeObserved) {
  if (!tracked || tracked.has(thing)) {
    return
  }

  tracked.add(thing)

  let ref = refCounts.get(thing)
  if (!ref) {
    refCounts.set(thing, {
      count: 1,
      onBecomeUnobserved: onBecomeObserved?.call(thing, thing),
    })
  } else {
    ++ref.count
  }
}

export const kSuspended = Symbol('suspended')

export class Thing {
  _value
  _error
  _completed = false

  constructor(value = kSuspended, onBecomeObserved) {
    this._value = value
    this.onBecomeObserved = onBecomeObserved
  }

  next(value) {
    this._value = value
    notifyChange(this)
  }

  complete() {
    this._completed = true
    notifyChange(this)
  }

  error(e) {
    this._error = e
    notifyChange(this)
  }

  get value() {
    if (!this._completed && !this._error) {
      reportObserved(this, this.onBecomeObserved)
    }
    if (this._error) {
      throw this._error
    }
    if (this._value === kSuspended) {
      throw kSuspended
    }
    return this._value
  }

  update(fn) {
    this.next(fn(this._value))
  }

  get isSuspended() {
    try {
      this.value
      return false
    } catch (e) {
      if (e === kSuspended) {
        return true
      }
      throw e
    }
  }

  get promise() {
    this._promise ??= new Promise((resolve, reject) => {
      let disposer = observe(() => this.value, {
        next: (value) => {
          resolve(value)
          queueMicrotask(() => disposer())
        },
        error: reject,
        complete: resolve,
      })
    })
    return this._promise
  }

  // Make this Promise-like so it can be awaited in async functions
  then(onFulfilled, onRejected) {
    return this.promise.then(onFulfilled, onRejected)
  }

  subscribe(observer) {
    return observe(this, observer)
  }

  [Symbol.asyncIterator]() {
    let saved
    let deferred
    const dispose = observe(this, {
      next: (value) => {
        if (deferred) {
          deferred.resolve({ value, done: false })
          deferred = null
        } else {
          saved = { value, done: false }
        }
      },
      error: (e) => {
        if (deferred) {
          deferred.reject(e)
          deferred = null
        } else {
          saved = { value: e, done: true, error: true }
        }
      },
      complete: () => {
        if (deferred) {
          deferred.resolve({ done: true })
          deferred = null
        } else {
          saved = { done: true }
        }
      },
    })
    return {
      next: () => {
        if (saved) {
          const result = saved
          saved = null
          return result.error
            ? Promise.reject(result.value)
            : Promise.resolve(result)
        }

        deferred = Promise.withResolvers()
        return deferred.promise
      },
      // TODO: do we need the throw method as well?
      return: () => {
        dispose()
        // TODO: should we resolve any pending deferred here?
        return Promise.resolve({ done: true })
      },
    }
  }
}

export function observe(fnOrThing, observer) {
  if (typeof observer === 'function') {
    observer = {
      next: observer,
      error: (e) => {
        throw e
      },
    }
  }

  const listener = {
    tracked: new Set(),
    callback: () => {
      let oldTrackedValue = tracked

      tracked = new Set()
      let result = kSuspended
      try {
        result = fnOrThing instanceof Thing ? fnOrThing.value : fnOrThing()
      } catch (e) {
        if (e !== kSuspended) {
          observer.error?.(e)
        }
      }

      // Decrease ref counts for things that are no longer tracked
      for (const thing of listener.tracked) {
        const ref = refCounts.get(thing)
        if (--ref.count === 0) {
          ref.onBecomeUnobserved?.()
          refCounts.delete(thing)
        }
      }

      listener.tracked = tracked
      tracked = oldTrackedValue

      // If there are no tracked things, we can consider the observation complete
      if (listener.tracked.size === 0) {
        observer.complete?.()
        disposer()
        return
      }

      if (result !== kSuspended) {
        observer.next?.(result)
      }
    },
  }

  const disposer = () => {
    listeners.delete(listener)
    for (const thing of listener.tracked) {
      const ref = refCounts.get(thing)
      if (--ref.count === 0) {
        ref.onBecomeUnobserved?.()
        refCounts.delete(thing)
      }
    }
    listener.tracked.clear()
  }

  // trigger initial run to populate tracked things and subscribe to changes
  listener.callback()
  listeners.add(listener)
  return disposer
}

export function computed(fn) {
  // TODO: should we always force initialization? seems like a bad idea...
  let value = kSuspended
  try {
    value = fn()
  } catch {}
  return new Thing(value, (thing) => observe(fn, thing))
}

export function firstValueFrom(fnOrThing) {
  return new Promise((resolve, reject) => {
    const dispose = observe(fnOrThing, {
      next: (value) => {
        resolve(value)
        queueMicrotask(() => dispose())
      },
      error: (e) => {
        reject(e)
        queueMicrotask(() => dispose())
      },
    })
  })
}

// source, ...operator
export function pipe(...fns) {
  let current
  for (const fn of fns) {
    if (!current && fn instanceof Thing) {
      current = fn
    } else {
      let prev = current
      current = prev ? computed(() => fn(prev)) : computed(fn)
    }
  }
  return current
}

export function fromAsyncGenerator(gen) {
  const thing = new Thing(kSuspended, () => {
    let cancelled = false
    ;(async () => {
      try {
        for await (const value of gen) {
          if (cancelled) {
            break
          }
          thing.next(value)
        }
        thing.complete()
      } catch (e) {
        thing.error(e)
      }
    })()
    return () => {
      cancelled = true
    }
  })
  return thing
}

export function fromPromise(promise) {
  return new Thing(kSuspended, (thing) => {
    promise
      .then((value) => {
        thing.next(value)
        thing.complete()
      })
      .catch((e) => {
        thing.error(e)
      })
  })
}

export function operator(fn) {
  let source
  const thing = new Thing(kSuspended, (thing) => {
    const destination = (value) => thing.next(value)
    destination.next = (value) => thing.next(value)
    destination.complete = () => thing.complete()
    destination.error = (e) => thing.error(e)
    let next = fn(destination)
    if (typeof next === 'function') {
      next = {
        next,
        complete: () => thing.complete(),
        error: (e) => thing.error(e),
      }
    }
    return observe(source, next)
  })
  return (source_) => {
    source = source_
    return thing.value
  }
}
