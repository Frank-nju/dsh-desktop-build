# Proxy and cache environment for the DSH desktop build CLI tools.
#
#   . .\scripts\build-env.ps1
#
# Why this file exists: on Windows the WinINET system proxy (Internet Options) only affects GUI
# apps. Node, pnpm, npm, git and the VS installer do NOT read it, and WinHTTP is "Direct access"
# by default -- so every CLI tool needs explicit environment variables or it silently bypasses
# the proxy. NO_PROXY keeps loopback direct so the local Harness host and Electron devtools are
# never proxied.
#
# Override any value before dot-sourcing to keep your own setting.

$workspace = if ($env:DSH_BUILD_WORKSPACE) { $env:DSH_BUILD_WORKSPACE } else { Split-Path $PSScriptRoot -Parent }
$proxy = if ($env:DSH_BUILD_PROXY) { $env:DSH_BUILD_PROXY } else { 'http://127.0.0.1:7897' }

$env:HTTP_PROXY   = $proxy
$env:HTTPS_PROXY  = $proxy
$env:http_proxy   = $proxy
$env:https_proxy  = $proxy
$env:NO_PROXY     = 'localhost,127.0.0.1,::1'
$env:no_proxy     = 'localhost,127.0.0.1,::1'

# npm/pnpm read these in addition to the generic vars.
$env:npm_config_proxy       = $proxy
$env:npm_config_https_proxy = $proxy
$env:npm_config_noproxy     = 'localhost,127.0.0.1,::1'

# The npm mirrors are faster than GitHub for the large Electron/NSIS archives and resume correctly.
$env:ELECTRON_MIRROR                  = 'https://registry.npmmirror.com/-/binary/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://registry.npmmirror.com/-/binary/electron-builder-binaries/'

# Keep caches on the roomy volume; the build tree reaches several GB.
$env:npm_config_cache     = Join-Path $workspace '.cache\npm'
$env:npm_config_store_dir = Join-Path $workspace '.cache\pnpm-store'
$env:PNPM_HOME            = Join-Path $workspace '.cache\pnpm-home'
New-Item -ItemType Directory -Force -Path $env:npm_config_cache, $env:npm_config_store_dir | Out-Null

# node-gyp needs a Python that is actually on PATH. Set DSH_BUILD_PYTHON to override.
if ($env:DSH_BUILD_PYTHON) {
  $env:PYTHON = $env:DSH_BUILD_PYTHON
} elseif (-not $env:PYTHON) {
  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) { $env:PYTHON = $python.Source }
}

Write-Host "build-env: proxy=$proxy"
Write-Host "build-env: workspace=$workspace"
Write-Host "build-env: store=$env:npm_config_store_dir"
if ($env:PYTHON) { Write-Host "build-env: PYTHON=$env:PYTHON" } else { Write-Warning 'build-env: no Python found on PATH; set DSH_BUILD_PYTHON if node-gyp compiles from source' }
