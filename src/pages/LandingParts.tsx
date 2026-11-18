import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { STOCKS, fmt, short, token } from '../data'
import { lookup, validAddress, type Seen } from '../lookup'
import { go } from '../nav'
import { useStore } from '../store'
import { Censor, Icon, TokenIcon } from '../ui'

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const hoverable = () => matchMedia('(hover: hover) and (pointer: fine)').matches

/* ---------- 1. Hero background: the public trade feed, with a row going private now and then ---------- */

function seeded(n: number) { let h = n * 2654435761 >>> 0; return () => { h = (h * 1103515245 + 12345) >>> 0; return h / 4294967296 } }
const HEX = '0123456789abcdef'

export function HeroFeed() {
  const rows = useMemo(() => {
    const r = seeded(7)
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
    return Array.from({ length: 14 }, (_, i) => ({
      addr: '0x' + Array.from({ length: 4 }, () => pick([...HEX])).join('') + '…' + Array.from({ length: 4 }, () => pick([...HEX])).join(''),
      verb: r() > 0.3 ? 'bought' : 'sold',
      sym: pick(STOCKS.map(s => s.symbol)),
      qty: pick(['0.5000', '1.2500', '3.0000', '7.7500', '12.0000', '40.0000']),
      time: String(Math.floor(r() * 24)).padStart(2, '0') + ':' + String(Math.floor(r() * 60)).padStart(2, '0'),
      hue: Math.floor(r() * 360),
      goes: i % 4 === 1, // every fourth row turns private for a moment
      delay: (i * 1.7) % 9,
    }))
  }, [])
  const Row = ({ x, k }: { x: (typeof rows)[number]; k: string }) => (
    <div className={'hf-row' + (x.goes ? ' goes' : '')} key={k} style={{ ['--d' as string]: x.delay + 's' }}>
      <span className="av" style={{ background: `linear-gradient(135deg,hsl(${x.hue} 60% 62%),hsl(${(x.hue + 70) % 360} 60% 45%))` }} />
      <span className="ad"><span className="hf-a">{x.addr}</span>{x.goes && <span className="hf-c"><Censor seed={x.addr} cols={9} cell={11} onDark /></span>}</span>
      <span className="vb">{x.verb}</span><span className="am">{x.qty} {x.sym}</span><TokenIcon symbol={x.sym} size={30} /><span className="tm">{x.time}</span>
      {x.goes && <em>Private</em>}
    </div>
  )
  return (
    <div className="hfeed" aria-hidden>
      <div className="hf-tilt">
        {[0, 1].map(c => (
          <div className="hf-col" key={c}><div className="hf-run">
            {[...rows, ...rows].map((x, i) => <Row x={x} k={c + '-' + i} key={c + '-' + i} />)}
          </div></div>
        ))}
      </div>
    </div>
  )
}

/* ---------- 2. Privacy lens over the preview ---------- */

/** Wraps the preview. In the public view, a circle follows the pointer and shows the real numbers under it.
 *  On touch screens with no pointer, the lens drifts by itself, and a tap moves it. */
export function Lens({ active, children, reveal }: { active: boolean; children: ReactNode; reveal: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState(false)
  const user = useRef(0) // time of the last real pointer move
  const put = (x: number, y: number) => { const b = box.current; if (!b) return; b.style.setProperty('--lx', x + 'px'); b.style.setProperty('--ly', y + 'px') }
  const at = (e: React.PointerEvent) => { const r = box.current!.getBoundingClientRect(); put(e.clientX - r.left, e.clientY - r.top); user.current = performance.now(); setOn(true) }
  // Drift on touch screens, or whenever nobody has moved the pointer for a few seconds on a phone.
  useEffect(() => {
    if (!active || hoverable() || reduced()) return
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const b = box.current
      if (b && t - user.current > 2200) {
        const w = b.clientWidth, h = b.clientHeight, k = (t - t0) / 1000
        put(w * (0.5 + 0.3 * Math.sin(k * 0.9)), h * (0.42 + 0.3 * Math.sin(k * 1.3 + 1)))
        setOn(true)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])
  useEffect(() => { if (!active) setOn(false) }, [active])
  return (
    <div ref={box} className={'lensbox' + (active && on ? ' on' : '')}
      onPointerMove={active ? at : undefined} onPointerDown={active ? at : undefined}
      onPointerLeave={active ? e => { if (e.pointerType === 'mouse') setOn(false) } : undefined}>
      {children}
      {active && <div className="lens peek" aria-hidden>{reveal}</div>}
      {active && <span className="lring" aria-hidden />}
      {active && <span className="lhint"><span className="hv">Move your mouse over it to peek</span><span className="tc">Tap to move the lens</span></span>}
    </div>
  )
}

/* ---------- 3. What does your wallet show? ---------- */

const ago = (t: number | null) => {
  if (!t) return ''
  const s = Math.max(1, Math.round((Date.now() - t) / 1000))
  if (s < 90) return s + ' s ago'
  if (s < 5400) return Math.round(s / 60) + ' min ago'
  if (s < 129600) return Math.round(s / 3600) + ' h ago'
  return Math.round(s / 86400) + ' days ago'
}
// Our own deployer wallet. It is public, listed in the docs, and has plenty of history to show.
const EXAMPLE = '0xd16863014B75dfA19149E8db6078B17525021594'

export function WalletCheck() {
  const { s } = useStore()
  const [v, setV] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [res, setRes] = useState<Seen | null>(null)
  const check = async (a = v) => {
    const t = a.trim(); setV(t); setErr('')
    if (!validAddress(t)) { setErr('That doesn’t look like a wallet address. It should start with 0x and be 42 characters long.'); return }
    setBusy(true)
    try { setRes(await lookup(t)) } catch { setErr('Couldn’t reach Robinhood Chain just now. Try again in a moment.') }
    setBusy(false)
  }
  const value = res ? res.holdings.reduce((t, h) => t + h.amount * (token(h.symbol).price || 0), 0) : 0
  const priced = res ? res.holdings.some(h => token(h.symbol).price > 0) : false
  return (
    <section className="lsec wcheck" id="check">
      <h2><span>What does</span> your wallet show?</h2>
      <p className="lsub">Paste your Robinhood Chain address. This is what anyone can see about it, straight from public data.</p>
      <form className="wc-form" onSubmit={e => { e.preventDefault(); void check() }}>
        <input value={v} onChange={e => setV(e.target.value)} placeholder="0x…" spellCheck={false} autoComplete="off" aria-label="Wallet address" />
        <button className="btn light" disabled={busy}>{busy ? 'Looking…' : 'Check'}</button>
      </form>
      <div className="wc-alt">
        {s.wallet && <button onClick={() => void check(s.wallet!)}>Use my connected wallet</button>}
        <button onClick={() => void check(EXAMPLE)}>Try an example wallet</button>
      </div>
      {err && <p className="wc-err">{err}</p>}
      {res && (
        <div className="wc-out" key={res.address}>
          <div className="card wc-pub">
            <span className="tagl"><i className="a" />What anyone can see</span>
            <div className="wc-who"><b>{short(res.address)}</b><span>{res.transfers ? `${res.transfers} token transfers on record` : 'No token transfers found'}{priced && value > 0 ? ` · about $${fmt(value)} in tokens` : ''}</span></div>
            <div className="wc-h">Holdings</div>
            {res.holdings.length ? res.holdings.map(h => (
              <div className="row" key={h.symbol}><TokenIcon symbol={h.symbol} /><div className="g"><b>{token(h.symbol).name}</b><span>{h.symbol}</span></div>
                <div className="r"><b>{fmt(h.amount, h.symbol === 'USDG' ? 2 : 4)} {h.symbol}</b>{token(h.symbol).price > 0 && <span>${fmt(h.amount * token(h.symbol).price)}</span>}</div></div>
            )) : <p className="wc-none">No USDG or stock tokens right now.</p>}
            <div className="wc-h">Recent activity</div>
            {res.activity.length ? res.activity.map((a, i) => (
              <div className="row" key={i}><span className="ai"><Icon name={a.incoming ? 'down' : 'up'} /></span><div className="g"><b>{a.label}</b><span>{ago(a.time)}</span></div>
                <div className="r"><b>{a.incoming ? '+' : '−'}{fmt(a.amount, a.symbol === 'USDG' ? 2 : 4)} {a.symbol}</b></div></div>
            )) : <p className="wc-none">{res.partial ? 'The history couldn’t be read just now.' : 'Nothing in the recent history.'}</p>}
          </div>
          <div className="card dark wc-priv">
            <span className="tagl"><i className="b" />The same wallet, on Hagi</span>
            <div className="wc-who"><b><Censor seed={res.address} cols={9} cell={11} onDark /></b><span>Inside the vault, balances and sends are unreadable to everyone but you.</span></div>
            <div className="wc-h">Holdings</div>
            {(res.holdings.length ? res.holdings : [{ symbol: 'USDG', amount: 0 }, { symbol: 'TSLA', amount: 0 }]).map((h, i) => (
              <div className="row" key={i}><span className="ti ph" /><div className="g"><b><Censor seed={h.symbol + 'n'} cols={6} cell={9} onDark /></b></div><div className="r"><b><Censor seed={h.symbol + 'v'} cols={8} cell={9} onDark /></b></div></div>
            ))}
            <div className="wc-h">Recent activity</div>
            {(res.activity.length ? res.activity.slice(0, 4) : [0, 1]).map((_, i) => (
              <div className="row" key={i}><span className="ai"><Icon name="right" /></span><div className="g"><b>A private transaction</b><span>Amount and other side hidden</span></div><div className="r"><b><Censor seed={'a' + i} cols={6} cell={9} onDark /></b></div></div>
            ))}
            <p className="wc-note">Deposits into the vault and withdrawals out of it still show on chain. What happens inside doesn’t.</p>
          </div>
        </div>
      )}
    </section>
  )
}

/* ---------- 4. A private swap, told by scrolling ---------- */

const STEPS: [string, string][] = [
  ['Your USDG is already in the vault.', 'You shielded it earlier. To the chain it’s one receipt among many.'],
  ['You ask for a swap.', 'Your browser builds a proof that you own enough, without pointing at which receipts are yours.'],
  ['The trade happens inside the vault.', 'The vault trades with the pool and writes you a new receipt for the Tesla.'],
  ['A relayer sends it.', 'Your wallet never signs the transaction, so it never appears on it.'],
  ['The world sees a swap.', 'Nobody sees you.'],
]

export function SwapStory() {
  const ref = useRef<HTMLElement>(null)
  const [step, setStep] = useState(0)
  useEffect(() => {
    const f = () => {
      const el = ref.current; if (!el) return
      // Both measured the same way, so page zoom can't throw the steps off.
      const r = el.getBoundingClientRect()
      const span = r.height - (el.querySelector('.st-stick')?.getBoundingClientRect().height ?? innerHeight)
      const p = Math.min(0.999, Math.max(0, -r.top / Math.max(1, span)))
      setStep(Math.floor(p * STEPS.length))
    }
    // The picture is drawn at 760 by 540 and scaled to whatever room it has.
    const fit = () => {
      const el = ref.current; if (!el) return
      const viz = el.querySelector<HTMLElement>('.st-viz'); const stick = el.querySelector<HTMLElement>('.st-stick'); if (!viz || !stick) return
      const wide = innerWidth > 1000
      const room = wide ? stick.clientWidth - 430 - 50 - 112 : stick.clientWidth - 36
      const tall = wide ? stick.clientHeight - 60 : stick.clientHeight * 0.7
      viz.style.setProperty('--k', String(Math.min(wide ? 1.3 : 1, room / viz.offsetWidth, tall / viz.offsetHeight)))
    }
    const all = () => { f(); fit() }
    all(); addEventListener('scroll', f, { passive: true }); addEventListener('resize', all)
    return () => { removeEventListener('scroll', f); removeEventListener('resize', all) }
  }, [])
  return (
    <section className="story" ref={ref} id="how">
      <div className="st-stick">
        <div className="st-txt">
          <span className="st-k">How a private swap works</span>
          <ol>{STEPS.map(([h, p], i) => <li key={h} className={i === step ? 'on' : i < step ? 'done' : ''}><b>{h}</b><span>{p}</span></li>)}</ol>
        </div>
        <div className="st-viz" data-step={step}>
          <div className="sv-wallet"><span className="av" /><span><b>Your wallet</b><small>0x7a3f…91ce</small></span></div>
          <div className="sv-cut"><Icon name="close" size={16} /></div>
          <div className="sv-proof"><Icon name="check" size={15} />Proof built</div>
          <div className="sv-vault">
            <span className="sv-vl">Hagi vault</span>
            {Array.from({ length: 16 }, (_, i) => <i key={i} className="sv-dot" style={{ left: (8 + (i * 37) % 84) + '%', top: (12 + (i * 53) % 74) + '%', width: 14 + (i % 4) * 7, height: 14 + (i % 4) * 7 }} />)}
            <div className="sv-coin"><div className="f a"><TokenIcon symbol="USDG" size={96} /></div><div className="f b"><TokenIcon symbol="TSLA" size={96} /></div></div>
            <div className="sv-amt"><span className="sa">500.00 USDG</span><span className="sb">1.4192 TSLA</span></div>
          </div>
          <div className="sv-line" />
          <div className="sv-relay"><span className="ic"><Icon name="right" size={18} /></span><span><b>Relayer</b><small>sends the swap</small></span></div>
          <div className="sv-chain"><span className="sv-k">On chain</span><div><span className="who"><Censor seed="story" cols={6} cell={10} onDark /></span><span><b>Someone swapped</b><small>500 USDG for 1.4192 TSLA</small></span></div></div>
        </div>
      </div>
    </section>
  )
}

/* ---------- 5. Build a basket ---------- */

/** Turns raw slider values into whole percentages that add up to exactly 100. */
function percents(w: Record<string, number>) {
  const keys = Object.keys(w); const sum = keys.reduce((t, k) => t + w[k], 0) || 1
  const raw = keys.map(k => ({ k, v: (w[k] / sum) * 100 }))
  const out: Record<string, number> = {}; raw.forEach(r => (out[r.k] = Math.max(1, Math.floor(r.v))))
  let left = 100 - Object.values(out).reduce((a, b) => a + b, 0)
  raw.sort((a, b) => (b.v % 1) - (a.v % 1))
  for (let i = 0; left > 0; i = (i + 1) % raw.length, left--) out[raw[i].k]++
  for (let i = 0; left < 0; i = (i + 1) % raw.length) if (out[raw[i].k] > 1) { out[raw[i].k]--; left++ }
  return out
}

export function BasketBuilder({ colors }: { colors: string[] }) {
  const [w, setW] = useState<Record<string, number>>({ TSLA: 60, AMD: 40 })
  const [name, setName] = useState('')
  const picked = STOCKS.map(s => s.symbol).filter(k => k in w)
  const pct = percents(w)
  const toggle = (k: string) => { const n = { ...w }; if (k in n) { if (picked.length > 2) delete n[k] } else n[k] = 30; setW(n) }
  const make = () => go('baskets?name=' + encodeURIComponent(name.trim() || 'My basket') + '&mix=' + picked.map(k => k + ':' + pct[k]).join(','))
  return (
    <div className="bb card">
      <div className="bb-ctl">
        <span className="bb-k">Build your own</span>
        <input className="bb-name" value={name} onChange={e => setName(e.target.value)} placeholder="Name your basket" maxLength={32} aria-label="Basket name" />
        <div className="bb-pick">{STOCKS.map(s => (
          <button key={s.symbol} className={'chip' + (s.symbol in w ? ' on' : '')} onClick={() => toggle(s.symbol)} aria-pressed={s.symbol in w}><TokenIcon symbol={s.symbol} size={24} />{s.symbol}</button>
        ))}</div>
        <div className="bb-sl">{picked.map(k => (
          <label key={k}><span>{k}</span><input type="range" min={1} max={100} value={w[k]} onChange={e => setW({ ...w, [k]: Number(e.target.value) })} aria-label={k + ' weight'} /><b>{pct[k]}%</b></label>
        ))}</div>
      </div>
      <div className="bb-prev">
        <div className="st">{picked.slice(0, 5).map(k => <TokenIcon key={k} symbol={k} size={40} />)}</div>
        <div className="bn">{name.trim() || 'My basket'}</div>
        <div className="bm">{picked.length} stocks · {picked.map(k => k + ' ' + pct[k]).join(' · ')}</div>
        <div className="mixbar">{picked.map((k, i) => <i key={k} style={{ width: pct[k] + '%', background: colors[i % colors.length] }} />)}</div>
        <button className="btn light" onClick={make}>Make this basket</button>
        <small>Opens the app with your mix filled in. A basket can’t be changed once it’s made.</small>
      </div>
    </div>
  )
}
