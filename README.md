# DeepSeek Harness Desktop — Official Build (Windows x64)

Reproducible record of building the **official** Electron desktop app from
[`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)
`apps/desktop` on Windows x64 — using upstream's own build command, with **zero patches to upstream code**.

Prebuilt artifacts are attached to the [latest release](../../releases/latest).

| Item | Value |
|---|---|
| Upstream | `deepseek-ai/deepseek-harness` |
| Commit built | `ddefc45fbc7f8e46dd73185e68295696d1297887` (2026-09-17, `release-dsh-0.1.6-alpha.2`) |
| Version | `0.1.6-alpha.2` |
| Official command | `pnpm run package:desktop:win:x64:unsigned` |
| Build time | 14 min 33 s |
| Upstream diff | **none** |

---

## Why this repository exists

Upstream's `apps/desktop` is a real, self-contained Electron product: it compiles the whole monorepo,
bundles **Node + Python + pnpm**, ships a branded NSIS installer, and includes an auto-update and
mandatory-update policy. Getting it to build on a clean Windows box is the hard part — the README
assumes a release machine that already has Visual C++ Build Tools, a Windows SDK, proxies, and
release credentials.

This repository records the **exact, verified path** from a bare machine to a runnable installer, and
in particular the parts that fail silently rather than loudly. If you only want a working desktop app
with no toolchain, see the sibling project [`dsh-desktop`](https://github.com/Frank-nju/dsh-desktop),
which wraps the *published* harness instead — the trade-offs are compared in
[`docs/COMPARISON.md`](docs/COMPARISON.md).

---

## Download

| File | Size | Use it when |
|---|---|---|
| `deepseek-harness-0.1.6-alpha.2-win-x64.exe` | 293.07 MB | Normal use. Per-user NSIS install, **no administrator rights**, creates Start Menu + uninstall entries. |
| `deepseek-harness-0.1.6-alpha.2-win-x64-portable.zip` | ~389 MB | Try it without installing. Unzip and run `DeepSeek Harness.exe`. |

Both are **self-contained**: the target machine needs **no Node, no Python, no npm, no
`@deepseek-ai/dsh`**. Only a DeepSeek API key has to be supplied.

> ### ⚠️ These builds are unsigned
>
> There is no code-signing certificate behind them, so **Windows SmartScreen will warn** and the
> installer/app is reported as an unknown publisher. Choose *More info → Run anyway*.
>
> Upstream signs releases with an EV certificate and a hardware token; that cannot be reproduced
> locally, and upstream ships no local bypass. Verify the SHA-256 below if you want certainty about
> what you downloaded.

### SHA-256

```
deepseek-harness-0.1.6-alpha.2-win-x64.exe          713A5A70AD9D2ACAE6509D767A143215804E65E994C48AB6E8D8458CA9BC8A2F
deepseek-harness-0.1.6-alpha.2-win-x64-portable.zip  see release notes
```

---

## What the app actually is

Unlike a thin shell around the published CLI, the official desktop app is a full product:

- **Bundled primary runtime** — Node 24.21.0, Python 3.12.14, pnpm 11.7.0, plus numpy 2.3.5,
  pandas 3.0.1, Pillow 12.3.0, lxml 6.1.3, openpyxl, python-docx, python-pptx, XlsxWriter,
  python-dateutil, six, tzdata, typing_extensions, et_xmlfile. This is what enables the data-analysis
  and Office-document skills offline.
- **Private desktop host entry** — `@deepseek-ai/dsh-desktop-host` is *not published to npm*; it only
  exists inside a monorepo build. The Host runs under Electron's RunAsNode with `--expose-internals`.
- **Dedicated profile** — fresh installs bootstrap `~/.dsh/profiles/desktop` with
  `dsh.profile.bundles = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]`.
- **Native installer** — branded NSIS pages with light/dark palettes, an editable install directory,
  a native `window-frame.dll` helper compiled from `installer/window-frame.cpp`, and directory-swap
  upgrade semantics.
- **Update machinery** — electron-updater wiring plus a mandatory-update policy that polls a
  deployment origin.

---

## Reproducing the build

Prerequisites, all of which this build installed or verified:

| Requirement | Checked here |
|---|---|
| Node `^22.19.0 \|\| >=24` | v24.12.0 |
| pnpm `11.7.0` (from `packageManager`) | 11.7.0 |
| Python (node-gyp) | 3.13.7 |
| **Visual Studio 2022 Build Tools + Windows SDK** | MSVC 19.44.35229, SDK 10.0.26100 |
| WebView2 runtime | 153.0.4234.48 |
| A working HTTP(S) proxy for CLI tools | `127.0.0.1:7897` |

```powershell
. .\scripts\build-env.ps1                    # proxy + cache + mirror environment (see below)
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install                                 # ~58 s through the proxy

# apps/desktop/.env.windows is REQUIRED and uses a strict key whitelist.
Copy-Item apps\desktop\.env.windows.example apps\desktop\.env.windows
#   keep only whitelisted keys; DSH_DESKTOP_APP_ID, DSH_DESKTOP_AUTO_UPDATE_ENV and the selected
#   DSH_DESKTOP_MANDATORY_UPDATE_*_ORIGIN are required EVEN for unsigned builds.

node ..\scripts\prefetch-runtime.mjs         # optional insurance: pre-seed the sha256 asset cache
pnpm run package:desktop:win:x64:unsigned    # the official command; builds everything itself
```

`package:win:x64:unsigned` is self-contained — `prepare:desktop` is **not** a prerequisite. It runs,
in order:

1. `build:official` → `build:native-system`, `build:lib` (tsc + tsdown, host and client), `build:web` (vite)
2. `release:pack --family dsh` → 293 tarballs
3. `pnpm --dir apps/desktop-host pack`
4. `release:pack --family vendor` → 9 tarballs
5. `build:ts` + `pack` for the Landlock entry package
6. `prepare:runtime` → Electron distribution, bundled pnpm, primary runtime (Node/Python/wheels)
7. `prepare:packages`, `prepare:dsh`
8. electron-builder → NSIS installer + blockmap

---

## The three real obstacles

These are the findings that cost actual time. Only the first is a hard blocker.

### 1. MSVC is a hard prerequisite — even for `--dir`

`apps/desktop/scripts/electron-builder-config.mjs` calls `prepare-windows-installer.ps1` from
`beforeBuild` for **any** `win32` target, and that script throws immediately without `vswhere` and
`Microsoft.VisualStudio.Component.VC.Tools.x86.x64`. It compiles an **x86** `window-frame.dll`
(`cl /LD /MT … user32.lib comctl32.lib dwmapi.lib gdiplus.lib ole32.lib shell32.lib uuid.lib`).

Install it with the officially documented workload:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools --source winget `
  --accept-package-agreements --accept-source-agreements `
  --override "--quiet --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Verify **before** starting a 15-minute build:

```powershell
& "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" `
  -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
```

> `DSH_DESKTOP_SKIP_INSTALLER_UI` does **not** exist upstream (grep-verified) — it is a local patch in
> another build record. Skipping MSVC is not an official option.

### 2. Runtime assets download once, with no retry and no resume

`downloadPrimaryRuntimeAsset()` in `prepare-primary-runtime.ts` does a single `fetch()` +
`arrayBuffer()` — a retry count of zero. A dropped connection leaves the process alive with **nothing
on disk**, which looks like a silent hang. It caches strictly by content `sha256`, so pre-placing a
hash-verified file makes the official pipeline reuse it **without touching upstream code**:

```
apps/desktop/.desktop-build/downloads/<sha256>
```

`scripts/prefetch-runtime.mjs` does exactly that for all 15 win-x64 assets (90.75 MB) with bounded
retries and hash verification.

### 3. Nothing else needed a workaround — but only because of the proxy

With `HTTPS_PROXY` set, `git clone` worked normally and GitHub release assets pulled at ~2.2 MB/s.
Another build record reports direct GitHub `git clone` failing with `SEC_E_NO_CREDENTIALS` and streams
dying at 2.56 MB, forcing a third-party mirror. **The proxy removes that entire class of problem.**

### Two more traps, checked rather than assumed

- **`.env.windows` uses a strict key whitelist** (`desktop-package-environment.mjs`). One non-whitelisted
  key fails the build with `unsupported setting`. Required even for `--unsigned`:
  `DSH_DESKTOP_APP_ID`, `DSH_DESKTOP_AUTO_UPDATE_ENV`, and the selected
  `DSH_DESKTOP_MANDATORY_UPDATE_{TEST,PROD}_ORIGIN`, because `resolveDesktopPolicyEnvironment` always runs.
- **The unsigned installer is a 32-bit stub.** Correct, not a bug: NSIS ships an x86 stub that unpacks
  the x64 payload. `Machine=0x014C` on the installer, `0x8664` on the app.

---

## Proxy configuration for CLI tools

On Windows the WinINET system proxy only affects GUI apps. **Node, pnpm, npm, git and the VS
installer ignore it**, and WinHTTP is `Direct access` by default — so every CLI tool needs explicit
environment variables. That is what `scripts/build-env.ps1` provides:

```powershell
$env:HTTP_PROXY = $env:HTTPS_PROXY = 'http://127.0.0.1:7897'
$env:npm_config_proxy = $env:npm_config_https_proxy = 'http://127.0.0.1:7897'
$env:NO_PROXY = 'localhost,127.0.0.1,::1'          # keep the local dev host and devtools direct
$env:npm_config_cache     = '<repo>\.cache\npm'
$env:npm_config_store_dir = '<repo>\.cache\pnpm-store'
$env:ELECTRON_MIRROR                  = 'https://registry.npmmirror.com/-/binary/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://registry.npmmirror.com/-/binary/electron-builder-binaries/'
$env:PYTHON = '<path to python.exe>'
```

Measured through this proxy: npm tarball ~945 KB/s, GitHub release asset ~2,259 KB/s, runtime assets
2–3.7 MB/s.

---

## Verification performed

The build was not accepted on "exit code 0" alone:

- `packaging-runs/<run>/result.json` → `{"success":true}`
- App launched; main window `DeepSeek Harness`; Host listening on **`127.0.0.1:19387`**
- Host HTTP returns **401** — serving, with token auth enforced
- Profile auto-created at `~/.dsh/profiles/desktop` with the documented bundles
- Host command line confirms the **bundled** `primary-runtime`, bundled pnpm and profile are in use
- Official `smokePrimaryRuntime` passed against the packaged tree: node version assert,
  `numpy`/`pandas`/`decimal`/`lzma`/`uuid` imports, Office round-trip, `pip check` (*no broken
  requirements*), `pnpm --version`
- **Clean-environment launch**: started with all proxy/npm/mirror variables removed — still reaches a
  served UI, proving no build-machine dependency
- Portable zip internal structure inspected; installer payload extracted and counted

---

## Known limitations

- **Unsigned.** SmartScreen warns. Signed releases need an EV certificate plus a hardware token;
  macOS additionally needs a Developer ID and a macOS host.
- **No auto-update.** By design for `--unsigned` — `resources/app-update.yml` is absent and the
  publish feed is `null`.
- **First launch contacts the deployment origin.** The mandatory-update policy polls
  `<origin>/api/v0/check_client_update` with client-identity headers. It **fails open**: the initial
  state is `blocking: false` and transport/JSON/protocol failures retain it, so only an explicit
  server-side `code 40005` blocks the app. Offline and air-gapped machines work normally.
- **This build points at the test deployment** (`DSH_DESKTOP_AUTO_UPDATE_ENV=test` →
  `https://harness-test.deepseek.com`), per the official template. It therefore will not pull
  production updates.
- **The NSIS installer was not executed.** Structure was verified (valid PE, 15 files,
  311,158,983-byte payload, blockmap, uninstaller, embedded 7-Zip decoder). Installing modifies the
  system and was deliberately skipped; the **unpacked app was run and verified** instead.
- Version coupling is upstream-enforced: desktop and bundled dsh versions must match exactly.

---

## Layout

```
scripts/build-env.ps1            proxy + cache + mirror env for every CLI tool
scripts/prefetch-runtime.mjs     pre-seeds the official sha256 asset cache (15 assets)
scripts/install-vs-buildtools.ps1 VS 2022 Build Tools (VCTools) install
verify/smoke-check.mjs           runs upstream's smokePrimaryRuntime on the packaged tree
docs/BUILD-RECORD.md             full build record with timing and evidence
docs/COMPARISON.md               this build vs. the lightweight dsh-desktop shell
logs/                            official build log, packaging-run records, VS install log
```

## Licensing

The scripts and documentation in this repository are original work (MIT).

The **release binaries are builds of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness),
which is MIT-licensed**, and they embed third-party components under their own licenses — notably
Node.js, CPython and the scientific Python wheels, pnpm, Electron/Chromium, and LibreOffice Kit.
Upstream's license and third-party notices are preserved inside the artifacts
(`resources/app.asar` and the bundled runtime). This repository redistributes binaries, not upstream
source code.
