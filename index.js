/**
 * Host half of the window-pin-on-top bundle.
 *
 * The Windows desktop shell draws its caption buttons (minimize, maximize,
 * close) natively over the page, so no renderer API exists for raising the
 * window above other windows. This half owns the one operation that the Web UI
 * cannot perform itself: it asks Windows to toggle the topmost window flag of
 * the native window hosting the page, and answers the Client over one named
 * web route.
 *
 * @module @local/dsh-window-pin-on-top
 */

import { execFile } from 'node:child_process'

/** Hard dependency: the route lives on the browser HTTP carrier. */
export const inject = ['webServer']

/** Named route the Client calls. Chosen outside `/api`, which the RPC carrier owns. */
const ROUTE_PATH = '/dsh-window-pin-on-top'

/** Custom header proving the caller is the page itself, not a cross-site form post. */
const REQUEST_HEADER = 'x-dsh-window-pin'

/** Actions the route accepts. `state` only reports; the rest change the flag. */
const ACTIONS = new Set(['state', 'on', 'off', 'toggle'])

/** `HWND_TOPMOST` and `HWND_NOTOPMOST` insert-after handles. */
const HWND_TOPMOST = -1
const HWND_NOTOPMOST = -2

/** `SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE` — change stacking only. */
const SWP_FLAGS = 0x0013

/** `GWL_EXSTYLE` and `WS_EX_TOPMOST`. */
const GWL_EXSTYLE = -20
const WS_EX_TOPMOST = 0x8

/** One Windows API surface, compiled by `Add-Type` inside the helper process. */
const WINDOWS_API = `using System;
using System.Text;
using System.Runtime.InteropServices;
public static class DshWindowPin {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowTextLengthW(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
  public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int index);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool IsWindow(IntPtr hWnd);

  /** Title of one top-level window, or null when it has none. */
  public static string TitleOf(IntPtr hWnd) {
    int length = GetWindowTextLengthW(hWnd);
    if (length <= 0) return null;
    StringBuilder text = new StringBuilder(length + 1);
    GetWindowTextW(hWnd, text, text.Capacity);
    return text.ToString();
  }

  /**
   * First visible top-level window whose caption equals the page title, so a
   * non-ASCII caption with an em dash never depends on native matching rules.
   */
  public static IntPtr FindByTitle(string title) {
    string wanted = title.Trim();
    for (int attempt = 0; attempt < 3; attempt++) {
      IntPtr found = IntPtr.Zero;
      EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
        if (!IsWindowVisible(hWnd)) return true;
        string caption = TitleOf(hWnd);
        if (caption == null) return true;
        if (string.Equals(caption.Trim(), wanted, StringComparison.OrdinalIgnoreCase)) { found = hWnd; return false; }
        return true;
      }, IntPtr.Zero);
      if (found != IntPtr.Zero) return found;
      System.Threading.Thread.Sleep(40);
    }
    return IntPtr.Zero;
  }
}`

/**
 * Build the helper script. Every caller-supplied value travels inside one
 * base64 payload, so no quoting, locale, or non-ASCII title can break it.
 * @param payload - action, window title, and the Host process's parent PID.
 * @returns the complete PowerShell program.
 */
function helperScript(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
  return `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
${WINDOWS_API}
'@
$request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json

$hwnd = [IntPtr]::Zero
if ($request.title) { $hwnd = [DshWindowPin]::FindByTitle([string]$request.title) }
if ($hwnd -eq [IntPtr]::Zero -and $request.parentPid -gt 0) {
  $parent = Get-Process -Id ([int]$request.parentPid) -ErrorAction SilentlyContinue
  if ($parent -ne $null -and $parent.MainWindowHandle -ne 0) { $hwnd = [IntPtr]$parent.MainWindowHandle }
}
if ($hwnd -eq [IntPtr]::Zero -or -not [DshWindowPin]::IsWindow($hwnd)) {
  @{ ok = $false; error = 'window-not-found' } | ConvertTo-Json -Compress
  exit 0
}

$style = [DshWindowPin]::GetWindowLongPtr($hwnd, ${GWL_EXSTYLE}).ToInt64()
$before = (($style -band ${WS_EX_TOPMOST}) -ne 0)
$target = $before
if ($request.action -eq 'on') { $target = $true }
elseif ($request.action -eq 'off') { $target = $false }
elseif ($request.action -eq 'toggle') { $target = -not $before }
if ($target -ne $before) {
  if ($target) { [void][DshWindowPin]::SetWindowPos($hwnd, [IntPtr](${HWND_TOPMOST}), 0, 0, 0, 0, ${SWP_FLAGS}) }
  else { [void][DshWindowPin]::SetWindowPos($hwnd, [IntPtr](${HWND_NOTOPMOST}), 0, 0, 0, 0, ${SWP_FLAGS}) }
  $style = [DshWindowPin]::GetWindowLongPtr($hwnd, ${GWL_EXSTYLE}).ToInt64()
}
@{ ok = $true; topmost = ((($style -band ${WS_EX_TOPMOST})) -ne 0); hwnd = $hwnd.ToInt64() } | ConvertTo-Json -Compress
`
}

/** Absolute path of Windows PowerShell, the only interpreter guaranteed here. */
function powershellPath() {
  const root = process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows'
  return `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
}

/**
 * Run one helper invocation and parse its single JSON line.
 * @param payload - action, title, parent PID.
 * @returns the helper's report, or a failure report.
 */
function runHelper(payload) {
  const script = helperScript(payload)
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded]
  return new Promise((resolve) => {
    execFile(powershellPath(), args, { windowsHide: true, timeout: 15000, maxBuffer: 256 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
      const text = String(stdout ?? '').trim()
      const line = text.split(/\r?\n/).filter((entry) => entry.trim().startsWith('{')).pop()
      if (line !== undefined) {
        try {
          resolve(JSON.parse(line))
          return
        } catch {}
      }
      const detail = String(stderr ?? '').trim().split(/\r?\n/)[0] ?? ''
      resolve({ ok: false, error: error === null || error === undefined ? 'unreadable-helper-output' : `helper-failed${detail === '' ? '' : `: ${detail}`}` })
    })
  })
}

/**
 * Apply one action to the native window that hosts the page.
 * Calls are serialized: two overlapping toggles would each read the state the
 * other is about to change.
 * @param action - `state`, `on`, `off`, or `toggle`.
 * @param title - the page's `document.title`, which Electron mirrors onto the window.
 * @returns the resulting topmost state.
 */
let queue = Promise.resolve()
function applyAction(action, title) {
  const run = queue.then(() => runHelper({
    action,
    title: typeof title === 'string' ? title.trim() : '',
    parentPid: typeof process.ppid === 'number' ? process.ppid : 0,
  }))
  queue = run.catch(() => undefined)
  return run
}

/** One JSON response with no caching and no sniffing. */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

/** Route handler: `GET <ROUTE_PATH>?action=<action>&title=<document.title>`. */
async function handleRequest(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ ok: false, error: 'method-not-allowed' }, 405)
  }
  if (request.headers.get(REQUEST_HEADER) !== '1') {
    return json({ ok: false, error: 'forbidden' }, 403)
  }
  const url = new URL(request.url)
  const action = url.searchParams.get('action') ?? 'state'
  if (!ACTIONS.has(action)) {
    return json({ ok: false, error: 'unknown-action' }, 400)
  }
  if (process.platform !== 'win32') {
    return json({ ok: false, error: 'unsupported-platform' }, 200)
  }
  try {
    return json(await applyAction(action, url.searchParams.get('title') ?? ''), 200)
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500)
  }
}

/**
 * Register the route for as long as this plugin is mounted.
 * @param ctx - the plugin context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    resource: handleRequest,
  }), 'window pin on top route')
}
