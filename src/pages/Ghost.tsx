import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import * as engine from '../engine'
import { fmt, token } from '../data'
import { useStore } from '../store'
import { Icon, NeedAccount, TokenIcon, type Run } from '../ui'

const amt = (sym: string, n: number) => fmt(n, sym === 'USDG' ? 2 : 4) + ' ' + sym

/** The Ghost Address side of Receive: a plain 0x address that anyone can pay, claimed into the private balance with one tap. */
export function GhostPanel({ run }: { run: Run }) {
  const { s, api } = useStore()
  const g = s.ghost
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const [fresh, setFresh] = useState(false)
  const signedIn = !!s.hagiAddress

  // While this is open, look for deposits every 10 seconds.
  useEffect(() => {
    if (!signedIn || !engine.ghostEnabled()) return
    void api.ghost().catch(() => {})
    const t = setInterval(() => { if (document.visibilityState === 'visible' && !document.body.classList.contains('busy')) void api.ghost().catch(() => {}) }, 10000)
    return () => clearInterval(t)
  }, [signedIn, api])
  useEffect(() => { if (g?.address) QRCode.toDataURL(g.address, { margin: 1, width: 440, color: { dark: '#1b2140', light: '#ffffff' } }).then(setQr) }, [g?.address])

  if (!engine.ghostEnabled()) return <div className="recv"><span className="fl">Ghost Addresses are on their way.</span></div>
  if (!signedIn) return <div className="recv"><span className="fl">Your Ghost Address appears here once your account is made.</span><NeedAccount /></div>
  if (!g) return <div className="recv"><span className="skel" style={{ width: 220, height: 220, borderRadius: 16, display: 'inline-block' }} /></div>

  const copy = async () => { try { await navigator.clipboard.writeText(g.address); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ } }
  const claim = (list: engine.GhostDeposit[]) => run(list.length > 1 ? 'Claiming your deposits' : 'Claiming your deposit', async step => {
    for (const [i, d] of list.entries()) {
      const got = await engine.claimGhost(d, list.length > 1 ? m => step(`${d.symbol} · ${i + 1} of ${list.length} · ${m}`) : step)
      api.log({ kind: 'receive', title: `Claimed ${d.symbol} · Ghost Address`, detail: amt(d.symbol, got), isPrivate: true })
    }
    await api.refresh(); await api.ghost()
  }, 'Claimed. It’s in your private balance now.')
  const waiting = g.pending.reduce((t, p) => t + p.amount * token(p.symbol).price, 0)

  return <div className="recv ghostp">
    {g.pending.length > 0 && <div className="gpend">
      <div className="gph"><span className="gdot" />{g.pending.length === 1 ? 'A deposit is waiting' : `${g.pending.length} deposits are waiting`}{waiting > 0 && <b>${fmt(waiting)}</b>}</div>
      {g.pending.map(d => <div className="grow" key={d.address + d.symbol}>
        <TokenIcon symbol={d.symbol} size={34} />
        <div className="g"><b>{amt(d.symbol, d.amount)}</b><span>{d.index === g.index ? 'At this address' : `At an older address · ${d.address.slice(0, 6)}…${d.address.slice(-4)}`}</span></div>
        <button className="chip strong" onClick={() => claim([d])}>Claim</button>
      </div>)}
      {g.pending.length > 1 && <button className="btn" onClick={() => claim(g.pending)}>Claim all</button>}
    </div>}
    <div className="gqr">{qr && <img src={qr} alt="QR code of your Ghost Address" width={220} height={220} />}</div>
    <span className="fl">Your Ghost Address. Pay it from any wallet or exchange</span>
    <button className="rcv-addr" onClick={copy}><code>{g.address.slice(0, 8)}…{g.address.slice(-6)}</code><span><Icon name={copied ? 'check' : 'copy'} size={14} />{copied ? 'Copied' : 'Copy'}</span></button>
    {g.pending.length === 0 && <div className="gwait"><span className="gdot" />Watching for deposits</div>}
    <div className="rcv-acts"><button className="btn o" disabled={fresh} onClick={async () => { setFresh(true); try { await api.ghost('new') } finally { setFresh(false) } }}>{fresh ? 'Making one…' : 'New address'}</button></div>
    <p className="gnote">Send USDG, TSLA, AMD, AMZN, NFLX or PLTR on Robinhood Chain. Other tokens can’t be claimed. Claiming is free of gas, with a 0.5% fee.</p>
  </div>
}
