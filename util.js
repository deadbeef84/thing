import fp from 'lodash/fp.js'
import * as rx from 'rxjs'
import { kSuspended, observe, operator, Thing } from './index.js'

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
