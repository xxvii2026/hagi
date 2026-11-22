import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { askConnect } from './gate'
import { useStore } from './store'
import { Icon, Mark } from './ui'

/** A short guided tour of the Portfolio page. It spotlights one thing at a time with a card next to it. */

// The same stop can point at the top links on a computer and the bottom tabs on a phone: use whichever is showing.
const visible = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].find(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed') ?? null
type Stop = { sel?: string; title: string; text: string }
export const TOUR_KEY = 'hagi-tour-v1'

const stops = (ready: boolean): Stop[] => [
  { title: 'Welcome to Hagi', text: 'A quick look around before you start. It takes about thirty seconds.' },
  { sel: '.card.hero', title: 'Your private balance', text: 'Everything you shield adds up here. Only your key can read it. To everyone else it’s part of one shared vault.' },
  { sel: '[data-tour="shield"]', title: 'Shield and unshield', text: 'Shield moves tokens from your wallet into the vault. Unshield takes them back out. These are the only two steps others can see.' },
  { sel: '.links a[href="#/swap"], .tabbar a[href="#/swap"]', title: 'Swap privately', text: 'Trade one stock for another straight from your private balance. Nobody can tell the swap was yours.' },
  { sel: '.links a[href="#/send"], .tabbar a[href="#/send"]', title: 'Send privately', text: 'Pay another Hagi user. The amount and the person you paid stay hidden.' },
  { sel: '.links a[href="#/baskets"], .tabbar a[href="#/baskets"]', title: 'Baskets', text: 'Buy a ready-made mix of stocks in one go, or make your own.' },
  { sel: '[data-tour="faucet"]', title: 'Free test money', text: 'Everything here is testnet. Get a little testnet ETH for gas, then claim 5,000 test USDG here once a day.' },
  ready
    ? { sel: '.rt .wal', title: 'You’re all set', text: 'Your wallet menu is here: copy your Hagi address, export your history, or disconnect.' }
    : { sel: '.rt .wal', title: 'Start here', text: 'Sign in with a passkey: Face ID, fingerprint or your screen lock. The first time, that creates your Hagi account. No wallet or email needed.' },
]

// The desktop page is drawn at 80% zoom. Measuring a known element tells us how to turn screen
// positions into the CSS pixels the overlay is laid out in, whatever the zoom is.
const scale = () => {
  const p = document.createElement('div'); p.style.cssText = 'position:fixed;left:100px;top:0;width:1px;height:1px;visibility:hidden'
  document.body.appendChild(p); const k = p.getBoundingClientRect().left / 100; p.remove(); return k || 1
}

export function Tour({ onClose }: { onClose: () => void }) {
  const { s } = useStore()
  const ready = !!s.wallet && !!s.hagiAddress
  const list = stops(ready)
  const [i, setI] = useState(0)
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [vw, setVw] = useState({ w: innerWidth, h: innerHeight })
  const stop = list[i]
  const last = i === list.length - 1
  const finish = useCallback(() => { try { localStorage.setItem(TOUR_KEY, '1') } catch { /* optional */ } onClose() }, [onClose])

  const measure = useCallback(() => {
    const k = scale()
    setVw({ w: innerWidth / k, h: innerHeight / k })
    const el = stop.sel ? visible(stop.sel) : null
    if (!el || !el.offsetParent) { setBox(null); return }
    const r = el.getBoundingClientRect()
    setBox({ x: r.left / k, y: r.top / k, w: r.width / k, h: r.height / k })
  }, [stop.sel])

  useLayoutEffect(() => {
    const el = stop.sel ? visible(stop.sel) : null
    // A tall target goes to the top of the screen so the card still fits under it.
    const tall = !!el && el.getBoundingClientRect().height > innerHeight * 0.45
    el?.scrollIntoView({ block: tall ? 'start' : 'center', inline: 'center', behavior: 'smooth' })
    measure()
    const t = [120, 320, 600].map(ms => setTimeout(measure, ms))
    return () => t.forEach(clearTimeout)
  }, [i, measure, stop.sel])
  useEffect(() => {
    addEventListener('resize', measure); addEventListener('scroll', measure, true)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); if (e.key === 'ArrowRight' && !last) setI(n => n + 1); if (e.key === 'ArrowLeft' && i > 0) setI(n => n - 1) }
    addEventListener('keydown', key)
    return () => { removeEventListener('resize', measure); removeEventListener('scroll', measure, true); removeEventListener('keydown', key) }
  }, [measure, finish, last, i])

  // Place the card under the spotlight if there's room, otherwise above it. Centre it when there's no target.
  const W = Math.min(360, vw.w - 32)
  const pad = 10
  let style: React.CSSProperties
  if (!box) style = { left: (vw.w - W) / 2, top: Math.max(24, vw.h / 2 - 140), width: W }
  else {
    const need = 250
    const left = Math.min(Math.max(16, box.x + box.w / 2 - W / 2), vw.w - W - 16)
    // Under the target if it fits, above it if that fits, otherwise pinned to the bottom of the screen.
    style = vw.h - (box.y + box.h) > need ? { left, top: box.y + box.h + pad + 12, width: W }
      : box.y > need ? { left, bottom: vw.h - box.y + pad + 12, width: W }
      : { left, bottom: 16, width: W }
  }
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Tour of Hagi">
      <div className="tour-back" onClick={finish} />
      {box ? <div className="tour-hole" style={{ left: box.x - pad, top: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2 }} /> : <div className="tour-dim" />}
      <div className="tour-card" style={style} key={i}>
        {!box && <Mark size={36} />}
        <div className="tour-top"><span>{i + 1} of {list.length}</span><button onClick={finish} aria-label="Close the tour"><Icon name="close" size={14} /></button></div>
        <h4>{stop.title}</h4>
        <p>{stop.text}</p>
        <div className="tour-dots">{list.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}</div>
        <div className="tour-act">
          {i > 0 ? <button className="btn o sm" onClick={() => setI(i - 1)}>Back</button> : <button className="btn o sm" onClick={finish}>Skip</button>}
          {!last ? <button className="btn sm" onClick={() => setI(i + 1)}>{i === 0 ? 'Show me' : 'Next'}</button>
            : ready ? <button className="btn sm" onClick={finish}>Done</button>
            : <button className="btn sm" onClick={() => { finish(); askConnect() }}>Connect wallet</button>}
        </div>
      </div>
    </div>
  )
}
