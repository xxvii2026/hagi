import { useCallback, useEffect, useRef, useState } from 'react'
import { FAUCET_URL } from './chain'
import * as engine from './engine'
import { short } from './data'
import { useStore } from './store'
import { Card, Icon, Mark, Progress, type Step } from './ui'
import { Portfolio } from './pages/Portfolio'
import { Swap } from './pages/Swap'
import { Baskets } from './pages/Baskets'
import { Send } from './pages/Send'
import { Activity } from './pages/Activity'
import { Landing } from './pages/Landing'
import { Docs } from './pages/Docs'
import { CONNECT_EVENT, TOUR_EVENT, askConnect, startTour } from './gate'
import { TOUR_KEY, Tour } from './Tour'

const PAGES = ['portfolio', 'swap', 'baskets', 'send', 'activity'] as const
const ROUTES = ['home', 'docs', ...PAGES] as const
type Page = (typeof ROUTES)[number]
const read = (): Page => { const h = location.hash.replace('#/', '').split('?')[0].split('/')[0]; return (ROUTES as readonly string[]).includes(h) ? (h as Page) : 'home' }

/** The wallet pill opens a small menu for the things that are not everyday actions. */
function WalletMenu() {
  const { s, api } = useStore()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  const copy = async () => { try { await navigator.clipboard.writeText(s.hagiAddress ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ } }
  const exportHistory = () => {
    const blob = new Blob([JSON.stringify({ account: s.hagiAddress, exportedAt: new Date().toISOString(), activity: s.activity }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hagi-history.json'; a.click(); URL.revokeObjectURL(a.href)
    setOpen(false)
  }
  return (
    <div className="tpw" ref={box}>
      <button className="wal" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}><i />{short(s.wallet!)}<Icon name="chevron" size={13} /></button>
      {open && (
        <ul className="tpl menu" role="menu">
          {s.hagiAddress && <li><button onClick={copy}><span className="g"><b>{copied ? 'Copied' : 'Copy my Hagi address'}</b><span>{s.hagiAddress.slice(0, 12)}…{s.hagiAddress.slice(-6)}</span></span><Icon name="copy" size={15} /></button></li>}
          <li><button onClick={exportHistory} disabled={!s.activity.length}><span className="g"><b>Export my history</b><span>{s.activity.length ? 'Downloads your activity as a file' : 'Nothing to export yet'}</span></span></button></li>
          <li><button onClick={() => { setOpen(false); api.disconnect() }}><span className="g"><b>Disconnect</b><span>Locks your Hagi account on this tab</span></span></button></li>
        </ul>
      )}
    </div>
  )
}

/** A short note in the corner, used when funds arrive. */
function Toasts() {
  const [list, setList] = useState<{ id: number; title: string; sub?: string }[]>([])
  useEffect(() => {
    const f = (e: Event) => {
      const t = { id: Date.now() + Math.random(), ...(e as CustomEvent<{ title: string; sub?: string }>).detail }
      setList(l => [...l, t].slice(-3)); setTimeout(() => setList(l => l.filter(x => x.id !== t.id)), 5000)
    }
    addEventListener('hagi-toast', f); return () => removeEventListener('hagi-toast', f)
  }, [])
  return <div className="toasts" aria-live="polite">{list.map(t => <div className="toast" key={t.id}><span className="ti2"><Icon name="down" size={16} /></span><span><b>{t.title}</b>{t.sub && <em>{t.sub}</em>}</span></div>)}</div>
}

/** Connecting is a window over the page, opened by any action that needs an account. */
function ConnectModal({ onClose }: { onClose: () => void }) {
  const { s, api } = useStore()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const step = !s.wallet ? 0 : !s.hagiAddress ? 1 : 2
  const act = async () => {
    setBusy(true); setErr('')
    // One click does both: connect, then ask for the free signature straight away.
    try { if (!s.wallet) await api.connect(); await api.unlock() } catch (e) { setErr(engine.friendly(e)) }
    setBusy(false)
  }
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }; addEventListener('keydown', esc); return () => removeEventListener('keydown', esc) }, [busy, onClose])
  const steps = [
    ['Connect your wallet', engine.hasWallet() ? 'Use the wallet you already have. Hagi never holds your keys.' : 'No wallet found. Install MetaMask, or on a phone open this page inside your wallet app’s browser.'],
    ['Sign in', 'Sign one free message. The first time, this creates your Hagi account. After that it signs you back in. There’s nothing new to back up.'],
    ['Add test funds', 'Claim free test USDG on the Portfolio page, then shield it.'],
  ]
  return (
    <div className="overlay" onClick={() => !busy && onClose()}>
      <div className="modal wide connect" onClick={e => e.stopPropagation()}>
        <div className="ch"><Mark size={34} /><button className="x" onClick={onClose} aria-label="Close" disabled={busy}><Icon name="close" size={15} /></button></div>
        <h3><span>Stocks,</span> off the record.</h3>
        <p className="muted">Setting up takes under a minute.</p>
        <ol className="setup">{steps.map(([t, p], i) => <li key={t} className={i < step ? 'd' : i === step ? 'a' : ''}><i>{i < step ? <Icon name="check" size={15} /> : i + 1}</i><div><b>{t}</b><span>{p}</span></div></li>)}</ol>
        <button className="btn" onClick={act} disabled={busy || !engine.hasWallet()}>{busy ? 'Check your wallet…' : step === 0 ? 'Connect wallet' : 'Sign in'}</button>
        {err && <p className="err">{err}</p>}
        <a className="link center" href={FAUCET_URL} target="_blank" rel="noopener noreferrer">Need testnet ETH for gas? Open the faucet</a>
      </div>
    </div>
  )
}

export default function App() {
  const { s, api } = useStore()
  const [page, setPage] = useState<Page>(read)
  const [job, setJob] = useState<{ title: string; task: (step: Step) => Promise<void>; done?: string } | null>(null)
  const [, setTick] = useState(0)
  useEffect(() => { const f = () => { setPage(read()); setTick(t => t + 1) }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  const dark = page === 'home'
  const run = useCallback((title: string, task: (step: Step) => Promise<void>, done?: string) => setJob({ title, task, done }), [])
  const closeJob = useCallback(() => setJob(null), [])
  const ready = !!s.wallet && !!s.hagiAddress
  const app = page !== 'home' && page !== 'docs'
  // The connect window opens from anywhere and closes itself once the account is ready.
  const [connecting, setConnecting] = useState(false)
  useEffect(() => { const f = () => setConnecting(true); addEventListener(CONNECT_EVENT, f); return () => removeEventListener(CONNECT_EVENT, f) }, [])
  useEffect(() => { if (ready) setConnecting(false) }, [ready])
  // The tour runs once on a first visit to the Portfolio page, and again from the help button.
  const [touring, setTouring] = useState(false)
  useEffect(() => {
    const f = () => { if (read() !== 'portfolio') location.hash = '#/portfolio'; setTimeout(() => setTouring(true), 350) }
    addEventListener(TOUR_EVENT, f); return () => removeEventListener(TOUR_EVENT, f)
  }, [])
  useEffect(() => {
    let seen = true; try { seen = !!localStorage.getItem(TOUR_KEY) } catch { /* show it */ }
    if (page === 'portfolio' && !seen) { const t = setTimeout(() => setTouring(true), 700); return () => clearTimeout(t) }
  }, [page])

  return (
    <>
      <header className="nav">
        <a className="lg" href="#/home"><Mark leaf={dark ? '#ffffff' : undefined} secret />hagi</a>
        <nav className="links">{page === 'home'
          ? <>{[['check', 'Check your wallet'], ['how', 'How it works'], ['baskets', 'Baskets'], ['faq', 'Questions']].map(([id, t]) => <button key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })}>{t}</button>)}<a href="#/docs">Docs</a></>
          : <>{PAGES.map(p => <a key={p} href={'#/' + p} className={p === page ? 'on' : ''}>{p[0].toUpperCase() + p.slice(1)}</a>)}<a href="#/docs" className={page === 'docs' ? 'on' : ''}>Docs</a></>}</nav>
        <div className="rt">
          {app && <button className="help" onClick={startTour} aria-label="Take the tour" title="Take the tour">?</button>}
          {app && <span className="net"><i className={s.offline ? 'off' : ''} />{s.offline ? 'Can’t reach the chain' : s.syncing ? 'Syncing' : 'Testnet'}</span>}
          {page === 'home' ? <a className="wal" href="#/portfolio">Open the app</a>
            : ready ? <WalletMenu />
            : <button className="wal" onClick={askConnect}><i /><span className="t-long">{s.wallet ? 'Sign in' : 'Connect wallet'}</span><span className="t-short">{s.wallet ? 'Sign in' : 'Connect'}</span></button>}
        </div>
      </header>
      <main key={page} className="pg">
        {page === 'home' ? <Landing /> : page === 'docs' ? <Docs /> : page === 'swap' ? <Swap run={run} /> : page === 'baskets' ? <Baskets run={run} /> : page === 'send' ? <Send run={run} /> : page === 'activity' ? <Activity /> : <Portfolio run={run} />}
      </main>
      {page !== 'home' && <footer className="foot"><span className="fm"><Mark size={18} /><b>hagi</b><span>Stocks, off the record.</span></span><span className="fl2"><a href="#/docs">Docs</a><a href={FAUCET_URL} target="_blank" rel="noopener noreferrer">Faucet</a><a href="https://explorer.testnet.chain.robinhood.com" target="_blank" rel="noopener noreferrer">Explorer</a><span>Robinhood Chain Testnet</span></span></footer>}
      <Toasts />
      {connecting && <ConnectModal onClose={() => setConnecting(false)} />}
      {touring && <Tour onClose={() => setTouring(false)} />}
      {job && <Progress title={job.title} task={job.task} doneText={job.done} onClose={closeJob} />}
    </>
  )
}
