import deepstream from '@nxtedition/deepstream.io-client-js'
import { kSuspended, reportObserved, Thing } from './index.js'

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
      thing._record ??= ds.record.getRecord(name).subscribe(onUpdate, thing)
      return () => {
        thing._record.unsubscribe(onUpdate, thing).unref()
      }
    })

    this.name = name
  }

  get data() {
    return this.value
  }

  get state() {
    reportObserved(this, this.onBecomeObserved)

    if (this._record) {
      return this._record.state
    }
    
    const record = ds.record.getRecord(this.name)
    const state = record.state
    record.unref()
    return state
  }

  get version() {
    reportObserved(this, this.onBecomeObserved)

    if (this._record) {
      return this._record.version
    }
    
    const record = ds.record.getRecord(this.name)
    const version = record.version
    record.unref()
    return version
  }
}

export function getRecord(recordName, state = ds.record.SERVER) {
  return new Record(recordName, state)
}
