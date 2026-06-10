import React from 'react'
import { computed, Thing } from '@deadbeef84/thing'
import { pipe } from '@deadbeef84/thing/util.js'

export function useComputed(thing, suspend) {
  const [state, setState] = React.useState({
    value: thing.isSuspended ? undefined : thing.value,
    isLoading: thing.isSuspended,
  })
  React.useEffect(
    () =>
      thing.subscribe((value) => {
        setState((x) => (x.value !== value ? { value, isLoading: false } : x))
      }),
    [thing],
  )
  if (suspend && thing.isSuspended) {
    React.use(thing.promise)
  }
  return state
}

export function useExpression(...things) {
  const deps = things.pop()
  return React.useMemo(() => pipe(...things), deps)
}

export function useThing(...args) {
  return useComputed(useExpression(...args))
}

export function useThingSuspend(...args) {
  return useComputed(useExpression(...args), true).value
}

export function useThingState(initialValue) {
  const [thing] = React.useState(() => new Thing(initialValue))
  const value = useThing(() => thing.value, [thing]).value
  return [value, thing.next.bind(thing), thing]
}

export function useValueAsThing(value) {
  const [thing] = React.useState(() => new Thing(value))
  if (thing._value !== value) {
    thing.next(value)
  }
  return thing
}
