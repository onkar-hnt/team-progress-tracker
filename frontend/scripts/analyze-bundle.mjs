/**
 * Reports which package each byte of each chunk came from, so bundle growth can be attributed
 * instead of guessed at. Reads the source maps of a throwaway build; `npm run analyze` produces
 * them in `dist-analyze/` so the deployable `dist/` never carries maps.
 *
 * Pass a chunk name fragment to list individual modules inside matching chunks:
 *   node scripts/analyze-bundle.mjs WorkCharts
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'dist-analyze/assets'
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const DIGITS = new Map([...BASE64].map((char, index) => [char, index]))

function decodeVlq(field) {
  const values = []
  let value = 0
  let shift = 0

  for (const char of field) {
    const digit = DIGITS.get(char)
    value += (digit & 31) << shift

    if (digit & 32) {
      shift += 5
      continue
    }

    values.push(value & 1 ? -(value >> 1) : value >> 1)
    value = 0
    shift = 0
  }

  return values
}

/**
 * A mapping segment names the source of one generated span, so the span reaching the next segment
 * (or the end of the line) is the number of shipped bytes that source is answerable for.
 */
function bytesPerSource(mapFile) {
  const map = JSON.parse(readFileSync(join(DIR, mapFile), 'utf8'))
  const code = readFileSync(join(DIR, mapFile.replace(/\.map$/, '')), 'utf8')
  const lineLengths = code.split('\n').map((line) => line.length)
  const totals = new Map()
  let sourceIndex = 0

  map.mappings.split(';').forEach((line, lineNumber) => {
    if (!line) return

    let column = 0
    const segments = []

    for (const field of line.split(',').filter(Boolean)) {
      const deltas = decodeVlq(field)
      column += deltas[0]
      if (deltas.length > 1) sourceIndex += deltas[1]
      segments.push({ column, source: deltas.length > 1 ? sourceIndex : null })
    }

    segments.forEach(({ column: start, source }, index) => {
      if (source === null) return

      const end = segments[index + 1]?.column ?? lineLengths[lineNumber] ?? start
      const key = map.sources[source] ?? '(unknown)'
      totals.set(key, (totals.get(key) ?? 0) + Math.max(0, end - start))
    })
  })

  return { size: code.length, totals }
}

function packageOf(source) {
  const marker = source.lastIndexOf('node_modules/')
  if (marker === -1) return 'src (our code)'

  const parts = source.slice(marker + 'node_modules/'.length).split('/')
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`

if (!existsSync(DIR)) {
  console.error(`No build to read at ${DIR}. Run: npm run analyze`)
  process.exit(1)
}

const maps = readdirSync(DIR).filter((file) => file.endsWith('.js.map'))
const focus = process.argv[2]

if (focus) {
  for (const mapFile of maps.filter((file) => file.includes(focus))) {
    const { size, totals } = bytesPerSource(mapFile)
    console.log(`\n${mapFile.replace('.js.map', '')} (${kb(size)})`)

    for (const [source, bytes] of [...totals].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
      console.log(`  ${kb(bytes).padStart(9)}  ${source.replace(/^.*node_modules\//, '')}`)
    }
  }

  process.exit(0)
}

const chunks = maps
  .map((mapFile) => {
    const { size, totals } = bytesPerSource(mapFile)
    const packages = new Map()

    for (const [source, bytes] of totals) {
      const name = packageOf(source)
      packages.set(name, (packages.get(name) ?? 0) + bytes)
    }

    return { name: mapFile.replace('.js.map', ''), size, packages }
  })
  .sort((a, b) => b.size - a.size)

for (const chunk of chunks.filter(({ size }) => size > 20 * 1024)) {
  console.log(`\n${chunk.name} (${kb(chunk.size)})`)

  for (const [name, bytes] of [...chunk.packages].sort((a, b) => b[1] - a[1])) {
    if (bytes > 2048) console.log(`  ${kb(bytes).padStart(9)}  ${name}`)
  }
}

const overall = new Map()
for (const chunk of chunks) {
  for (const [name, bytes] of chunk.packages) {
    overall.set(name, (overall.get(name) ?? 0) + bytes)
  }
}

console.log('\nWhole build, by package')
for (const [name, bytes] of [...overall].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`  ${kb(bytes).padStart(9)}  ${name}`)
}
