# DSH Desktop (Windows x64) — Official Build Record

Built from the **official** upstream repository, using the **official** build method, with **zero modifications to upstream code**.

| Item | Value |
|---|---|
| Upstream | `github.com/deepseek-ai/deepseek-harness` |
| Commit | `ddefc45fbc7f8e46dd73185e68295696d1297887` (2026-09-17, `release-dsh-0.1.6-alpha.2`) |
| Version | `0.1.6-alpha.2` |
| Official command | `pnpm run package:desktop:win:x64:unsigned` |
| Packaging run | `.desktop-build/packaging-runs/2026-09-22T04-31-02.199Z-pleFic` → `result.json` `{"success":true}` |
| Wall clock | 12:31:02 → 12:45:35 (+08:00) ≈ **14m 33s** |
| Upstream diff | **none** (only the git-ignored `apps/desktop/.env.windows` was added) |

## 1. Result

| Artifact | Size | Status |
|---|---|---|
| `deepseek-harness-0.1.6-alpha.2-win-x64.exe` (NSIS installer) | 293.07 MB | ✅ built |
| `deepseek-harness-0.1.6-alpha.2-win-x64.exe.blockmap` | 0.31 MB | ✅ built |
| `win-unpacked/` (runnable app) | 1,117.1 MB / 8,870 files | ✅ **launched and verified** |

**Installer SHA-256** `713A5A70AD9D2ACAE6509D767A143215804E65E994C48AB6E8D8458CA9BC8A2F`

Both live under `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/`.

## 2. Launch verification (not just "it built")

The app was started and inspected, not merely produced:

- Main window title `DeepSeek Harness`; 6 Electron processes alive.
- Host listening on **`127.0.0.1:19387`** — matches upstream docs.
- Host HTTP returns **401**, i.e. it is serving and enforcing token auth.
- Profile auto-created at `~/.dsh/profiles/desktop` with
  `dsh.profile.bundles = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]`
  — matches upstream docs exactly.
- Host command line proves the **bundled** runtime is in use:

  ```
  "…\win-unpacked\DeepSeek Harness.exe" --expose-internals
    …\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\index.js
    …\resources\app.asar\dsh                                  <- bundled dsh tree
    C:\Users\25608\.dsh\profiles\desktop                       <- profile
    …\resources\runtime\primary-runtime                        <- bundled Node+Python
    runtime
    …\resources\runtime\pnpm\bin\pnpm.mjs                      <- bundled pnpm
    …\resources\runtime\bin
  ```

- **Official runtime smoke check passed** against the packaged tree
  (`smokePrimaryRuntime` from upstream `prepare-primary-runtime.ts`):
  node version assert, `numpy`/`pandas`/`decimal`/`lzma`/`uuid` imports, Python office
  round-trip, `pip check` → *"No broken requirements found"*, `pnpm --version` → `11.7.0`.

Bundled runtime: **Node 24.21.0**, **Python 3.12.14**, **pnpm 11.7.0**,
numpy 2.3.5, pandas 3.0.1, Pillow 12.3.0, lxml 6.1.3, openpyxl, python-docx, python-pptx, XlsxWriter.

As designed for unsigned builds, `resources/app-update.yml` is **absent** (no auto-update).

## 3. The proxy (this was the enabler)

The machine runs a Clash-style proxy on `127.0.0.1:7897`, and the **WinINET system proxy is set**
— but that only affects GUI/browser apps. **Node, pnpm, git and the VS installer ignore it**,
and WinHTTP was `Direct access`. Every CLI tool therefore needed explicit env vars.
See `build-env.ps1`; the essentials:

```powershell
$env:HTTP_PROXY = $env:HTTPS_PROXY = 'http://127.0.0.1:7897'
$env:npm_config_proxy = $env:npm_config_https_proxy = 'http://127.0.0.1:7897'
$env:NO_PROXY = 'localhost,127.0.0.1,::1'   # keep the local dev host / devtools direct
$env:npm_config_cache     = 'E:\gcc\dsh-build\.cache\npm'
$env:npm_config_store_dir = 'E:\gcc\dsh-build\.cache\pnpm-store'
$env:ELECTRON_MIRROR                  = 'https://registry.npmmirror.com/-/binary/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://registry.npmmirror.com/-/binary/electron-builder-binaries/'
$env:PYTHON = 'C:\Program Files\Python313\python.exe'
```

Measured through the proxy: npm tarball ~945 KB/s, **GitHub release asset ~2,259 KB/s**,
runtime assets 2–3.7 MB/s. `pnpm install` finished in **57.6 s**.

## 4. Pitfalls avoided (thanks to `zhanghj-ruc/dsh-desktop-build`)

That reference build documented three real traps. All three were confirmed here and pre-empted:

1. **MSVC is a hard prerequisite.** `apps/desktop/scripts/electron-builder-config.mjs` calls
   `prepare-windows-installer.ps1` from `beforeBuild` for **any** win32 target (including `--dir`),
   and that script `throw`s without `vswhere` + `Microsoft.VisualStudio.Component.VC.Tools.x86.x64`
   (it compiles an x86 `window-frame.dll`). This machine had **no MSVC, no Windows SDK, no vswhere**.
   → Installed VS 2022 Build Tools (`Microsoft.VisualStudio.Workload.VCTools --includeRecommended`
   + `VC.ATLMFC`) via an elevated `Start-Process -Verb RunAs`. Verified `cl.exe 19.44.35229` and
   Windows SDK `10.0.26100` `rc.exe` before starting.
   *Note:* the reference's `DSH_DESKTOP_SKIP_INSTALLER_UI` escape hatch **does not exist upstream**
   (verified by grep) — it is a local patch. Skipping MSVC is not an official option.
2. **One-shot downloads with no resume.** Upstream `downloadPrimaryRuntimeAsset()` does a single
   `fetch()` + `arrayBuffer()` with a retry count of zero, caching strictly by content `sha256`.
   A dropped connection hangs the process with nothing on disk.
   → `prefetch-runtime.mjs` pre-seeded the official cache
   (`apps/desktop/.desktop-build/downloads/<sha256>`) with all **15** win-x64 assets
   (90.75 MB, retries + hash verification). Upstream then reused them untouched.
   Because the proxy held up, this ran as insurance rather than as a workaround — but it removes
   an entire class of silent hang.
3. **The proxy made GitHub viable.** The reference resorted to a `ghfast.top` mirror because direct
   GitHub `git clone` died (`SEC_E_NO_CREDENTIALS`) and streams stalled at 2.56 MB. Here, with the
   proxy, a normal `git clone` plus 2–3.7 MB/s asset fetches worked with no mirror.

Two more avoidable mistakes, checked rather than assumed:

- `.env.windows` uses a **strict key whitelist** (`desktop-package-environment.mjs`):
  any non-whitelisted key fails with `unsupported setting`. The `AUTO_UPDATE_ENV` and
  `MANDATORY_UPDATE_TEST_ORIGIN` keys are required **even for unsigned** builds, because
  `resolveDesktopPolicyEnvironment` always runs. Both are in the file.
- `pwsh` (PowerShell 7) is **not installed** here; the host shell is Windows PowerShell 5.1.
  Background jobs and scripts use `powershell.exe`.

## 5. Environment specifics

- `E:\` root carries an explicit read-only ACE (Authenticated Users = ReadAndExecute, non-inherited),
  so no top-level directory can be created at `E:\`. Work was rooted at the writable **`E:\gcc\dsh-build`**
  (322 GB free) instead of the 22–30 GB `C:`.
- Elevation was available non-interactively: `Start-Process -Verb RunAs` returns without a UAC prompt
  (verified by writing to `C:\Program Files`). `sudo.exe` exists but is locale-broken.
- `web_fetch` cannot reach github.com/learn.microsoft.com here (the proxy resolves them to a
  non-public/fake-IP range), so evidence came from the cloned source itself — which is authoritative.

## 6. Reproduction

```powershell
. E:\gcc\dsh-build\build-env.ps1                      # proxy + caches + mirrors
cd E:\gcc\dsh-build\deepseek-harness
pnpm install                                          # ~58 s through the proxy
Copy-Item apps\desktop\.env.windows.example apps\desktop\.env.windows   # then keep only whitelisted keys
node E:\gcc\dsh-build\prefetch-runtime.mjs             # optional insurance: pre-seed the asset cache
pnpm run package:desktop:win:x64:unsigned              # the official command; builds everything itself
```

`package:win:x64:unsigned` is self-contained: it runs `build:official` (native-system → tsc/tsdown
host+client → vite web), then `release:pack` for the dsh and vendor families, packs `desktop-host`
and the Landlock entry, prepares the Electron/pnpm/Python runtime, and finally electron-builder.
There is no need to run `prepare:desktop` first.

Prerequisites, all satisfied here: Node `^22.19.0 || >=24.0.0` (used v24.12.0), pnpm `11.7.0`
(from the `packageManager` field), Python 3.13 (node-gyp; `node-pty` and `koffi` used prebuilds so no
compile was needed), VS 2022 Build Tools + Windows SDK, WebView2 runtime, and working proxies.

## 7. Known limitations (inherent to the official path)

- **Unsigned.** Windows SmartScreen will warn. A signed release needs an EV certificate and a
  hardware token; macOS needs Developer ID plus a macOS host. Upstream ships no local signing option.
- **No auto-update.** By design for `--unsigned`; the update feed stays `null`.
- **NSIS installer not installed.** Structure verified (PE header, blockmap, size). Installing would
  modify the system and was not performed. The unpacked app *was* run and verified.
- Version coupling is upstream-enforced: desktop and bundled dsh must match (`0.1.6-alpha.2`), else
  packaging aborts.

## 8. Files

```
E:\gcc\dsh-build\
  build-env.ps1                     proxy + cache + mirror environment for every CLI tool
  prefetch-runtime.mjs              pre-seeds the official sha256 asset cache (15 assets)
  verify\smoke-check.mjs            runs upstream's smokePrimaryRuntime on the packaged tree
  tools\install-vs-buildtools.ps1   VS 2022 Build Tools (VCTools) install
  tools\vs-install.log              exit code 0, installed VC.Tools.x86.x64
  logs\package-win-x64-unsigned.log full official build log
  deepseek-harness\                 upstream clone (unmodified)
  dsh-desktop-build\                reference implementation studied for pitfalls
```
