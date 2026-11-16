import { useCallback, useEffect, useState } from 'react'
import { DEMO_MODE, FAUCET_URL } from './chain'
import { short } from './data'
import { useStore } from './store'
import { Card, Mark, Progress } from './ui'
import { connectWallet, createHagiAccount, hasWallet } from './wallet'
import { Portfolio } from './pages/Portfolio'
import { Swap } from './pages/Swap'
import { Baskets } from './pages/Baskets'
import { Send } from './pages/Send'
import { Activity } from './pages/Activity'

const PAGES = ['portfolio', 'swap', 'baskets', 'send', 'activity'] as const
type Page = (typeof PAGES)[number]
const read = (): Page => { const h = location.hash.replace('#/', ''); return (PAGES as readonly string[]).includes(h) ? (h as Page) : 'portfolio' }

function Welcome() {
  const { s, d } = useStore()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const step = !s.wallet ? 0 : 1
  const act = async () => {
    setBusy(true); setErr('')
    try {
      if (!s.wallet) d({ type: 'connect', wallet: await connectWallet() })
      else d({ type: 'createAccount', hagiAddress: await createHagiAccount(s.wallet) })
    } catch { setErr('That was cancelled in your wallet. You can try again.') }
    setBusy(false)
  }
  const steps = [
    ['Connect your wallet', hasWallet() ? 'Use the wallet you already have. Hagi never holds your keys.' : 'No wallet found in this browser, so this will open a demo account.'],
    ['Create your Hagi account', 'Sign one free message. The same wallet always recovers the same account, so there is nothing new to back up.'],
    ['Add test funds', 'Get free testnet tokens and shield them to start.'],
  ]
  return (
    <div className="wrap welcome">
      <Card>
        <Mark size={44} />
        <h1><span>Stocks,</span> off the record.</h1>
        <p className="muted">Keep your stock balance private on Robinhood Chain. Setting up takes under a minute.</p>
        <ol className="setup">{steps.map(([t, p], i) => <li key={t} className={i < step ? 'd' : i === step ? 'a' : ''}><i>{i < step ? '✓' : i + 1}</i><div><b>{t}</b><span>{p}</span></div></li>)}</ol>
        <button className="btn" onClick={act} disabled={busy}>{busy ? 'Check your wallet…' : step === 0 ? 'Connect wallet' : 'Create my Hagi account'}</button>
        {err && <p className="err">{err}</p>}
        <a className="link center" href={FAUCET_URL} target="_blank" rel="noopener noreferrer">Need testnet ETH for gas? Open the faucet</a>
      </Card>
    </div>
  )
}

export default function App() {
  const { s, d } = useStore()
  const [page, setPage] = useState<Page>(read)
  const [job, setJob] = useState<{ title: string; fn: () => void } | null>(null)
  useEffect(() => { const f = () => setPage(read()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  const go = (p: string) => { location.hash = '#/' + p }
  const run = useCallback((title: string, fn: () => void) => setJob({ title, fn }), [])
  const finish = useCallback(() => { job?.fn(); setJob(null) }, [job])
  const ready = !!s.wallet && !!s.hagiAddress

  return (
    <>
      {DEMO_MODE && <div className="demo">Demo mode. The contracts aren’t deployed yet, so balances and transactions here are simulated.</div>}
      <header className="nav">
        <a className="lg" href="#/portfolio"><Mark />hagi</a>
        <nav className="links">{ready && PAGES.map(p => <a key={p} href={'#/' + p} className={p === page ? 'on' : ''}>{p[0].toUpperCase() + p.slice(1)}</a>)}</nav>
        <div className="rt">
          <span className="net"><i />Testnet</span>
          {s.wallet ? <button className="wal" title="Disconnect" onClick={() => { if (confirm('Disconnect this wallet? Demo balances on this device will be cleared.')) d({ type: 'disconnect' }) }}><i />{short(s.wallet)}</button> : null}
        </div>
      </header>
      <main>
        {!ready ? <Welcome /> : page === 'swap' ? <Swap run={run} /> : page === 'baskets' ? <Baskets run={run} /> : page === 'send' ? <Send run={run} /> : page === 'activity' ? <Activity /> : <Portfolio run={run} go={go} />}
      </main>
      {job && <Progress title={job.title} onDone={finish} />}
    </>
  )
}
