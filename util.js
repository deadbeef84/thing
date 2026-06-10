import fp from 'lodash/fp.js'
import * as rx from 'rxjs'
import { kSuspended, observe, computed, Thing } from './index.js'


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


export function fromRx(observable) {
  return new Thing(kSuspended, (thing) => {
    const subscription = observable.subscribe(thing)
    return () => subscription.unsubscribe()
  })
}

export function toRx(observable) {
  return new rx.Observable((subscriber) => {
    return observe(() => observable.value, subscriber)
  })
}

export function transformRx(transform) {
  let output
  return (source) => {
    output ??= fromRx(transform(toRx(source)))
    return output.value
  }
}

export const throttle = (delay) => operator((dest) => fp.throttle(delay, dest))
export const debounce = (delay) => operator((dest) => fp.debounce(delay, dest))
