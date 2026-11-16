import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { fmt } from '../data'
import { useStore } from '../store'
import { AmountField, Card, TokenPicker, Visibility } from '../ui'

export function Send({ run }: { run: (title: string, fn: () => void) => void }) {
  const { s, d } = useStore()
  const [tab, setTab] = useState<'send' | 'receive'>('send')
  const options = Object.keys(s.shielded).length ? Object.keys(s.shielded) : ['USDG']
  const [sym, setSym] = useState(options[0])
  const cur = options.includes(sym) ? sym : options[0]
  const [to, setTo] = useState('')
  const [amt, setAmt] = useState('')
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const n = parseFloat(amt) || 0
  const have = s.shielded[cur] ?? 0
  const validTo = /^hagi1[0-9a-f]{40}$/.test(to.trim())
  useEffect(() => { if (s.hagiAddress) QRCode.toDataURL(s.hagiAddress, { margin: 1, width: 440, color: { dark: '#1b2140', light: '#ffffff' } }).then(setQr) }, [s.hagiAddress])
  const copy = async () => { try { await navigator.clipboard.writeText(s.hagiAddress ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ } }
  return (
    <div className="wrap c">
      <Card>
        <div className="tabs"><button className={tab === 'send' ? 'on' : ''} onClick={() => setTab('send')}>Send</button><button className={tab === 'receive' ? 'on' : ''} onClick={() => setTab('receive')}>Receive</button></div>
        {tab === 'send' ? <>
          <div className="fld"><span className="fl">To</span><input className="txt" placeholder="hagi1…" value={to} onChange={e => setTo(e.target.value)} aria-label="Recipient Hagi address" />
            <div className="hint"><span>{to && !validTo ? 'That doesn’t look like a Hagi address.' : 'Paste the other person’s Hagi address.'}</span></div></div>
          <AmountField label="Amount" value={amt} onChange={setAmt} hint={<>You have {fmt(have, cur === 'USDG' ? 2 : 4)} {cur}</>} onMax={() => setAmt(String(have))} right={<TokenPicker value={cur} onChange={setSym} options={options} />} />
          <button className="btn" disabled={!validTo || n <= 0 || n > have} onClick={() => run('Sending privately', () => { d({ type: 'send', symbol: cur, amount: n, to }); setAmt(''); setTo('') })}>{n > have ? 'Not enough ' + cur : 'Send privately'}</button>
        </> : <div className="recv">
          {qr && <img src={qr} alt="QR code of your Hagi address" width={220} height={220} />}
          <span className="fl">Your Hagi address</span>
          <code>{s.hagiAddress}</code>
          <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy address'}</button>
        </div>}
      </Card>
      <div className="col n">
        <Card title="What others can see">
          {tab === 'send'
            ? <Visibility pub="that your wallet used Hagi." priv="the amount, the token and who received it." />
            : <Visibility pub="nothing about you when someone sends to this address." priv="the sender, the amount and your balance." />}
        </Card>
        <Card title="Good to know"><p className="muted">A Hagi address starts with hagi1. It only works inside Hagi. To move funds to a normal wallet, use Unshield on the Portfolio page.</p></Card>
      </div>
    </div>
  )
}
