# thing

A tiny reactive programming library inspired by **MobX** and **RxJS**.

It is designed for imperative code style, while still giving you composable reactive state and computed values.

Unlike MobX, values and computations can be **suspended** when data is not ready yet.

## Why this library?

- ✅ Reactive state with simple primitives
- ✅ Imperative code flow (no long pipe chains)
- ✅ Suspend/resume values and computations
- ✅ Derived/computed values that update automatically
- ✅ Clean mental model for async-like readiness

## Installation

```bash
npm install thing
# or
pnpm add thing
# or
yarn add thing
```

## Core idea

You create reactive values, derive computations from them, and react to changes.

When some dependency is not ready, the computation can suspend until it becomes available.

## Quick start

```js
import { Thing, computed, observe } from "thing";

const firstName = new Thing("Ada");
const lastName = new Thing("Lovelace");

const fullName = computed(() => `${firstName.value} ${lastName.value}`);

observe(fullName, (name) => {
	console.log("User:", name);
});

lastName.next("Byron");
// logs: User: Ada Byron
```

## Suspension example

This is the key difference: a value can be unavailable, and readers can suspend.

```js
import { Thing, computed, observe } from "thing";

const user = new Thing(); // starts suspended — no initial value

const userName = computed(() => user.value.name); // suspends while user is unavailable

observe(userName, {
	next: (name) => console.log("Hello", name),
});

setTimeout(() => {
	user.next({ id: "u1", name: "Ada" });
	// observe re-runs: Hello Ada
}, 500);
```

## Computed chains

```js
import { Thing, computed, observe } from "thing";

const price = new Thing(100);
const quantity = new Thing(2);
const discount = new Thing(0.1);

const subtotal = computed(() => price.value * quantity.value);
const total = computed(() => subtotal.value * (1 - discount.value));

observe(
	() => ({ subtotal: subtotal.value, total: total.value }),
	{ next: (v) => console.log(v) },
);

quantity.next(3);
// recomputes subtotal and total automatically
```

## API

- `new Thing(initial?)` → writable reactive value; starts suspended if no initial value given
- `thing.value` → read current value (throws `kSuspended` if suspended, throws stored error if errored)
- `thing.next(value)` → push a new value
- `thing.update(fn)` → update value via a transform: `thing.update(x => x + 1)`
- `thing.isSuspended` → `true` if no value has been set yet
- `thing.complete()` → mark as permanently done
- `thing.error(e)` → put the thing into an error state
- `computed(fn)` → derived reactive value (a `Thing`) that auto-updates when dependencies change
- `observe(fnOrThing, observer)` → run reactively; re-runs when tracked dependencies change; returns a disposer
- `kSuspended` → symbol thrown (and caught) when a `Thing` has no value yet

## When to use it

Use this library if you want:

- MobX-like ergonomics
- Better support for “not ready yet” state in computed graphs
- A straightforward imperative style over stream piping

## Open questions

- How does this relate to [signals](https://github.com/tc39/proposal-signals)?
- Can we support proper sync values? E.g `fromRx(rxjs.of(1, 2, 3)).subscribe(console.log)`