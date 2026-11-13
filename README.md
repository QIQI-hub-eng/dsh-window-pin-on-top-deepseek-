# Window pin on top — a DeepSeek Harness plugin

A small DeepSeek Harness (DSH) desktop plugin that adds a **pin control in the window title bar, immediately to the left of the Windows minimize button**, and toggles the window's *always on top* state.

```
┌──────────────────────────────────────────────────────────────┐
│  Application  Edit                          📌  ─   □   ✕     │
└──────────────────────────────────────────────────────────────┘
                                              ↑ pin here, then the
                                                native window buttons
```

English | [中文](README.zh.md)

## Why this plugin needs a Host half

The DSH desktop shell draws a 40 px Windows title bar strip over the page
(`titleBarStyle: hidden` + `titleBarOverlay`) and lets Windows paint the
minimize / maximize / close buttons there. The page therefore has no renderer
API for "always on top": the desktop preload exposes files, the browser bridge,
shortcuts and updates, but no window-stacking call.

So the control is split in two:

| Half | File | Job |
| --- | --- | --- |
| Client | `client.js` | Registers one entry in the `shell.overlay` slot, positions it just left of the caption buttons, and renders the pin. |
| Host | `index.js` | Serves `GET /dsh-window-pin-on-top` on `ctx.webServer` and calls `user32!SetWindowPos(HWND_TOPMOST / HWND_NOTOPMOST)` on the native window that hosts the page. |

At runtime the flow is: click → `fetch('/dsh-window-pin-on-top?action=toggle&title=…')` →
the Host locates the top-level window whose caption equals `document.title`
(with a parent-PID fallback), reads/flips `WS_EX_TOPMOST`, and answers
`{ ok, topmost, hwnd }` → the button repaints in the pinned style.

## Requirements

- DSH **Desktop** on **Windows** (the control renders only when the page carries
  `html[data-windows-titlebar]`, the marker the desktop preload sets).
- Developed and tested against DSH `0.2.2-rc.1`.
- No build step: `index.js` and `client.js` are plain ESM/JS.
- Windows PowerShell 5.1 (`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`), which ships with Windows.

## Install

Clone this repository anywhere, then install the folder as a bundle.

```powershell
git clone https://github.com/QIQI-hub-eng/dsh-window-pin-on-top-deepseek-.git
```

**Through the agent** — ask DSH to install the folder:

> Install the plugin bundle at `D:\path\to\dsh-window-pin-on-top`.

**Through the UI** — open **Plugins** in the DSH sidebar, add the folder path
(or the repository URL) in the install field, and enable the bundle.

Then **restart DeepSeek Harness**. A newly added bundle is composed into the
profile at startup, so the install reports `restart-required`; the pin appears
after the restart.

A linked folder is used as-is, so editing the files and restarting is enough to
pick up a change.

## Use

- Click the pin to keep the window above other windows; click again to release it.
- The button answers the click: the pin presses down and sticks when it pins,
  lifts and settles when it releases, and a soft brand-tinted glow confirms the
  change. The motion is skipped under `prefers-reduced-motion: reduce`, and the
  pressed state scales the button down for a tactile feel.
- The pinned state is tinted with the theme's brand color; hovering any time
  shows a tooltip in the interface language (中文 / English).
- The plugin reports the *real* window state on mount, so it never shows
  "pinned" when the window is not.

## Details worth knowing

- **Placement** comes from the Window Controls Overlay geometry
  (`navigator.windowControlsOverlay.getTitlebarAreaRect()`) plus an 8 px gap,
  with a 138 px fallback for the three standard caption buttons. The strip is
  40 px tall and the control is 28 px, matching the shell's own caption rows.
- **Drag vs. click**: the strip is an `-webkit-app-region: drag` surface, so the
  control declares `no-drag` and stops pointer propagation; otherwise the click
  would be swallowed as a window drag.
- **The route refuses unknown callers**: it requires the `x-dsh-window-pin: 1`
  header (a cross-site page cannot send it without a preflight this route never
  answers) and only accepts `GET` with `action=state|on|off|toggle`.
- **Failure is quiet**: if the Host cannot find the window it answers
  `{ ok: false, error: 'window-not-found' }` and the control never appears,
  instead of showing a button that does nothing.
- **Overhead**: one short-lived PowerShell helper per action (≈250 ms, measured),
  because that is the only way to reach `user32` from the Host without a native
  addon.

## Known limits

- Windows only. On macOS the traffic-light buttons sit on the other side, and
  the control does not render.
- A pinned window stays pinned until it is toggled off or the app restarts.
- If a future DSH release changes the caption strip height or the overlay
  geometry, only the two constants at the top of `client.js` (`STRIP_HEIGHT`,
  `FALLBACK_CAPTION_WIDTH`) and the Host route need revisiting.

## License

MIT — see [LICENSE](LICENSE).
