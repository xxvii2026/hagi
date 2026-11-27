import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import * as engine from '../engine'
import { TOKENS, fmt, token } from '../data'
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
  // Ghost Swaps: pick a stock and the address changes to one where everything arrives as that stock.
  const [as, setAs] = useState<string | null>(null)
  const signedIn = !!s.hagiAddress

  // While this is open, look for deposits every 10 seconds.
  useEffect(() => {
    if (!signedIn || !engine.ghostEnabled()) return
    void api.ghost().catch(() => {})
    const t = setInterval(() => { if (document.visibilityState === 'visible' && !document.body.classList.contains('busy')) void api.ghost().catch(() => {}) }, 10000)
    return () => clearInterval(t)
  }, [signedIn, api])
  const shown = (as && g?.swaps[as]) || g?.address
  useEffect(() => { if (shown) QRCode.toDataURL(shown, { errorCorrectionLevel: 'H', margin: 1, width: 440, color: { dark: '#1b2140', light: '#ffffff' } }).then(setQr) }, [shown])

  if (!engine.ghostEnabled()) return <div className="recv"><span className="fl">Ghost Addresses are on their way.</span></div>
  if (!signedIn) return <div className="recv"><span className="fl">Your Ghost Address appears here once your account is made.</span><NeedAccount /></div>
  if (!g) return <div className="recv"><span className="skel" style={{ width: 220, height: 220, borderRadius: 16, display: 'inline-block' }} /></div>

  const addr = shown ?? g.address
  const pick = (sym: string | null) => { setAs(sym); if (sym) { engine.watchTarget(sym); void api.ghost().catch(() => {}) } }
  const copy = async () => { try { await navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ } }
  const claim = (list: engine.GhostDeposit[]) => run(list.length > 1 ? 'Claiming your deposits' : 'Claiming your deposit', async step => {
    for (const [i, d] of list.entries()) {
      const got = await engine.claimGhost(d, list.length > 1 ? m => step(`${d.symbol} · ${i + 1} of ${list.length} · ${m}`) : step)
      api.log({ kind: 'receive', title: d.target && d.target !== d.symbol ? `Ghost Swap · ${d.symbol} to ${got.symbol}` : `Claimed ${got.symbol} · Ghost Address`, detail: amt(got.symbol, got.amount), isPrivate: true })
    }
    await api.refresh(); await api.ghost()
  }, 'Claimed. It’s in your private balance now.')
  const waiting = g.pending.reduce((t, p) => t + p.amount * token(p.symbol).price, 0)

  return <div className="recv ghostp">
    {g.pending.length > 0 && <div className="gpend">
      <div className="gph"><span className="gdot" />{g.pending.length === 1 ? 'A deposit is waiting' : `${g.pending.length} deposits are waiting`}{waiting > 0 && <b>${fmt(waiting)}</b>}</div>
      {g.pending.map(d => <div className="grow" key={d.address + d.symbol}>
        <TokenIcon symbol={d.symbol} size={34} />
        <div className="g"><b>{amt(d.symbol, d.amount)}</b><span>{d.target && d.target !== d.symbol ? `Arrives as ${d.target}` : d.index === g.index ? 'At this address' : `At an older address · ${d.address.slice(0, 6)}…${d.address.slice(-4)}`}</span></div>
        {d.target && d.target !== d.symbol && <TokenIcon symbol={d.target} size={26} />}
        <button className="chip strong" onClick={() => claim([d])}>{d.target && d.target !== d.symbol ? `Claim as ${d.target}` : 'Claim'}</button>
      </div>)}
      {g.pending.length > 1 && <button className="btn" onClick={() => claim(g.pending)}>Claim all</button>}
    </div>}
    {engine.ghostSwapEnabled() && <div className="gas">
      <span className="fl">Arrives as</span>
      <div className="gas-row">
        <button className={'chip' + (!as ? ' on' : '')} onClick={() => pick(null)}>As sent</button>
        {TOKENS.map(t => <button key={t.symbol} className={'chip' + (as === t.symbol ? ' on' : '')} onClick={() => pick(t.symbol)}><TokenIcon symbol={t.symbol} size={24} />{t.symbol}</button>)}
      </div>
    </div>}
    <div className="gqr">{qr && <img src={qr} alt="QR code of your Ghost Address" width={220} height={220} />}{as && <span className="gqr-tag"><TokenIcon symbol={as} size={44} /></span>}</div>
    <span className="fl">{as ? `Your Ghost Swap address. Whatever is sent here arrives as ${as}` : 'Your Ghost Address. Pay it from any wallet or exchange'}</span>
    <button className="rcv-addr" onClick={copy}><code>{addr.slice(0, 8)}…{addr.slice(-6)}</code><span><Icon name={copied ? 'check' : 'copy'} size={14} />{copied ? 'Copied' : 'Copy'}</span></button>
    {g.pending.length === 0 && <div className="gwait"><span className="gdot" />Watching for deposits</div>}
    <div className="rcv-acts"><button className="btn o" disabled={fresh} onClick={async () => { setFresh(true); try { await api.ghost('new') } finally { setFresh(false) } }}>{fresh ? 'Making one…' : 'New address'}</button></div>
    <p className="gnote">Send USDG, TSLA, AMD, AMZN, NFLX or PLTR on Robinhood Chain. Other tokens can’t be claimed. Claiming is free of gas, with a 0.5% fee.{as ? ` The swap uses Hagi’s pools at the price when you claim.` : ''}</p>
  </div>
}
