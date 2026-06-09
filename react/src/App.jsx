import React, { Suspense, use } from 'react'
import './App.css'
import { pipe, Thing } from '@deadbeef84/thing'
import { getRecord } from '@deadbeef84/thing/deepstream.js'
import { useThing, useThingState, useThingSuspend } from './react'
import { debounce } from '@deadbeef84/thing/util.js'

function getSearch(query) {
  const search = {
    type: 'simple',
    query,
    count: 10,
  }
  const { hits } = getRecord(`${JSON.stringify(search)}:search?`, 4).data
  return hits
    .map((id) => getRecord(`${id}:asset.title?`))
    .map((asset) => asset.data.value ?? 'Untitled')
}

const Users = ({ query }) => {
  const isLoading = undefined, assets = useThingSuspend(
    () => getSearch(query),
    [query],
  )

  // const { value: assets = [], isLoading } = useThing(
  //   () => getSearch(query),
  //   [query],
  // )

  return (
    <ul>
      {assets?.map((title, index) => (
        <li key={index}>{title}</li>
      ))}
    </ul>
  )
}

const App = () => {
  const [search, setSearch, searchThing] = useThingState('')
  const { value: debounced = '' } = useThing(searchThing, debounce(1000), [searchThing])

  return (
    <div className="content">
      <h1>Rsbuild with React</h1>
      <p>Start building amazing things with Rsbuild.</p>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div>{search} / {debounced}</div>
      <Suspense fallback={<div>Loading...</div>}>
        <Users query={debounced} />
      </Suspense>
    </div>
  )
}

export default App
