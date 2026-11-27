import { useEffect, useState } from 'react'
import * as engine from '../engine'
import { useStore } from '../store'
import { Icon, type Run } from '../ui'

// The account's name is read from chain and kept for this session, so every screen agrees.
let mine: { addr: string; name: string } | null = null
const subs = new Set<() => void>()
export function useMyName(): [string, (n: string) => void] {
  const { s } = useStore()
  const [, bump] = useState(0)
  useEffect(() => { const f = () => bump(x => x + 1); subs.add(f); return () => { subs.delete(f) } }, [])
  useEffect(() => {
    const a = s.hagiAddress
    if (!a || !engine.namesEnabled() || mine?.addr === a) return
    engine.nameOf(a).then(name => { mine = { addr: a, name }; subs.forEach(f => f()) }).catch(() => {})
  }, [s.hagiAddress])
  const set = (name: string) => { if (s.hagiAddress) { mine = { addr: s.hagiAddress, name }; subs.forEach(f => f()) } }
  return [mine && mine.addr === s.hagiAddress ? mine.name : '', set]
}

/** Portfolio card: claim name.hagi, or show the one you have. */
export function NameCard({ run }: { run: Run }) {
  const { s } = useStore()
  const [name, setName] = useMyName()
  const [q, setQ] = useState('')
  const [state, setState] = useState<'idle' | 'checking' | 'free' | 'taken' | 'bad'>('idle')
  const [copied, setCopied] = useState(false)
  const n = engine.cleanName(q)
  useEffect(() => {
    if (!q) { setState('idle'); return }
    if (!n) { setState('bad'); return }
    setState('checking'); let live = true
    const t = setTimeout(() => { engine.nameAvailable(n).then(ok => { if (live) setState(ok ? 'free' : 'taken') }).catch(() => { if (live) setState('idle') }) }, 350)
    return () => { live = false; clearTimeout(t) }
  }, [q, n])
  if (!engine.namesEnabled() || !s.hagiAddress || !mine || mine.addr !== s.hagiAddress) return null

  if (name) return (
    <div className="card namecard has">
      <div className="nc-row">
        <span className="nc-ic"><Icon name="check" size={16} /></span>
        <div className="g"><b>{name}.hagi</b><span>People can send to this name instead of your long address.</span></div>
        <button className="chip" onClick={async () => { try { await navigator.clipboard.writeText(name + '.hagi'); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* blocked */ } }}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  )

  const claim = () => n && run('Claiming your name', async step => {
    const got = await engine.claimName(n, s.hagiAddress!, step)
    setName(got); setQ('')
  }, 'It’s yours. People can send to ' + n + '.hagi now.')
  const hint = state === 'bad' ? 'Use 4 to 20 letters, numbers or single hyphens.' : state === 'checking' ? 'Checking…' : state === 'taken' ? 'That one’s taken or reserved.' : state === 'free' ? 'It’s free. Claim it before someone else does.' : 'Free on testnet, and yours to keep on mainnet.'
  return (
    <div className="card namecard">
      <div className="nc-hd"><b>Claim your name</b><span>Get paid at a name instead of a long address.</span></div>
      <div className="nc-in"><input className="txt" placeholder="yourname" value={q} maxLength={25} onChange={e => setQ(e.target.value.toLowerCase().replace(/\s/g, ''))} aria-label="Pick a name" /><em>.hagi</em></div>
      <div className={'hint nc-hint ' + state}><span>{hint}</span></div>
      <button className="btn" disabled={state !== 'free'} onClick={claim}>{n && state === 'free' ? 'Claim ' + n + '.hagi' : 'Claim name'}</button>
      <p className="muted small nc-note"><Icon name="lock" size={12} /> Names are public, like a phone number. Your balance and history stay private.</p>
    </div>
  )
}
