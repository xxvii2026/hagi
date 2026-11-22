// The first screen of the phone app: a living intro behind the sign-in, like a banking app's welcome screen.
// Every scene is drawn in code, so it opens instantly and stays sharp on any screen.
import { useEffect, useState } from 'react'
import { askConnect } from './gate'
import { PasskeyError } from './passkey'
import { useStore } from './store'
import * as engine from './engine'
import { Icon, Mark, TokenIcon } from './ui'

const SLIDES = [
  { scene: 'vault', title: <>Stocks, <em>off the record.</em></>, text: 'Hold TSLA, AMD, AMZN and more without putting your portfolio on display.' },
  { scene: 'pay', title: <>Pay anyone, <em>privately.</em></>, text: 'They get the money. Nobody sees who sent it, who got it, or how much.' },
  { scene: 'basket', title: <>A whole basket, <em>one tap.</em></>, text: 'Buy a mix of stocks in a single private move.' },
  { scene: 'key', title: <>No wallet. <em>Just Face ID.</em></>, text: 'Your face, fingerprint or screen lock is your key. It never leaves this phone.' },
] as const
const STOCKS = ['TSLA', 'AMD', 'AMZN', 'NFLX', 'PLTR']
const MS = 5200
export const PASSKEY_SEEN = 'hagi-has-passkey'

/** Fixed pseudo-random dust, so the field looks the same on every render. */
const DUST = Array.from({ length: 34 }, (_, i) => {
  const r = (n: number) => { const x = Math.sin(i * 97.13 + n * 13.7) * 43758.5453; return x - Math.floor(x) }
  return { x: r(1) * 100, y: r(2) * 100, s: 4 + Math.round(r(3) * 3) * 4, o: 0.05 + r(4) * 0.14, d: 6 + r(5) * 8, dl: -r(6) * 10 }
})

function Scene({ kind, on }: { kind: string; on: boolean }) {
  return (
    <div className={'in-scene in-' + kind + (on ? ' on' : '')} aria-hidden>
      {kind === 'vault' && <>
        <div className="in-glow" />
        <div className="in-mark"><Mark size={176} leaf="#ffffff" block="#566eba" /></div>
        {STOCKS.map((s, i) => <span key={s} className="in-coin" style={{ ['--a' as string]: `${i * 72 - 90}deg`, ['--d' as string]: `${i * 0.38}s` }}><TokenIcon symbol={s} size={58} /></span>)}
      </>}
      {kind === 'pay' && <>
        <div className="in-glow b" />
        <span className="in-av l"><i /></span><span className="in-av r"><i /></span>
        <svg className="in-arc" viewBox="0 0 300 120"><path d="M30 100 Q150 -20 270 100" /></svg>
        <span className="in-payc"><TokenIcon symbol="USDG" size={54} /></span>
        <span className="in-amt">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 37) % 9 / 10}s` }} />)}</span>
      </>}
      {kind === 'basket' && <>
        <div className="in-glow c" />
        <div className="in-bask">{STOCKS.map((s, i) => <span key={s} style={{ ['--i' as string]: i }}><TokenIcon symbol={s} size={52} /></span>)}</div>
        <div className="in-bar">{[34, 22, 18, 14, 12].map((w, i) => <i key={i} style={{ width: w + '%', ['--i' as string]: i }} />)}</div>
      </>}
      {kind === 'key' && <>
        <div className="in-glow" />
        <div className="in-face"><Mark size={120} leaf="#ffffff" block="#566eba" /><span className="in-ring" /><span className="in-scan" /></div>
      </>}
    </div>
  )
}

/** Shown on phones while signed out. `leaving` plays the hand-off into the app. */
export function Intro({ leaving }: { leaving: boolean }) {
  const [i, setI] = useState(0)
  const [returning] = useState(() => { try { return !!localStorage.getItem(PASSKEY_SEEN) } catch { return false } })
  useEffect(() => { const t = setInterval(() => setI(n => (n + 1) % SLIDES.length), MS); return () => clearInterval(t) }, [])
  const slide = SLIDES[i]
  const { api } = useStore()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const unlock = async () => {
    setBusy(true); setErr('')
    try { await api.passkey(false) } catch (e) { setErr(e instanceof PasskeyError ? e.message : engine.friendly(e)) }
    setBusy(false)
  }
  return (
    <div className={'intro' + (leaving ? ' out' : '')} role="dialog" aria-label="Welcome to Hagi">
      <div className="in-dust">{DUST.map((d, k) => <i key={k} style={{ left: d.x + '%', top: d.y + '%', width: d.s, height: d.s, opacity: d.o, animationDuration: d.d + 's', animationDelay: d.dl + 's' }} />)}</div>
      {SLIDES.map((s, k) => <Scene key={s.scene} kind={s.scene} on={k === i} />)}
      <div className="in-top">
        <div className="in-bars">{SLIDES.map((_, k) => <i key={k} className={k < i ? 'done' : k === i ? 'run' : ''} style={k === i ? { animationDuration: MS + 'ms' } : undefined} />)}</div>
        <div className="in-logo"><Mark size={30} leaf="#ffffff" block="#566eba" /><b>hagi</b></div>
      </div>
      <div className="in-bottom">
        <div className="in-copy" key={i}>
          <h1>{slide.title}</h1>
          <p>{slide.text}</p>
        </div>
        {returning ? <>
          <button className="in-btn main" onClick={unlock} disabled={busy}><Icon name="lock" size={18} />{busy ? 'Checking…' : 'Unlock with Face ID'}</button>
          {err && <span className="in-err">{err}</span>}
          <button className="in-link" onClick={askConnect}>Use another account</button>
        </> : (
          <div className="in-row">
            <a className="in-btn light" href="#/docs">Learn more</a>
            <button className="in-btn main" onClick={askConnect}>Get started</button>
          </div>
        )}
        <span className="in-note">Robinhood Chain Testnet</span>
      </div>
    </div>
  )
}
