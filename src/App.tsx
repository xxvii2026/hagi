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
import { InstallCard, isStandalone } from './install'
import { PasskeyError, passkeysSupported } from './passkey'
import { Intro } from './Intro'
import type { IconName } from './ui'

const PAGES = ['portfolio', 'swap', 'baskets', 'send', 'activity'] as const
const ROUTES = ['home', 'docs', ...PAGES] as const
// The phone tab bar: the same pages, with icons.
const TABS: [typeof PAGES[number], string, IconName][] = [['portfolio', 'Portfolio', 'wallet'], ['swap', 'Swap', 'swap'], ['baskets', 'Baskets', 'basket'], ['send', 'Send', 'send'], ['activity', 'Activity', 'clock']]
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
  const [walletCopied, setWalletCopied] = useState(false)
  const copyWallet = async () => { try { await navigator.clipboard.writeText(s.wallet ?? ''); setWalletCopied(true); setTimeout(() => setWalletCopied(false), 1500) } catch { /* clipboard blocked */ } }
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
          {engine.isPasskey() && <li><button onClick={copyWallet}><span className="g"><b>{walletCopied ? 'Copied' : 'Copy wallet address'}</b><span>Your built-in wallet, for test ETH and tokens</span></span><Icon name="copy" size={15} /></button></li>}
          <li><button onClick={exportHistory} disabled={!s.activity.length}><span className="g"><b>Export my history</b><span>{s.activity.length ? 'Downloads your activity as a file' : 'Nothing to export yet'}</span></span></button></li>
          <li className="m-only"><button onClick={() => { setOpen(false); startTour() }}><span className="g"><b>Take the tour</b><span>A quick walk through Hagi</span></span></button></li>
          <li className="m-only"><a href="#/docs" onClick={() => setOpen(false)}><span className="g"><b>Docs</b><span>How Hagi works, in plain words</span></span></a></li>
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

/** Signing in is a window over the page, opened by any action that needs an account.
 *  A passkey is the main way in. A browser wallet is the alternative. */
function ConnectModal({ onClose }: { onClose: () => void }) {
  const { s, api } = useStore()
  const [busy, setBusy] = useState<'' | 'new' | 'have' | 'wallet'>('')
  const [err, setErr] = useState('')
  const go = async (which: 'new' | 'have' | 'wallet') => {
    setBusy(which); setErr('')
    try {
      if (which === 'wallet') { if (!s.wallet) await api.connect(); await api.unlock() }
      else await api.passkey(which === 'new')
    } catch (e) { setErr(e instanceof PasskeyError ? e.message : engine.friendly(e)) }
    setBusy('')
  }
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }; addEventListener('keydown', esc); return () => removeEventListener('keydown', esc) }, [busy, onClose])
  const walletHalfway = !!s.wallet && !s.hagiAddress && !engine.isPasskey()
  // A passkey made or used on this device before means this person already has an account: just sign in.
  const [hasPasskey] = useState(() => { try { return !!localStorage.getItem('hagi-has-passkey') } catch { return false } })
  return (
    <div className="overlay" onClick={() => !busy && onClose()}>
      <div className="modal wide connect" onClick={e => e.stopPropagation()}>
        <div className="ch"><Mark size={34} /><button className="x" onClick={onClose} aria-label="Close" disabled={!!busy}><Icon name="close" size={15} /></button></div>
        <h3><span>Stocks,</span> off the record.</h3>
        <p className="muted">{hasPasskey ? 'Welcome back. Use your Face ID, fingerprint or screen lock to open your account.' : 'No wallet, no email. Your Face ID, fingerprint or screen lock is your key, and it never leaves this device.'}</p>
        {walletHalfway ? (
          <button className="btn" onClick={() => go('wallet')} disabled={!!busy}>{busy ? 'Check your wallet…' : 'Sign in with your wallet'}</button>
        ) : hasPasskey ? <>
          <button className="btn pk" onClick={() => go('have')} disabled={!!busy || !passkeysSupported()}><Icon name="lock" size={17} />{busy === 'have' ? 'Checking your passkey…' : 'Sign in with passkey'}</button>
        </> : <>
          <button className="btn pk" onClick={() => go('new')} disabled={!!busy || !passkeysSupported()}><Icon name="lock" size={17} />{busy === 'new' ? 'Creating your passkey…' : 'Create my Hagi account'}</button>
          <button className="btn o pk2" onClick={() => go('have')} disabled={!!busy || !passkeysSupported()}>{busy === 'have' ? 'Checking your passkey…' : 'Sign in with passkey'}</button>
        </>}
        {!walletHalfway && engine.hasWallet() && <>
          <div className="or"><span>or</span></div>
          <button className="link center" onClick={() => go('wallet')} disabled={!!busy || !engine.hasWallet()}>{busy === 'wallet' ? 'Check your wallet…' : engine.hasWallet() ? 'Connect a wallet instead' : 'No browser wallet found'}</button>
        </>}
        {err && <p className="err">{err}</p>}
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
  // Phones open on the intro while signed out. Once signed in it plays its hand-off and steps aside.
  const [phone, setPhone] = useState(() => matchMedia('(max-width: 700px)').matches)
  useEffect(() => { const m = matchMedia('(max-width: 700px)'), f = () => setPhone(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [])
  const wantIntro = app && phone && !ready
  const [intro, setIntro] = useState<'off' | 'on' | 'leaving'>(wantIntro ? 'on' : 'off')
  useEffect(() => {
    if (wantIntro) { setIntro('on'); return }
    setIntro(v => (v === 'on' ? 'leaving' : v))
    const t = setTimeout(() => setIntro('off'), 750); return () => clearTimeout(t)
  }, [wantIntro])
  // Opened from the home screen, Hagi goes straight into the app instead of the landing page.
  useEffect(() => { if (page === 'home' && isStandalone()) location.replace('#/portfolio') }, [page])
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
      <header className={'nav' + (app ? ' appnav' : '')}>
        <a className="lg" href="#/home"><Mark leaf={dark ? '#ffffff' : undefined} secret />hagi</a>
        <nav className="links">{page === 'home'
          ? <>{[['check', 'Check your wallet'], ['how', 'How it works'], ['baskets', 'Baskets'], ['faq', 'Questions']].map(([id, t]) => <button key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })}>{t}</button>)}<a href="#/docs">Docs</a></>
          : <>{PAGES.map(p => <a key={p} href={'#/' + p} className={p === page ? 'on' : ''}>{p[0].toUpperCase() + p.slice(1)}</a>)}<a href="#/docs" className={page === 'docs' ? 'on' : ''}>Docs</a></>}</nav>
        <div className="rt">
          {app && <button className="help" onClick={startTour} aria-label="Take the tour" title="Take the tour">?</button>}
          {app && <span className="net"><i className={s.offline ? 'off' : ''} />{s.offline ? 'Can’t reach the chain' : s.syncing ? 'Syncing' : 'Testnet'}</span>}
          {page === 'home' ? <a className="wal" href="#/portfolio">Open the app</a>
            : ready ? <WalletMenu />
            : <button className="wal" onClick={askConnect}><i /><span className="t-long">Sign in</span><span className="t-short">Sign in</span></button>}
        </div>
      </header>
      {page === 'portfolio' && <InstallCard />}
      <main key={page} className="pg">
        {page === 'home' ? <Landing /> : page === 'docs' ? <Docs /> : page === 'swap' ? <Swap run={run} /> : page === 'baskets' ? <Baskets run={run} /> : page === 'send' ? <Send run={run} /> : page === 'activity' ? <Activity /> : <Portfolio run={run} />}
      </main>
      {page !== 'home' && <footer className="foot"><span className="fm"><Mark size={18} /><b>hagi</b><span>Stocks, off the record.</span></span><span className="fl2"><a href="#/docs">Docs</a><a href={FAUCET_URL} target="_blank" rel="noopener noreferrer">Faucet</a><a href="https://explorer.testnet.chain.robinhood.com" target="_blank" rel="noopener noreferrer">Explorer</a><span>Robinhood Chain Testnet</span></span></footer>}
      {app && (
        <nav className="tabbar" aria-label="Hagi">
          {TABS.map(([p, label, icon]) => <a key={p} href={'#/' + p} className={p === page ? 'on' : ''} aria-current={p === page ? 'page' : undefined}><Icon name={icon} size={24} /><span>{label}</span></a>)}
        </nav>
      )}
      <Toasts />
      {intro !== 'off' && <Intro leaving={intro === 'leaving'} />}
      {connecting && <ConnectModal onClose={() => setConnecting(false)} />}
      {touring && <Tour onClose={() => setTouring(false)} />}
      {job && <Progress title={job.title} task={job.task} doneText={job.done} onClose={closeJob} />}
    </>
  )
}
