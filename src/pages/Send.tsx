import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { TOKENS, asInput, fmt } from '../data'
import { hashParam } from '../nav'
import * as engine from '../engine'
import { confirmSpend } from '../confirm'
import { useStore } from '../store'
import { parseAddress } from '../zk/core'
import { getAddress, isAddress } from 'viem'
import { AmountField, Card, NeedAccount, TokenPicker, type Run } from '../ui'

export function Send({ run }: { run: Run }) {
  const { s, api } = useStore()
  const [tab, setTab] = useState<'send' | 'receive'>(hashParam('tab') === 'receive' ? 'receive' : 'send')
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
  const toHagi = !!parseAddress(to.trim())
  // A normal 0x wallet works too: the money leaves the vault straight to it, and your own wallet stays off the transaction.
  const toWallet = !toHagi && isAddress(to.trim())
  const validTo = toHagi || toWallet
  useEffect(() => { if (s.hagiAddress) QRCode.toDataURL(s.hagiAddress, { margin: 1, width: 440, color: { dark: '#1b2140', light: '#ffffff' } }).then(setQr) }, [s.hagiAddress])
  const copy = async () => { try { await navigator.clipboard.writeText(s.hagiAddress ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ } }
  return (
    <div className="wrap c">
      <div className="ptitle"><h2><span>Send,</span> off the record.</h2><p>Pay a Hagi address privately, or any wallet without revealing yours.</p></div>
      <Card>
        <div className="tabs"><button className={tab === 'send' ? 'on' : ''} onClick={() => setTab('send')}>Send</button><button className={tab === 'receive' ? 'on' : ''} onClick={() => setTab('receive')}>Receive</button></div>
        {tab === 'send' ? <>
          <div className="fld"><span className="fl">To</span><input className="txt" placeholder="hagi1… or 0x…" value={to} onChange={e => setTo(e.target.value)} aria-label="Recipient address" />
            <div className="hint"><span>{to && !validTo ? 'That doesn’t look like a Hagi or 0x address.' : toWallet ? 'They get it from the Hagi vault. Your wallet stays out of it.' : 'Paste a Hagi address, or any 0x wallet.'}</span></div></div>
          <AmountField label="Amount" value={amt} onChange={setAmt} hint={<>You have {fmt(have, cur === 'USDG' ? 2 : 4)} {cur}</>} onMax={() => setAmt(asInput(have))} right={<TokenPicker value={cur} onChange={setSym} options={options} balances={s.shielded} />} />
          {!(s.wallet && s.hagiAddress) ? <NeedAccount /> : <button className="btn" disabled={!validTo || n <= 0 || n > have} onClick={() => run('Sending privately', async step => {
            await confirmSpend(step)
            const dest = to.trim()
            if (toWallet) await engine.unshield(cur, n, step, getAddress(dest))
            else await engine.send(cur, n, dest, step)
            api.log({ kind: 'send', title: toWallet ? `Sent ${cur} to ${dest.slice(0, 6)}…${dest.slice(-4)}` : 'Sent ' + cur, detail: fmt(n, cur === 'USDG' ? 2 : 4) + ' ' + cur, isPrivate: true })
            setAmt(''); setTo(''); await api.refresh()
          }, toWallet ? 'Sent. Your wallet stayed out of it.' : 'Sent. Nobody saw.')}>{!validTo ? 'Enter an address' : n <= 0 ? 'Enter an amount' : n > have ? 'Not enough ' + cur : 'Send privately'}</button>}
        </> : !s.hagiAddress ? <div className="recv">
          <span className="fl">Your Hagi address appears here once your account is made. It receives USDG and every stock.</span>
          <NeedAccount />
        </div> : <div className="recv">
          {qr && <img src={qr} alt="QR code of your Hagi address" width={220} height={220} />}
          <span className="fl">Your Hagi address. It receives USDG and every stock</span>
          <div className="rcv-addr"><code>{s.hagiAddress.slice(0, 10)}…{s.hagiAddress.slice(-8)}</code></div>
          <div className="rcv-acts"><button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy address'}</button></div>
        </div>}
      </Card>
      <div className="col n">
        <Card title="Good to know"><p className="muted">Sending to a hagi1 address stays fully inside Hagi. Sending to a 0x wallet pays it straight from the vault: they see the amount arrive from Hagi, but not your wallet. One Hagi address receives USDG and all five stocks.</p></Card>
      </div>
    </div>
  )
}
