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

const PAGES = ['portfolio', 'swap', 'baskets', 'send', 'activity'] as const
const ROUTES = ['home', ...PAGES] as const
type Page = (typeof ROUTES)[number]
const read = (): Page => { const h = location.hash.replace('#/', '').split('?')[0]; return (ROUTES as readonly string[]).includes(h) ? (h as Page) : 'home' }

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

function Welcome() {
  const { s, api } = useStore()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const step = !s.wallet ? 0 : 1
  const act = async () => {
    setBusy(true); setErr('')
    try {
      if (!s.wallet) { await api.connect(); if (engine.hasCachedKey()) await api.unlock() }
      else await api.unlock()
    } catch (e) { setErr(engine.friendly(e)) }
    setBusy(false)
  }
  const steps = [
    ['Connect your wallet', engine.hasWallet() ? 'Use the wallet you already have. Hagi never holds your keys.' : 'No wallet found. Install MetaMask, or on a phone open this page inside your wallet app’s browser.'],
    ['Create your Hagi account', 'Sign one free message. The same wallet always recovers the same account, so there is nothing new to back up.'],
    ['Add test funds', 'Claim free test USDG in the app, then shield it to start.'],
  ]
  return (
    <div className="wrap welcome">
      <Card>
        <Mark size={44} />
        <h1><span>Stocks,</span> off the record.</h1>
        <p className="muted">Keep your stock balance private on Robinhood Chain. Setting up takes under a minute.</p>
        <ol className="setup">{steps.map(([t, p], i) => <li key={t} className={i < step ? 'd' : i === step ? 'a' : ''}><i>{i < step ? <Icon name="check" size={15} /> : i + 1}</i><div><b>{t}</b><span>{p}</span></div></li>)}</ol>
        <button className="btn" onClick={act} disabled={busy || !engine.hasWallet()}>{busy ? 'Check your wallet…' : step === 0 ? 'Connect wallet' : 'Create my Hagi account'}</button>
        {err && <p className="err">{err}</p>}
        <a className="link center" href={FAUCET_URL} target="_blank" rel="noopener noreferrer">Need testnet ETH for gas? Open the faucet</a>
      </Card>
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

  return (
    <>
      <div className="demo">Testnet preview. These tokens have no value, and nothing here has been audited.</div>
      <header className="nav">
        <a className="lg" href="#/home"><Mark leaf={dark ? '#ffffff' : undefined} />hagi</a>
        <nav className="links">{page === 'home'
          ? [['private', 'What’s private'], ['baskets', 'Baskets'], ['faq', 'Questions']].map(([id, t]) => <button key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })}>{t}</button>)
          : ready && PAGES.map(p => <a key={p} href={'#/' + p} className={p === page ? 'on' : ''}>{p[0].toUpperCase() + p.slice(1)}</a>)}</nav>
        <div className="rt">
          <span className="net"><i className={s.offline ? 'off' : ''} />{s.offline ? 'Can’t reach the chain' : s.syncing ? 'Syncing' : 'Testnet'}</span>
          {page === 'home' ? <a className="wal" href="#/portfolio">Open the app</a> : null}
          {s.wallet && page !== 'home' ? <WalletMenu /> : null}
        </div>
      </header>
      <main>
        {page === 'home' ? <Landing /> : !ready ? <Welcome /> : page === 'swap' ? <Swap run={run} /> : page === 'baskets' ? <Baskets run={run} /> : page === 'send' ? <Send run={run} /> : page === 'activity' ? <Activity /> : <Portfolio run={run} />}
      </main>
      {page !== 'home' && <footer className="foot"><span className="fm"><Mark size={18} /><b>hagi</b><span>Stocks, off the record.</span></span><span className="fl2"><a href={FAUCET_URL} target="_blank" rel="noopener noreferrer">Faucet</a><a href="https://explorer.testnet.chain.robinhood.com" target="_blank" rel="noopener noreferrer">Explorer</a><span>Robinhood Chain Testnet</span></span></footer>}
      {job && <Progress title={job.title} task={job.task} doneText={job.done} onClose={closeJob} />}
    </>
  )
}
