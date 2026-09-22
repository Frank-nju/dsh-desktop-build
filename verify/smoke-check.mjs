/**
 * Run upstream's OWN packaged-runtime smoke check against a built tree.
 *
 * This imports `smokePrimaryRuntime` from the upstream clone rather than reimplementing it, so the
 * verification is exactly the check upstream runs during packaging -- not an approximation.
 *
 * It asserts the node version, imports numpy/pandas/decimal/lzma/uuid, exercises the Office
 * document round trip, runs `pip check`, and runs the bundled pnpm.
 *
 *   node verify/smoke-check.mjs [primary-runtime dir]
 *
 * Default target is the win-x64 unsigned build output.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { DESKTOP_ROOT, requireUpstream } from '../scripts/lib/config.mjs'

requireUpstream()

const defaultRoot = join(DESKTOP_ROOT, '.desktop-build', 'targets', 'win-x64',
  'unsigned-artifacts', 'win-unpacked', 'resources', 'runtime', 'primary-runtime')
const root = process.argv[2] ?? defaultRoot

if (!existsSync(root)) {
  throw new Error(`no primary runtime at ${root}\n`
    + '  pass the path explicitly, or build first with: pnpm run package:desktop:win:x64:unsigned')
}

// Import the upstream module directly; smokePrimaryRuntime is exported for exactly this purpose.
const modulePath = join(DESKTOP_ROOT, 'scripts', 'prepare-primary-runtime.ts')
const { smokePrimaryRuntime } = await import(pathToFileURL(modulePath).href)

console.log(`smoke root: ${root}`)
smokePrimaryRuntime(root)
console.log('OFFICIAL RUNTIME SMOKE: PASS')
