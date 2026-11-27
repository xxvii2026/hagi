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
import { GhostPanel } from './Ghost'
import { useMyName } from './Names'
import { DropMaker } from './Drop'

export function Send({ run }: { run: Run }) {
  const { s, api } = useStore()
  const [myName] = useMyName()
  const [tab, setTab] = useState<'send' | 'receive'>(hashParam('tab') === 'receive' ? 'receive' : 'send')
  // USDG and every stock can be sent privately.
  const options = TOKENS.map(t => t.symbol)
  const [sym, setSym] = useState(hashParam('token') ?? options[0])
  const cur = options.includes(sym) ? sym : options[0]
  const [to, setTo] = useState('')
  const [amt, setAmt] = useState('')
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const [many, setMany] = useState(hashParam('mode') === 'burst')
  const [drop, setDrop] = useState(hashParam('mode') === 'drop')
  // Receive shows the hagi1 address, or a Ghost Address that any wallet or exchange can pay.
  const [rmode, setRmode] = useState<'hagi' | 'ghost'>(hashParam('r') === 'ghost' && engine.ghostEnabled() ? 'ghost' : 'hagi')
  const [list, setList] = useState('')
  const [paid, setPaid] = useState(-1)
  const rows = parseBurst(list)
  const total = rows.reduce((a, r) => a + (r.ok ? r.n : 0), 0)
  const bad = rows.filter(r => !r.ok).length
  const anyWallet = rows.some(r => r.ok && r.kind === 'wallet')
  const allPaid = rows.length > 0 && paid >= rows.length - 1
  const missing = rows.filter(r => !r.ok && r.why === 'No amount').length
  const [each, setEach] = useState('')
  const n = parseFloat(amt) || 0
  const have = s.shielded[cur] ?? 0
  // name.hagi resolves to a hagi1 address before sending.
  const isName = engine.looksLikeName(to)
  const [named, setNamed] = useState<{ q: string; a: string | null } | null>(null)
  useEffect(() => {
    if (!isName) { setNamed(null); return }
    const q = to.trim().toLowerCase(); let live = true
    const t = setTimeout(() => { engine.lookupName(q).then(a => { if (live) setNamed({ q, a }) }).catch(() => { if (live) setNamed({ q, a: null }) }) }, 300)
    return () => { live = false; clearTimeout(t) }
  }, [to, isName])
  const nameAddr = isName && named?.q === to.trim().toLowerCase() ? named.a : null
  const toHagi = !!parseAddress(to.trim()) || !!nameAddr
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
          <div className="seg" role="tablist" aria-label="Send mode"><button className={!many && !drop ? 'on' : ''} onClick={() => { setMany(false); setDrop(false) }}>Single</button><button className={many && !drop ? 'on' : ''} onClick={() => { setMany(true); setDrop(false) }}>Burst</button><button className={drop ? 'on' : ''} onClick={() => setDrop(true)}>Drop</button></div>
          {drop ? <DropMaker run={run} /> : many ? <>
            <div className="fld"><span className="fl">People and amounts</span>
              <textarea className="txt burst-in" rows={6} placeholder={'Paste addresses, or address and amount pairs.\nHagi lines them up for you.'} value={list} onChange={e => { setList(e.target.value); setPaid(-1) }}
                onPaste={e => { const t = e.clipboardData.getData('text'); if (!/(hagi1|0x)/i.test(t)) return; e.preventDefault(); const el = e.currentTarget; setList(tidyList(el.value.slice(0, el.selectionStart) + '\n' + t + '\n' + el.value.slice(el.selectionEnd))); setPaid(-1) }} aria-label="Recipients and amounts" />
              <div className="burst-tools">
                <label className="chip">Import CSV<input type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setList(tidyList((list ? list + '\n' : '') + await f.text())); setPaid(-1) }} /></label>
                {missing > 0 && <span className="fillall"><input className="txt" inputMode="decimal" placeholder="Amount each" value={each} onChange={e => setEach(e.target.value)} aria-label="Amount for everyone without one" /><button className="chip" disabled={!(parseFloat(each) > 0)} onClick={() => { setList(fillAmounts(list, each)); setEach('') }}>Fill {missing}</button></span>}
              </div>
              <div className="hint"><span>{rows.length > engine.BURST_MAX ? `Up to ${engine.BURST_MAX} people at a time.` : bad ? `${bad} line${bad > 1 ? 's' : ''} need fixing.` : 'Paste or import a list. hagi1 addresses and 0x wallets can be mixed.'}</span></div></div>
            {rows.length > 0 && <div className="burst-list">{rows.map((r, i) => <div key={i} className={'brow' + (r.ok ? '' : ' bad') + (i <= paid ? ' done' : '')}>
              <span className="bnum">{i <= paid ? '✓' : i + 1}</span><code>{r.to ? (r.to.length > 18 ? r.to.slice(0, 8) + '…' + r.to.slice(-6) : r.to) : '—'}</code>
              <span className="bkind">{r.ok ? (r.kind === 'hagi' ? 'Hagi' : 'Wallet') : r.why}</span><b>{r.ok ? fmt(r.n, cur === 'USDG' ? 2 : 4) : ''}</b></div>)}</div>}
            <div className="fld"><span className="fl">Token</span><div className="burst-tok"><TokenPicker value={cur} onChange={setSym} options={options} balances={s.shielded} /><span className="muted">Total {fmt(total, cur === 'USDG' ? 2 : 4)} {cur} · you have {fmt(have, cur === 'USDG' ? 2 : 4)}</span></div></div>
            {anyWallet && <div className="hint" style={{ marginBottom: 12 }}><span>Payouts to 0x wallets leave a few seconds apart, so someone watching could guess they came from one sender.</span></div>}
            {!(s.wallet && s.hagiAddress) ? <NeedAccount /> : <button className="btn" disabled={allPaid || !rows.length || bad > 0 || rows.length > engine.BURST_MAX || total <= 0 || total > have} onClick={() => run('Paying everyone privately', async step => {
              await confirmSpend(step)
              setPaid(-1)
              const plan = await Promise.all(rows.map(async r => ({ to: engine.looksLikeName(r.to) ? await engine.lookupName(r.to) : r.to, n: r.n, name: r.to })))
              const missingName = plan.find(p => !p.to); if (missingName) throw new Error('Nobody has the name ' + missingName.name + ' yet.')
              const done = await engine.burst(cur, plan.map(p => ({ to: p.to!, n: p.n })), step, i => setPaid(i))
              api.log({ kind: 'send', title: `Paid ${done} people`, detail: fmt(total, cur === 'USDG' ? 2 : 4) + ' ' + cur, isPrivate: true })
              setPaid(rows.length - 1); await api.refresh()
            }, `Paid ${rows.length} people. Nobody saw who sent it.`)}>{allPaid ? `All ${rows.length} paid` : !rows.length ? 'Add people' : bad ? 'Fix the list' : rows.length > engine.BURST_MAX ? `Up to ${engine.BURST_MAX} people` : total > have ? 'Not enough ' + cur : `Send to ${rows.length} ${rows.length === 1 ? 'person' : 'people'}`}</button>}
          </> : <>
          <div className="fld"><span className="fl">To</span><input className="txt" placeholder={engine.namesEnabled() ? 'name.hagi, hagi1… or 0x…' : 'hagi1… or 0x…'} value={to} onChange={e => setTo(e.target.value)} aria-label="Recipient address" />
            <div className="hint"><span>{isName ? (named?.q !== to.trim().toLowerCase() ? 'Looking up the name…' : nameAddr ? 'Goes to ' + to.trim().toLowerCase() + '. Private, like any Hagi send.' : 'Nobody has that name yet.') : to && !validTo ? 'That doesn’t look like a Hagi or 0x address.' : toWallet ? 'They get it from the Hagi vault. Your wallet stays out of it.' : 'Paste a Hagi address, or any 0x wallet.'}</span></div></div>
          <AmountField label="Amount" value={amt} onChange={setAmt} hint={<>You have {fmt(have, cur === 'USDG' ? 2 : 4)} {cur}</>} onMax={() => setAmt(asInput(have))} right={<TokenPicker value={cur} onChange={setSym} options={options} balances={s.shielded} />} />
          {!(s.wallet && s.hagiAddress) ? <NeedAccount /> : <button className="btn" disabled={!validTo || n <= 0 || n > have} onClick={() => run('Sending privately', async step => {
            await confirmSpend(step)
            const dest = nameAddr ?? to.trim()
            if (toWallet) await engine.unshield(cur, n, step, getAddress(dest))
            else await engine.send(cur, n, dest, step)
            api.log({ kind: 'send', title: toWallet ? `Sent ${cur} to ${dest.slice(0, 6)}…${dest.slice(-4)}` : isName ? `Sent ${cur} to ${to.trim().toLowerCase()}` : 'Sent ' + cur, detail: fmt(n, cur === 'USDG' ? 2 : 4) + ' ' + cur, isPrivate: true })
            setAmt(''); setTo(''); await api.refresh()
          }, toWallet ? 'Sent. Your wallet stayed out of it.' : 'Sent. Nobody saw.')}>{!validTo ? 'Enter an address' : n <= 0 ? 'Enter an amount' : n > have ? 'Not enough ' + cur : 'Send privately'}</button>}
          </>}
        </> : <>
        {engine.ghostEnabled() && <div className="seg" role="tablist" aria-label="Receive with"><button className={rmode === 'hagi' ? 'on' : ''} onClick={() => setRmode('hagi')}>Hagi address</button><button className={rmode === 'ghost' ? 'on' : ''} onClick={() => setRmode('ghost')}>Ghost Address</button></div>}
        {rmode === 'ghost' ? <GhostPanel run={run} /> : !s.hagiAddress ? <div className="recv">
          <span className="fl">Your Hagi address appears here once your account is made. It receives USDG and every stock.</span>
          <NeedAccount />
        </div> : <div className="recv">
          {qr && <img src={qr} alt="QR code of your Hagi address" width={220} height={220} />}
          {myName && <div className="rcv-name">{myName}.hagi</div>}
          <span className="fl">Your Hagi address. It receives USDG and every stock</span>
          <div className="rcv-addr"><code>{s.hagiAddress.slice(0, 10)}…{s.hagiAddress.slice(-8)}</code></div>
          <div className="rcv-acts"><button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy address'}</button></div>
        </div>}
        </>}
      </Card>
      <div className="col n">
        {tab === 'receive' && rmode === 'ghost' ? <Card title="How Ghost Addresses work"><p className="muted">A Ghost Address is a normal 0x address, so any wallet or exchange can pay it. Nothing links it to you or your wallet. When you claim, the money goes straight into your private balance, and only your Hagi account can ever claim from it.</p><p className="muted">The deposit itself is public, like any transfer. If you don’t want two deposits tied to each other, make a new address for each sender. Old addresses keep working.</p>{engine.ghostSwapEnabled() && <p className="muted">Pick a stock under Arrives as and you get a Ghost Swap address: whatever lands there turns into that stock when you claim, at the pool price at that moment.</p>}</Card>
        : tab === 'send' && drop ? <Card title="How drops work"><p className="muted">A drop splits what you put in into random slices behind one link. Whoever opens the link takes one slice straight into their private balance, first come, first served.</p><p className="muted">Nobody can see who made the drop or who took from it. Anyone with the link can grab, so share it where you mean to. You can take back whatever is left at any time.</p></Card>
        : <Card title="Good to know"><p className="muted">Sending to a hagi1 address stays fully inside Hagi. Sending to a 0x wallet pays it straight from the vault: they see the amount arrive from Hagi, but not your wallet. One Hagi address receives USDG and all five stocks.</p></Card>}
      </div>
    </div>
  )
}

type BurstRow = { to: string; n: number; ok: boolean; kind?: 'hagi' | 'wallet'; why?: string }
/** Reads "address, amount" lines. Commas, spaces or tabs all work as the separator. */
function parseBurst(text: string): BurstRow[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const parts = line.split(/[\s,;\t]+/).filter(Boolean)
    const to = parts[0] ?? '', n = parseFloat((parts[1] ?? '').replace(/[^0-9.]/g, ''))
    const kind = parseAddress(to) || engine.looksLikeName(to) ? 'hagi' as const : isAddress(to) ? 'wallet' as const : undefined
    if (!kind) return { to, n: 0, ok: false, why: 'Bad address' }
    if (!(n > 0)) return { to, n: 0, ok: false, kind, why: 'No amount' }
    return { to, n, ok: true, kind }
  })
}

const ADDR = /^(hagi1[0-9a-f]{128}|0x[0-9a-f]{40}|[a-z0-9-]{4,20}\.hagi)$/i
const NUM = /^\$?\d[\d,]*(\.\d+)?$|^\$?\.\d+$/
/** Lines up any messy list into one "address, amount" per line: commas, spaces, tabs, CSV rows,
 *  quotes and header rows all work, and addresses without an amount get an empty slot to fill. */
function tidyList(text: string): string {
  const tokens = text.replace(/"([^"]*)"/g, (_, x: string) => ' ' + (/^[\s$\d,.]+$/.test(x) ? x.replace(/[,$\s]/g, '') : x) + ' ').replace(/["']/g, ' ').split(/[\s,;|\t]+/).map(t => t.trim()).filter(Boolean)
  const out: { a: string; n: string }[] = []
  let pending: number | null = null // a number seen before its address, as in "amount, address" rows
  for (const t of tokens) {
    if (ADDR.test(t)) { out.push({ a: t.startsWith('0x') || t.startsWith('0X') ? t : t.toLowerCase(), n: pending != null ? String(pending) : '' }); pending = null; continue }
    if (/^(hagi|0x)/i.test(t) && t.length > 6) { out.push({ a: t, n: '' }); pending = null; continue } // keep typos so they show as bad lines
    if (NUM.test(t)) {
      const v = parseFloat(t.replace(/[$,]/g, ''))
      const last = out[out.length - 1]
      if (last && !last.n) last.n = String(v)
      else pending = v
    }
  }
  return out.map(r => r.a + ', ' + r.n).join('\n')
}
function fillAmounts(text: string, each: string): string {
  return tidyList(text).split('\n').map(l => /,\s*$/.test(l) ? l + ' ' + parseFloat(each) : l).join('\n').replace(/,\s+(\d)/g, ', $1')
}
