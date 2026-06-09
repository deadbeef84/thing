import deepstream from '@nxtedition/deepstream.io-client-js'
import { kSuspended, Thing } from './index.js'

const ds = deepstream(
  typeof process === 'undefined'
    ? 'wss://localhost:4430/deepstream'
    : 'ws://localhost:6020/deepstream',
  {
    schedule: (cb) => {
      setTimeout(cb, 0)
    },
  },
)

ds.login(
  {
    type: 'secret',
    secret: '<SECRET>',
  },
  (success) => {
    console.log('logged in', success)
  },
)

function onUpdate(record, thing) {
  thing.next(record.data)
}

export class Record extends Thing {
  constructor(name, state = ds.record.SERVER) {
    const record = ds.record.getRecord(name)
    const value = record.state < state ? kSuspended : record.data
    record.unref()

    super(value, (thing) => {
      thing.record ??= ds.record.getRecord(name).subscribe(onUpdate, thing)
      return () => {
        thing.record.unsubscribe(onUpdate, thing).unref()
      }
    })

    this.name = name
  }

  get data() {
    this.record ??= ds.record.getRecord(this.name).subscribe(onUpdate, this)
    return this.value
  }

  get state() {
    this.record ??= ds.record.getRecord(this.name).subscribe(onUpdate, this)
    reportObserved(this, this.onBecomeObserved)
    return this.record.state
  }

  get version() {
    this.record ??= ds.record.getRecord(this.name).subscribe(onUpdate, this)
    reportObserved(this, this.onBecomeObserved)
    return this.record.version
  }
}

export function getRecord(recordName, state = ds.record.SERVER) {
  return new Record(recordName, state)
}
