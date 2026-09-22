/**
 * Pre-seed apps/desktop/.desktop-build/downloads with the runtime assets locked by
 * apps/desktop/scripts/primary-runtime-lock.json.
 *
 * Why: upstream's downloadPrimaryRuntimeAsset() does one `fetch()` + `arrayBuffer()` with no
 * retry and no resume. A dropped connection leaves the process alive with nothing on disk.
 * It caches strictly by content sha256, so pre-placing a hash-verified file makes the
 * official pipeline reuse it without touching a single upstream line.
 *
 * This script does NOT modify upstream code. It only fills the official cache directory.
 * Network goes through the environment HTTP(S)_PROXY.
 *
 *   node scripts/prefetch-runtime.mjs [target]
 *
 * target defaults to win-x64; mac-arm64 and mac-x64 are also accepted.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { DOWNLOAD_CACHE, requireUpstream, UPSTREAM_ROOT } from './lib/config.mjs'

const target = process.argv[2] ?? 'win-x64'
requireUpstream()

const lockPath = join(UPSTREAM_ROOT, 'apps', 'desktop', 'scripts', 'primary-runtime-lock.json')
const lock = JSON.parse(readFileSync(lockPath, 'utf8'))

const artifact = lock.targets[target]
if (artifact === undefined) {
  throw new Error(`unknown target ${JSON.stringify(target)}; expected ${Object.keys(lock.targets).join(', ')}`)
}

const pythonFilename = `cpython-${lock.pythonVersion}+${lock.pythonRelease}-${artifact.pythonTarget}-install_only_stripped.tar.gz`
const nodeFilename = `node-v${lock.nodeVersion}-${artifact.nodeArchive}`

const assets = [
  {
    url: `https://nodejs.org/dist/v${lock.nodeVersion}/${nodeFilename}`,
    sha256: artifact.nodeSha256,
    label: nodeFilename,
  },
  {
    // The GitHub release asset download redirects to objects.githubusercontent.com.
    url: `https://github.com/astral-sh/python-build-standalone/releases/download/${lock.pythonRelease}/${encodeURIComponent(pythonFilename)}`,
    sha256: artifact.pythonSha256,
    label: pythonFilename,
  },
  ...artifact.wheels.map(wheel => ({ ...wheel, label: wheel.url.split('/').pop() })),
  ...lock.wheels.map(wheel => ({ ...wheel, label: wheel.url.split('/').pop() })),
]

const mb = bytes => `${(bytes / 1024 / 1024).toFixed(2)} MB`

/** Verify a buffer against the locked digest. */
function verify(bytes, sha256, label) {
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== sha256) throw new Error(`checksum mismatch for ${label}: ${digest}`)
}

/** Stream one URL to memory with a hard timeout, honouring the proxy env vars. */
async function fetchBytes(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return Buffer.from(await response.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
}

/** Download one asset with bounded retries, then store it under its sha256 name. */
async function acquire(asset, index, total) {
  const destination = join(DOWNLOAD_CACHE, asset.sha256)
  const prefix = `[${index}/${total}] ${asset.label}`

  try {
    const existing = readFileSync(destination)
    verify(existing, asset.sha256, asset.label)
    console.log(`${prefix}: already cached (${mb(existing.length)})`)
    return { label: asset.label, bytes: existing.length, source: 'cache' }
  } catch (error) {
    if (error.code !== 'ENOENT' && !String(error.message).startsWith('checksum')) throw error
    if (String(error.message).startsWith('checksum')) rmSync(destination, { force: true })
  }

  const attempts = 5
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const started = Date.now()
    try {
      const bytes = await fetchBytes(asset.url, 10 * 60 * 1000)
      verify(bytes, asset.sha256, asset.label)
      const temporary = `${destination}.partial`
      writeFileSync(temporary, bytes)
      renameSync(temporary, destination)
      const seconds = (Date.now() - started) / 1000
      console.log(`${prefix}: ${mb(bytes.length)} in ${seconds.toFixed(1)}s = ${(bytes.length / 1024 / seconds).toFixed(0)} KB/s`)
      return { label: asset.label, bytes: bytes.length, source: 'download' }
    } catch (error) {
      const detail = error.name === 'AbortError' ? 'timeout' : error.message
      console.warn(`${prefix}: attempt ${attempt}/${attempts} failed (${detail})`)
      if (attempt === attempts) throw new Error(`${asset.label}: all ${attempts} attempts failed: ${detail}`)
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
    }
  }
  throw new Error('unreachable')
}

mkdirSync(DOWNLOAD_CACHE, { recursive: true })
console.log(`target: ${target}`)
console.log(`cache:  ${DOWNLOAD_CACHE}`)
console.log(`proxy:  ${process.env.HTTPS_PROXY ?? process.env.https_proxy ?? '(none)'}`)
console.log(`assets: ${assets.length}`)

const results = []
for (const [index, asset] of assets.entries()) {
  results.push(await acquire(asset, index + 1, assets.length))
}

const totalBytes = results.reduce((sum, entry) => sum + entry.bytes, 0)
console.log(`\nall ${results.length} assets verified (${mb(totalBytes)})`)
writeFileSync(join(DOWNLOAD_CACHE, 'prefetch-report.json'), `${JSON.stringify({ target, assets: results }, null, 2)}\n`)
