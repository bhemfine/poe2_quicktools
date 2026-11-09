// Records one copy of each startup API response into tests/fixtures/api/.
// Manual use only: `node scripts/record-fixtures.mjs <league name>`. One request per endpoint, spaced out.
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const UA = `PoE2QuickTools/${pkg.version} (contact: Bhemfinechua@gmail.com)`
const out = new URL('../tests/fixtures/api/', import.meta.url)
await mkdir(out, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function record(name, url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  const body = await res.text()
  console.log(res.status, name, body.length, res.headers.get('x-rate-limit-policy') ?? '')
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  await writeFile(new URL(name, out), JSON.stringify(JSON.parse(body), null, 1))
  await sleep(1500)
  return JSON.parse(body)
}

const trade = 'https://www.pathofexile.com/api/trade2/data'
const leagues = await record('trade-leagues.json', `${trade}/leagues`)
await record('trade-stats.json', `${trade}/stats`)
await record('trade-items.json', `${trade}/items`)
await record('trade-filters.json', `${trade}/filters`)
await record('trade-static.json', `${trade}/static`)

const ninja = 'https://poe.ninja/poe2/api'
const index = await record('ninja-index-state.json', `${ninja}/data/index-state`)
const league =
  process.argv[2] ??
  index.economyLeagues.find((l) => !l.hardcore && l.name !== 'Standard')?.name ??
  leagues.result[0].id
console.log('league:', league)
const q = (type) => `league=${encodeURIComponent(league)}&type=${type}`
await record(
  'ninja-exchange-currency.json',
  `${ninja}/economy/exchange/current/overview?${q('Currency')}`,
)
await record(
  'ninja-exchange-runes.json',
  `${ninja}/economy/exchange/current/overview?${q('Runes')}`,
)
await record(
  'ninja-uniques-armours.json',
  `${ninja}/economy/stash/current/item/overview?${q('UniqueArmours')}`,
)
