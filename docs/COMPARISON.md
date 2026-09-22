# Official build vs. lightweight shell

Three implementations get compared below. Keeping them straight matters, because they share a name
and a purpose but almost no implementation.

| # | Implementation | What it is |
|---|---|---|
| 1 | **This repository** | Builds upstream `apps/desktop` from monorepo **source**, unmodified, via the official command. |
| 2 | [`Frank-nju/dsh-desktop`](https://github.com/Frank-nju/dsh-desktop) | A hand-written Electron shell that wraps the **published** harness. ~600 lines, not a monorepo build. |
| 3 | [`zhanghj-ruc/dsh-desktop-build`](https://github.com/zhanghj-ruc/dsh-desktop-build) | A process record of building (1) with local patches. Studied for pitfalls; not a code dependency. |

**They are complementary, not competing.** (1) is "the real product, expensively reproduced".
(2) is "a small app that behaves like it". If you want a working desktop app today with no toolchain,
use (2). If you want the bundled Python data stack, the native installer, or the update path, you need (1).

---

## 1. Head-to-head

| | **Official (this repo)** | **Lightweight `dsh-desktop`** |
|---|---|---|
| Harness runtime | Compiled from monorepo source | Staged from an installed npm package |
| Host entry point | Private `@deepseek-ai/dsh-desktop-host` (**not on npm**) | Published `dsh web` profile |
| Shell ↔ host | IPC readiness handshake | Parses the `dsh web: http://…?token=…` stdout line |
| UI delivery | Custom `dsh-app://` protocol + cookie forwarding | Direct loopback origin, native `303` + cookie |
| Harness profile | `~/.dsh/profiles/desktop` | `~/.dsh/profiles/web` |
| Bundled Node | Yes (24.21.0) | Yes |
| **Bundled Python + numpy/pandas/Office** | **Yes** — 13 packages, enables data-analysis and document skills offline | **No** |
| Bundled pnpm | Yes (11.7.0) | Not applicable (no package installation) |
| Auto-update + mandatory-update policy | Yes | Not included |
| EV signing / COS upload | Yes (needs certificate + token) | Not included |
| NSIS installer | Branded custom pages, native `window-frame.dll`, directory-swap upgrades | Stock electron-builder NSIS + desktop-shortcut macro |
| Native directory picker | Yes, via host bridge | Falls back to in-page browse picker |
| Upstream code changes | None | N/A — independent implementation |
| Build command | `pnpm run package:desktop:win:x64:unsigned` | `npm run dist` |
| Build prerequisites | Node, pnpm 11.7.0, Python, **MSVC + Windows SDK**, WebView2 | Node only |
| Installer size | 293.07 MB | — |
| Installed / unpacked size | 1,117 MB, 8,870 files | ~674 MB, ~30,000 files |
| Build time | ~14.5 min | ~minutes |

Sources: upstream `apps/desktop/README.md` and source (read directly in this repository's clone), and
the `dsh-desktop` README as of commit `f284986`.

### Why the sizes differ so much

The official build is bigger **per file count** but smaller **per install**: it bundles one frozen
runtime tree (Node, Python, pnpm, wheels) and seals it into `app.asar`, so it ships fewer, larger files.
The lightweight build stages a full `node_modules` dependency tree verbatim, hence ~30,000 small files.

The inverse surprise is that the official installer (293 MB) is smaller than the lightweight payload
(674 MB) despite bundling Python: it compresses with the pinned 7-Zip decoder and its runtime file
policy strips source maps, TypeScript declarations and other non-runtime files before sealing.

---

## 2. Complementary strengths

Use **this build** when you need:

- Offline data analysis and Office document handling — numpy, pandas, openpyxl, python-docx, python-pptx,
  lxml, Pillow are inside the app, so the relevant skills work with no network and no Python install.
- A real installer: Start Menu entry, uninstall entry, per-user install without elevation.
- The upstream UI delivery path (`dsh-app://` origin isolation) and native directory picker.
- Fidelity to upstream behavior, including its update policy.

Use **`dsh-desktop`** when you need:

- To build with nothing but Node — no MSVC, no Windows SDK, no 1.5 GB toolchain download.
- To track whatever `@deepseek-ai/dsh` version you already have installed, with no monorepo checkout.
- A single-file portable executable.
- A codebase small enough to read end-to-end in one sitting.

---

## 3. Both hit the same class of wall

Independently written, both projects had to solve the same three problems. That is a strong signal
these are properties of the upstream architecture rather than of either implementation.

| Problem | Official build | Lightweight shell |
|---|---|---|
| **Native addon ABI** — `node-pty`, `sharp`, `koffi` are built for standalone Node, not Electron's ABI | Runs the Host as a **separate process** under Electron RunAsNode with a bundled Node | Runs the backend as a **separate process**, preferring a real Node over the Electron Node-mode fallback |
| **Loopback must not be proxied** | Host binds `127.0.0.1` and uses a token URL | Session proxy explicitly pinned to DIRECT |
| **Startup readiness is async and unobservable** | IPC handshake from the desktop host | Reads the token URL line from child stdout |

Both also had to handle Electron quirks around splash windows and redirect-driven navigation, and both
converged on "the backend is its own process" as the load-bearing decision.

---

## 4. Choosing

```
Want an app now, minimal setup?            → dsh-desktop
Need Python / Office skills offline?       → this build
Need a real installer + uninstall entry?   → this build
Need to patch upstream behavior?           → this build (you have the source)
Just want to read ~600 lines of JS?        → dsh-desktop
```
