/**
 * Shared paths for the build workspace.
 *
 * Defaults assume the layout this project was built in:
 *
 *   <workspace>/
 *     build-env.ps1  prefetch-runtime.mjs  verify/      <- this repository
 *     deepseek-harness/                                 <- upstream clone (sibling)
 *
 * Override without editing files:
 *   DSH_BUILD_WORKSPACE  workspace root
 *   DSH_UPSTREAM_REPO    path to the deepseek-harness clone
 */

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository root (the directory containing this file's parent). */
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Workspace containing both this repository and the upstream clone. */
export const WORKSPACE_ROOT = resolve(process.env.DSH_BUILD_WORKSPACE ?? PROJECT_ROOT)

/** Upstream deepseek-harness clone. */
export const UPSTREAM_ROOT = resolve(process.env.DSH_UPSTREAM_REPO ?? resolve(WORKSPACE_ROOT, 'deepseek-harness'))

/** Upstream desktop application directory. */
export const DESKTOP_ROOT = resolve(UPSTREAM_ROOT, 'apps', 'desktop')

/** Official cache directory consumed by upstream's primary-runtime preparation. */
export const DOWNLOAD_CACHE = resolve(DESKTOP_ROOT, '.desktop-build', 'downloads')

/** Cache and log directories owned by this project. */
export const CACHE_ROOT = resolve(process.env.DSH_BUILD_CACHE ?? resolve(WORKSPACE_ROOT, '.cache'))
export const LOG_ROOT = resolve(PROJECT_ROOT, 'logs')

/**
 * Fail early with an actionable message instead of an ENOENT deep inside a download loop.
 * @param path - Path that must exist.
 * @param hint - How the caller should obtain it.
 */
export function requirePath(path, hint) {
  if (!existsSync(path)) {
    throw new Error(`missing ${path}\n  ${hint}`)
  }
  return path
}

/** Assert the upstream clone is present. */
export function requireUpstream() {
  return requirePath(UPSTREAM_ROOT,
    'clone it first:  git clone https://github.com/deepseek-ai/deepseek-harness.git'
    + ` "${UPSTREAM_ROOT}"   (or set DSH_UPSTREAM_REPO)`)
}
