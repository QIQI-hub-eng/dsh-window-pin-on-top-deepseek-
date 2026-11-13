/**
 * Client half of the window-pin-on-top bundle.
 *
 * Renders one small pin control in the Windows title bar strip, immediately to
 * the left of the native minimize/maximize/close buttons, and asks the Host
 * half to toggle the window's topmost flag.
 *
 * @module @local/dsh-window-pin-on-top
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-window-pin-on-top',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'window-pin-on-top'
    /** Host route that performs the native window call. */
    const ROUTE = '/dsh-window-pin-on-top'
    /** Caption strip height written by the desktop preload (`--dsh-windows-titlebar-height`). */
    const STRIP_HEIGHT = 40
    /** Control size: the same 28px caption-menu rows the shell uses in the strip. */
    const CONTROL_SIZE = 28
    /** Gap between this control and the first native caption button. */
    const GAP = 8
    /** Windows caption buttons are 46 DIP wide each; used when the browser reports no overlay geometry. */
    const FALLBACK_CAPTION_WIDTH = 138

    /**
     * Width Windows reserves at the right edge of the strip for its caption
     * buttons. The Window Controls Overlay geometry is authoritative; 138px is
     * the three-button default at 100% scale.
     * @returns the reserved width in CSS pixels.
     */
    function readCaptionWidth() {
      const overlay = navigator.windowControlsOverlay
      if (overlay !== undefined && overlay !== null && overlay.visible === true) {
        try {
          const rect = overlay.getTitlebarAreaRect()
          const reserved = Math.round(window.innerWidth - (rect.x + rect.width))
          if (Number.isFinite(reserved) && reserved > 0) return reserved
        } catch {}
      }
      return FALLBACK_CAPTION_WIDTH
    }

    /**
     * True only inside the Windows desktop shell, whose title bar strip holds
     * the native caption buttons this control sits beside.
     * @returns whether the seat should render.
     */
    function hasCaptionStrip() {
      return document.documentElement.hasAttribute('data-windows-titlebar')
    }

    /**
     * Ask the Host half for one action.
     * @param action - `state` or `toggle`.
     * @returns the Host report.
     */
    async function callHost(action) {
      const query = `action=${encodeURIComponent(action)}&title=${encodeURIComponent(document.title)}`
      const response = await fetch(`${ROUTE}?${query}`, {
        method: 'GET',
        headers: { 'x-dsh-window-pin': '1' },
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (!response.ok) throw new Error(`Host route answered ${response.status}`)
      return await response.json()
    }

    /** The pin mark: cap, tapered body, needle — drawn with the control's own color. */
    function PinGlyph() {
      return h('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.35,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        focusable: false,
        style: { display: 'block' },
      },
        h('path', { d: 'M4.7 2.7h6.6' }),
        h('path', { d: 'M6 2.7v3.15L4.3 8.1h7.4L10 5.85V2.7' }),
        h('path', { d: 'M8 8.1v5.2' }),
      )
    }

    /** Style rules for the control: hover, focus, and the pinned tint. */
    const CSS = `
.dsh-window-pin-seat {
  position: fixed;
  top: 0;
  display: flex;
  align-items: center;
  height: ${STRIP_HEIGHT}px;
  z-index: 40;
  -webkit-app-region: no-drag;
}
.dsh-window-pin-button {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${CONTROL_SIZE}px;
  height: ${CONTROL_SIZE}px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: default;
  -webkit-app-region: no-drag;
  position: relative;
  transition:
    background-color 140ms var(--ds-ease-out, ease-out),
    color 140ms var(--ds-ease-out, ease-out),
    transform 120ms var(--ds-ease-out, ease-out);
}
.dsh-window-pin-button:active {
  transform: scale(0.92);
}
.dsh-window-pin-button:hover {
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent);
  color: var(--dsw-alias-label-primary);
}
.dsh-window-pin-button:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dsh-window-pin-button[data-pinned="true"] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent);
  color: var(--dsw-alias-brand-primary);
}
.dsh-window-pin-button[data-pinned="true"]:hover {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent);
}
.dsh-window-pin-button[data-busy="true"] {
  opacity: 0.55;
}
.dsh-window-pin-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  will-change: transform;
}
.dsh-window-pin-glyph[data-motion="pin"] {
  animation: dsh-window-pin-stick 320ms cubic-bezier(0.2, 0.9, 0.25, 1.15) both;
}
.dsh-window-pin-glyph[data-motion="unpin"] {
  animation: dsh-window-pin-release 240ms cubic-bezier(0.35, 0, 0.25, 1) both;
}
.dsh-window-pin-glow {
  position: absolute;
  inset: 2px;
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
  background: radial-gradient(circle, color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent) 0%, transparent 72%);
  animation: dsh-window-pin-glow 420ms ease-out forwards;
}
@keyframes dsh-window-pin-stick {
  0% { transform: translateY(-3px) scale(1.03); }
  42% { transform: translateY(2px) scale(0.9); }
  68% { transform: translateY(-0.5px) scale(1.06); }
  100% { transform: translateY(0) scale(1); }
}
@keyframes dsh-window-pin-release {
  0% { transform: translateY(0) scale(1); }
  38% { transform: translateY(-3.5px) scale(0.93); }
  100% { transform: translateY(0) scale(1); }
}
@keyframes dsh-window-pin-glow {
  0% { opacity: 0.55; transform: scale(0.6); }
  100% { opacity: 0; transform: scale(1.5); }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-window-pin-button { transition: none; }
  .dsh-window-pin-button:active { transform: none; }
  .dsh-window-pin-glyph[data-motion="pin"],
  .dsh-window-pin-glyph[data-motion="unpin"],
  .dsh-window-pin-glow { animation: none; }
}
`

    /**
     * The pin control.
     * @param props.t - the locale-bound translate function.
     * @param props.locale - the Client locale service, for re-render on switches.
     * @returns the control, or nothing outside the Windows desktop shell.
     */
    function PinControl(props) {
      const { t, locale } = props
      React.useSyncExternalStore(
        React.useCallback((notify) => locale.subscribe(notify), [locale]),
        React.useCallback(() => locale.getSnapshot().revision, [locale]),
        React.useCallback(() => locale.getSnapshot().revision, [locale]),
      )
      const [captionWidth, setCaptionWidth] = React.useState(readCaptionWidth)
      const [pinned, setPinned] = React.useState(false)
      const [ready, setReady] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [motion, setMotion] = React.useState({ kind: 'idle', seq: 0 })

      React.useEffect(() => {
        const update = () => setCaptionWidth(readCaptionWidth())
        update()
        window.addEventListener('resize', update)
        const overlay = navigator.windowControlsOverlay
        if (overlay !== undefined && overlay !== null && typeof overlay.addEventListener === 'function') {
          overlay.addEventListener('geometrychange', update)
          return () => {
            window.removeEventListener('resize', update)
            overlay.removeEventListener('geometrychange', update)
          }
        }
        return () => window.removeEventListener('resize', update)
      }, [])

      React.useEffect(() => {
        let live = true
        callHost('state')
          .then((report) => {
            if (!live) return
            if (report !== null && typeof report === 'object' && report.ok === true) {
              setPinned(report.topmost === true)
              setReady(true)
            } else {
              console.error('[window-pin-on-top] state unavailable', report)
            }
          })
          .catch((error) => {
            if (live) console.error('[window-pin-on-top] state request failed', error)
          })
        return () => { live = false }
      }, [])

      const toggle = React.useCallback(() => {
        if (busy) return
        setBusy(true)
        callHost('toggle')
          .then((report) => {
            if (report !== null && typeof report === 'object' && report.ok === true) {
              const next = report.topmost === true
              setPinned(next)
              // A key change on the glyph restarts its keyframes, so rapid
              // toggles replay the motion instead of being ignored.
              setMotion((current) => ({ kind: next ? 'pin' : 'unpin', seq: current.seq + 1 }))
            } else {
              console.error('[window-pin-on-top] toggle failed', report)
            }
          })
          .catch((error) => console.error('[window-pin-on-top] toggle request failed', error))
          .finally(() => setBusy(false))
      }, [busy])

      if (!hasCaptionStrip() || !ready) return null

      const label = pinned ? t('release') : t('pin')
      return h('div', {
        className: 'dsh-window-pin-seat',
        style: { right: `${captionWidth + GAP}px` },
        'data-window-pin-seat': '',
      },
        h('style', { key: 'css' }, CSS),
        h('button', {
          key: 'button',
          type: 'button',
          className: 'dsh-window-pin-button',
          'data-pinned': pinned ? 'true' : 'false',
          'data-busy': busy ? 'true' : 'false',
          'aria-pressed': pinned,
          'aria-label': label,
          title: label,
          onClick: toggle,
          // Keep the caption strip's drag behavior from stealing the click.
          onPointerDown: (event) => event.stopPropagation(),
        },
          motion.kind === 'pin' ? h('span', {
            key: `glow-${motion.seq}`,
            className: 'dsh-window-pin-glow',
            'aria-hidden': true,
          }) : null,
          h('span', {
            key: `glyph-${motion.seq}`,
            className: 'dsh-window-pin-glyph',
            'data-motion': motion.kind,
            'aria-hidden': true,
          }, h(PinGlyph)),
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'en', {
          pin: 'Keep window on top',
          release: 'Stop keeping window on top',
        }), 'window pin labels (en)')
        ctx.effect(() => ctx.locale.register(NS, 'zh', {
          pin: '置顶窗口',
          release: '取消置顶',
        }), 'window pin labels (zh)')
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'window-pin-on-top',
          order: 60,
        }, (props) => h(PinControl, { ...props, t, locale: ctx.locale }))), 'window pin slot')
      },
    }
  },
})
