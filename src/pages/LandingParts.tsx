import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { STOCKS, fmt, short, token } from '../data'
import { lookup, validAddress, type Seen } from '../lookup'
import { go } from '../nav'
import { useStore } from '../store'
import { Censor, Icon, TokenIcon } from '../ui'

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const hoverable = () => matchMedia('(hover: hover) and (pointer: fine)').matches

/* ---------- 2. Privacy lens over the preview ---------- */

/** Wraps the preview. In the public view, a circle follows the pointer and shows the real numbers under it.
 *  On touch screens with no pointer, the lens drifts by itself, and a tap moves it. */
export function Lens({ active: wanted, children, reveal }: { active: boolean; children: ReactNode; reveal: ReactNode }) {
  // Phones keep the simpler landing page, so the lens is for larger screens only.
  const [phone, setPhone] = useState(() => matchMedia('(max-width: 700px)').matches)
  useEffect(() => { const q = matchMedia('(max-width: 700px)'); const f = () => setPhone(q.matches); q.addEventListener('change', f); return () => q.removeEventListener('change', f) }, [])
  const active = wanted && !phone
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

/* ---------- 5. Paint a basket: 100 pixels, 100 percent ---------- */

// One colour per stock, picked to sit well on navy and stay distinct from each other.
const PAINT: Record<string, string> = { TSLA: '#ffffff', AMD: '#566eba', AMZN: '#e0a23a', NFLX: '#b0a7b8', PLTR: '#8fd0c0' }
const fill = (mix: [string, number][]) => mix.flatMap(([k, n]) => Array<string>(n).fill(k))

export function BasketBuilder() {
  const [cells, setCells] = useState<string[]>(() => fill([['TSLA', 60], ['AMD', 40]]))
  const [brush, setBrush] = useState('AMZN')
  const [name, setName] = useState('')
  const painting = useRef(false)
  const grid = useRef<HTMLDivElement>(null)
  const count: Record<string, number> = {}
  cells.forEach(k => (count[k] = (count[k] ?? 0) + 1))
  const mix = STOCKS.map(s => s.symbol).filter(k => count[k]).sort((a, b) => count[b] - count[a])
  const ok = mix.length >= 2
  const paintAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    const i = el?.dataset.i
    if (i === undefined || !grid.current?.contains(el)) return
    setCells(c => (c[+i] === brush ? c : c.map((v, j) => (j === +i ? brush : v))))
  }
  const even = () => { const ks = mix.length >= 2 ? mix : STOCKS.slice(0, 2).map(s => s.symbol); const base = Math.floor(100 / ks.length); setCells(fill(ks.map((k, i) => [k, base + (i < 100 - base * ks.length ? 1 : 0)]))) }
  const shuffle = () => {
    const ks = [...STOCKS.map(s => s.symbol)].sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 3))
    const raw = ks.map(() => 1 + Math.random() * 4); const sum = raw.reduce((a, b) => a + b, 0)
    const n = raw.map(r => Math.max(1, Math.round((r / sum) * 100))); n[0] += 100 - n.reduce((a, b) => a + b, 0)
    setCells(fill(ks.map((k, i) => [k, n[i]] as [string, number])).sort(() => Math.random() - 0.5))
  }
  const make = () => go('baskets?name=' + encodeURIComponent(name.trim() || 'My basket') + '&mix=' + mix.map(k => k + ':' + count[k]).join(','))
  return (
    <div className="bb card">
      <div className="bb-art">
        <div className="bb-grid" ref={grid} role="img" aria-label={'Basket mix: ' + mix.map(k => k + ' ' + count[k] + '%').join(', ')}
          onPointerDown={e => { painting.current = true; (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); paintAt(e.clientX, e.clientY) }}
          onPointerMove={e => { if (painting.current) paintAt(e.clientX, e.clientY) }}
          onPointerUp={() => (painting.current = false)} onPointerLeave={() => (painting.current = false)}>
          {cells.map((k, i) => <i key={i} data-i={i} style={{ background: PAINT[k], ['--d' as string]: ((i * 37) % 100) * 9 + 'ms' }} />)}
        </div>
        <span className="bb-cap">100 pixels, 100 percent. Pick a stock, then paint.</span>
      </div>
      <div className="bb-ctl">
        <span className="bb-k">Paint your basket</span>
        <input className="bb-name" value={name} onChange={e => setName(e.target.value)} placeholder="Name it" maxLength={32} aria-label="Basket name" />
        <div className="bb-brush" role="radiogroup" aria-label="Pick a stock to paint with">{STOCKS.map(s => (
          <button key={s.symbol} role="radio" aria-checked={brush === s.symbol} className={'bb-b' + (brush === s.symbol ? ' on' : '')} onClick={() => setBrush(s.symbol)} style={{ ['--c' as string]: PAINT[s.symbol] }}>
            <TokenIcon symbol={s.symbol} size={30} /><span>{s.symbol}</span><i />
          </button>
        ))}</div>
        <div className="bb-legend">{mix.map(k => (
          <div key={k}><i style={{ background: PAINT[k] }} /><span>{token(k).name}</span><b>{count[k]}%</b></div>
        ))}</div>
        <div className="bb-tools"><button onClick={shuffle}>Shuffle</button><button onClick={even}>Split evenly</button></div>
        <button className="btn light" disabled={!ok} onClick={make}>{ok ? 'Make this basket' : 'Paint at least two stocks'}</button>
        <small>Opens the app with your mix filled in. Once it’s made, nobody can change it.</small>
      </div>
    </div>
  )
}
