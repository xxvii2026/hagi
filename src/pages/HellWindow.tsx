// HELL window (hellwindow.hagitrade.xyz): a live count of every $HAGI burned and every buyback, straight from the chain.
import { useEffect, useState } from 'react'
import { Mark } from '../ui'
import BUYBACKS from '../buybacks.json'
import './hell.css'

const SCAN = 'https://robin.etherscan.io'
const CA = '0x4643d8eaa4adc2ce361331b831ea6335742a29a1'
type Feed = { start: number; supply: number; burned: number; circulating: number; burns: { tx: string; amount: number; at: string }[]; at: number }

const big = (v: number) => v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v.toFixed(0)
const full = (v: number) => Math.round(v).toLocaleString('en-US')
const day = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

// Counts up to the new value instead of jumping.
function useCount(target: number) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0; const from = v, t0 = performance.now()
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 1400); setV(from + (target - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf)
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps
  return v
}

export default function HellWindow() {
  const [f, setF] = useState<Feed | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    document.title = 'HELL window · Hagi'; document.body.style.background = '#070818'; document.documentElement.style.overflowX = 'hidden'
    const load = () => fetch('/api/hell').then(r => r.ok ? r.json() : Promise.reject()).then(j => { setF(j); setErr(false) }).catch(() => setErr(true))
    load(); const t = setInterval(load, 30000); return () => clearInterval(t)
  }, [])
  const burned = useCount(f?.burned ?? 0)
  const bbEth = BUYBACKS.reduce((a, b) => a + b.eth, 0), bbHagi = BUYBACKS.reduce((a, b) => a + b.hagi, 0)
  const pct = f ? (f.burned / f.start) * 100 : 0

  return (
    <div className="hell">
      <header><a href="https://hagitrade.xyz" className="hl-lg"><Mark leaf="#ffffff" block="#8f9fdc" size={26} />hagi</a><a className="hl-buy" href={`https://ponsfamily.com/launchpad/${CA}`} target="_blank" rel="noopener noreferrer">Buy $HAGI</a></header>

      <section className="hl-hero">
        <div className="hl-win"><i className="e1" /><i className="e2" /><i className="e3" />
          <div className="hl-num">{f ? big(burned) : err ? '–' : '···'}</div>
          <div className="hl-unit">$HAGI burned</div>
        </div>
        <h1>HELL window</h1>
        <p>Every $HAGI we buy back and burn, counted live from Robinhood Chain.</p>
      </section>

      <section className="hl-stats">
        <div><b>{f ? pct.toFixed(2) + '%' : '–'}</b><span>of supply gone</span></div>
        <div><b>{BUYBACKS.length}</b><span>buybacks done</span></div>
        <div><b>{bbEth.toFixed(2)} ETH</b><span>spent buying back</span></div>
        <div><b>{f ? big(f.circulating) : '–'}</b><span>$HAGI left</span></div>
      </section>

      <section className="hl-log">
        <h2>Buybacks</h2>
        {[...BUYBACKS].reverse().map(b => (
          <div className="hl-row" key={'b' + b.n}><span className="hl-tag">#{b.n}</span><span>{b.eth} ETH for {full(b.hagi)} $HAGI</span><span className="hl-d">{day(b.date)}</span>
            {b.tx ? <a href={`${SCAN}/tx/${b.tx}`} target="_blank" rel="noopener noreferrer">View tx</a> : <span className="hl-d">tx soon</span>}</div>
        ))}
        <h2>Burns</h2>
        {f && f.burns.length === 0 && <p className="hl-empty">No burns yet. The first one lands here.</p>}
        {f?.burns.map(b => (
          <div className="hl-row" key={b.tx}><span className="hl-tag fire">Burn</span><span>{full(b.amount)} $HAGI</span><span className="hl-d">{b.at ? day(b.at) : ''}</span><a href={`${SCAN}/tx/${b.tx}`} target="_blank" rel="noopener noreferrer">View tx</a></div>
        ))}
        {err && <p className="hl-empty">Can’t reach Robinhood Chain right now. Trying again in a bit.</p>}
      </section>

      <footer>Read straight from the $HAGI contract <a href={`${SCAN}/token/${CA}`} target="_blank" rel="noopener noreferrer">{CA.slice(0, 6)}…{CA.slice(-4)}</a>. Updates every 30 seconds.</footer>
    </div>
  )
}
