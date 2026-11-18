import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { TOKENS, asInput, fmt } from '../data'
import { hashParam } from '../nav'
import * as engine from '../engine'
import { useStore } from '../store'
import { parseAddress } from '../zk/core'
import { AmountField, Card, NeedAccount, TokenPicker, Visibility, type Run } from '../ui'

export function Send({ run }: { run: Run }) {
  const { s, api } = useStore()
  const [tab, setTab] = useState<'send' | 'receive'>('send')
  // USDG and every stock can be sent privately.
  const options = TOKENS.map(t => t.symbol)
  const [sym, setSym] = useState(hashParam('token') ?? options[0])
  const cur = options.includes(sym) ? sym : options[0]
  const [to, setTo] = useState('')
  const [amt, setAmt] = useState('')
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const n = parseFloat(amt) || 0
  const have = s.shielded[cur] ?? 0
  const validTo = !!parseAddress(to)
  useEffect(() => { if (s.hagiAddress) QRCode.toDataURL(s.hagiAddress, { margin: 1, width: 440, color: { dark: '#1b2140', light: '#ffffff' } }).then(setQr) }, [s.hagiAddress])
  const copy = async () => { try { await navigator.clipboard.writeText(s.hagiAddress ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ } }
  return (
    <div className="wrap c">
      <div className="ptitle"><h2><span>Send,</span> off the record.</h2><p>The amount and the recipient stay private.</p></div>
      <Card>
        <div className="tabs"><button className={tab === 'send' ? 'on' : ''} onClick={() => setTab('send')}>Send</button><button className={tab === 'receive' ? 'on' : ''} onClick={() => setTab('receive')}>Receive</button></div>
        {tab === 'send' ? <>
          <div className="fld"><span className="fl">To</span><input className="txt" placeholder="hagi1…" value={to} onChange={e => setTo(e.target.value)} aria-label="Recipient Hagi address" />
            <div className="hint"><span>{to && !validTo ? 'That doesn’t look like a Hagi address.' : 'Paste the other person’s Hagi address.'}</span></div></div>
          <AmountField label="Amount" value={amt} onChange={setAmt} hint={<>You have {fmt(have, cur === 'USDG' ? 2 : 4)} {cur}</>} onMax={() => setAmt(asInput(have))} right={<TokenPicker value={cur} onChange={setSym} options={options} balances={s.shielded} />} />
          {!(s.wallet && s.hagiAddress) ? <NeedAccount /> : <button className="btn" disabled={!validTo || n <= 0 || n > have} onClick={() => run('Sending privately', async step => {
            await engine.send(cur, n, to, step)
            api.log({ kind: 'send', title: 'Sent ' + cur, detail: fmt(n, cur === 'USDG' ? 2 : 4) + ' ' + cur, isPrivate: true })
            setAmt(''); setTo(''); await api.refresh()
          }, 'Sent. Nobody saw.')}>{!validTo ? 'Enter a Hagi address' : n <= 0 ? 'Enter an amount' : n > have ? 'Not enough ' + cur : 'Send privately'}</button>}
        </> : !s.hagiAddress ? <div className="recv">
          <span className="fl">Your Hagi address appears here once your account is made. It receives USDG and every stock.</span>
          <NeedAccount />
        </div> : <div className="recv">
          {qr && <img src={qr} alt="QR code of your Hagi address" width={220} height={220} />}
          <span className="fl">Your Hagi address. It receives USDG and every stock</span>
          <code>{s.hagiAddress}</code>
          <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy address'}</button>
        </div>}
      </Card>
      <div className="col n">
        <Card title="What others can see">
          {tab === 'send'
            ? <Visibility pub="that a private transfer happened in the vault." priv="the amount, the token, who sent it and who received it." />
            : <Visibility pub="nothing about you when someone sends to this address." priv="the sender, the amount and your balance." />}
        </Card>
        <Card title="Good to know"><p className="muted">A Hagi address starts with hagi1 and only works inside Hagi. One address receives USDG and all five stocks. To move funds to a normal wallet, use Unshield on the Portfolio page.</p></Card>
      </div>
    </div>
  )
}
