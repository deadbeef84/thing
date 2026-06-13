let tracked
const listeners = new Set()
const refCounts = new Map()

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
    ref = {
      count: 1,
      onBecomeUnobserved: null,
    }
    refCounts.set(thing, ref)
    // TODO: what if this fails?
    ref.onBecomeUnobserved = onBecomeObserved?.call(thing, thing)
    // Unsure if this can actually happen...
    if (ref.count <= 0) {
      throw new Error('invalid ref count')
    }
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
      const prevTrackedSize = listener.tracked.size
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
        // Only emit next when there were also no previous deps (pure constant fn);
        // if deps existed before they all completed, the value was already emitted.
        if (result !== kSuspended && prevTrackedSize === 0) {
          observer.next?.(result)
        }
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
