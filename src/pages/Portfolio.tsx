import { useState } from 'react'
import { createPortal } from 'react-dom'
import * as engine from '../engine'
import { confirmSpend } from '../confirm'
import { TOKENS, asInput, fmt, token, usd } from '../data'
import { go } from '../nav'
import { total, useStore } from '../store'
import { Amount, AmountField, Card, Icon, Mark, NeedAccount, TokenIcon, TokenPicker, useCountUp, type Run } from '../ui'
import { ActivityList } from './Activity'

const MIX = ['#1b2140', '#566eba', '#8696cf', '#b0a7b8', '#3a4a8a', '#c9d1ee', '#7f86ad', '#d9def0']

export function Portfolio({ run }: { run: Run }) {
  const { s, api } = useStore()
  const [tab, setTab] = useState<'shield' | 'unshield'>('shield')
  const [sym, setSym] = useState('USDG')
  const [amt, setAmt] = useState('')
  // Phones: the shield form and token details open as sheets instead of sitting on the page.
  const [addOpen, setAddOpen] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)
  const openAdd = (t: 'shield' | 'unshield', k?: string) => { setTab(t); if (k) setSym(k); setAmt(''); setDetail(null); setAddOpen(true) }
  const src = tab === 'shield' ? s.walletBal : s.shielded
  // Every token can be shielded and unshielded, so the picker always lists all of them.
  const options = TOKENS.map(t => t.symbol)
  const cur = options.includes(sym) ? sym : options[0]
  const have = src[cur] ?? 0
  const n = parseFloat(amt) || 0
  const bal = total(s.shielded)
  const [whole, cents] = fmt(useCountUp(bal)).split('.')
  const holdings = Object.entries(s.shielded).sort((a, b) => b[1] * token(b[0]).price - a[1] * token(a[0]).price)
  const unshielded = total(s.walletBal)
  const ready = !!s.wallet && !!s.hagiAddress
  const amt4 = (k: string, v: number) => fmt(v, k === 'USDG' ? 2 : 4) + ' ' + k
  // No gas is fine: the claim tops the wallet up with a little testnet ETH first.
  const faucet = () => run('Getting test USDG', async step => { await engine.faucet(step); await api.refresh() }, '5,000 test USDG is in your wallet.')
  // Live version: one transaction per token. The demo applies them together.
  const shieldAll = () => run('Shielding', async step => {
    for (const [k, v] of Object.entries(s.walletBal)) { await engine.shield(k, v, step); api.log({ kind: 'shield', title: 'Shielded ' + k, detail: amt4(k, v) }) }
    await api.refresh()
  }, 'Shielded. Off the record now.')

  const shieldForm = <>
          <div className="tabs"><button className={tab === 'shield' ? 'on' : ''} onClick={() => setTab('shield')}>Shield</button><button className={tab === 'unshield' ? 'on' : ''} onClick={() => setTab('unshield')}>Unshield</button></div>
          <AmountField label={tab === 'shield' ? 'From your wallet' : 'From your private balance'} value={amt} onChange={setAmt}
            hint={<>{tab === 'shield' ? 'Wallet balance' : 'Private balance'} {fmt(have, cur === 'USDG' ? 2 : 4)} {cur}</>} onMax={() => setAmt(asInput(have))}
            right={<TokenPicker value={cur} onChange={setSym} options={options} balances={src} />} />
          {!ready ? <NeedAccount /> : <button className="btn" disabled={n <= 0 || n > have} onClick={() => { setAddOpen(false); setDetail(null); run(tab === 'shield' ? 'Shielding' : 'Unshielding', async step => {
            if (tab === 'unshield') await confirmSpend(step)
            await engine[tab](cur, n, step)
            api.log({ kind: tab, title: (tab === 'shield' ? 'Shielded ' : 'Unshielded ') + cur, detail: amt4(cur, n) })
            setAmt(''); await api.refresh()
          }, tab === 'shield' ? 'Shielded. Off the record now.' : 'Unshielded. Back on the record.') }}>
            {n <= 0 ? 'Enter an amount' : n > have ? 'Not enough ' + cur : (tab === 'shield' ? 'Shield ' : 'Unshield ') + fmt(n) + ' ' + cur}
          </button>}
          {tab === 'shield' && !s.claimed && <button className="link center" data-tour="faucet" onClick={faucet}>Claim 5,000 test USDG (one time)</button>}
  </>

  return (
    <div className="wrap">
      <div className="col">
        <Card className="hero">
          <div className="ghost"><Mark size={320} leaf="#252d5a" block="#313c74" /></div>
          <div className="lab">
            <span className="hl"><Icon name="lock" size={15} />Your private balance</span>
          </div>
          {ready && !s.loaded ? <div className="big"><span className="skel skel-big" /></div> : <div className="big">${whole}<small>.{cents}</small></div>}
          <div className="qas">
            <button className="qa qm qadd" onClick={() => openAdd('shield')}><i><Icon name="plus" /></i>Add</button>
            <button className="qa" onClick={() => go('swap')}><i><Icon name="swap" /></i>Swap</button>
            <button className="qa" onClick={() => go('send')}><i><Icon name="right" /></i>Send</button>
            <button className="qa qm" onClick={() => go('send?tab=receive')}><i><Icon name="down" /></i>Receive</button>
          </div>
          {ready && unshielded > 0 && (
            <button className="walpill" onClick={shieldAll}><span>{usd(unshielded)} still in your wallet</span><b>Make private<Icon name="right" size={13} /></b></button>
          )}
        </Card>

        {ready && s.loaded && <Checklist onClaim={faucet} onPrivate={() => (Object.keys(s.walletBal).length ? shieldAll() : openAdd('shield'))} />}

        <Card title="Your stocks and cash">
          {!ready ? (
            <div className="empty">
              <b>Your private balance lives here</b>
              <p>Sign in to see it. It takes a few seconds.</p>
              <NeedAccount className="btn sm" />
            </div>
          ) : !s.loaded ? (
            <div className="skel-list">{[0, 1, 2].map(i => <div className="row hold" key={i}><span className="skel skel-ic" /><div className="g"><span className="skel skel-t" /><span className="skel skel-s" /></div><div className="r"><span className="skel skel-t" /><span className="skel skel-s" /></div></div>)}</div>
          ) : holdings.length === 0 ? (
            <div className="empty">
              <b>Nothing here yet</b>
              <p>{Object.keys(s.walletBal).length ? 'You have test funds in your wallet. Make them private to start.' : (s.claimed ? 'Your wallet is empty. Add funds to get started.' : 'Claim free test USDG, then make it private. Nothing here is real money.')}</p>
              {!Object.keys(s.walletBal).length && !s.claimed && <button className="btn sm" onClick={faucet}>Claim test USDG</button>}
            </div>
          ) : <>
            {holdings.length > 1 && (
              <div className="mix">
                <div className="mixbar">{holdings.map(([k, v], i) => <i key={k} style={{ width: (v * token(k).price / bal) * 100 + '%', background: MIX[i % MIX.length] }} title={k} />)}</div>
                <div className="mixkey">{holdings.map(([k, v], i) => <span key={k}><i style={{ background: MIX[i % MIX.length] }} />{k} {Math.round((v * token(k).price / bal) * 100)}%</span>)}</div>
              </div>
            )}
            {holdings.map(([k, v]) => (
              <button className="row hold" key={k} onClick={() => setDetail(k)}>
                <TokenIcon symbol={k} />
                <div className="g"><b>{token(k).name}</b><span>{k}</span></div>
                <div className="r"><b><Amount value={v * token(k).price} seed={k + 'v'} prefix="$" /></b><span><Amount value={v} seed={k + 'q'} digits={k === 'USDG' ? 2 : 4} cell={6} /> {k}</span></div>
              </button>
            ))}
          </>}
        </Card>

      </div>

      <div className="col">
        <Card className="shieldcard">
          <div data-tour="shield" className="tour-area" />
          {shieldForm}
        </Card>
        <Card title="Recent activity" action={<button className="tag" onClick={() => go('activity')}>See all</button>}>
          <ActivityList limit={4} />
        </Card>
      </div>

      {addOpen && createPortal(
        <div className="overlay" onClick={() => setAddOpen(false)}>
          <div className="modal wide sheetform" onClick={e => e.stopPropagation()}>
            <div className="ch"><h3>{tab === 'shield' ? 'Add to your private balance' : 'Move out of Hagi'}</h3><button className="x" onClick={() => setAddOpen(false)} aria-label="Close"><Icon name="close" /></button></div>
            {shieldForm}
          </div>
        </div>, document.body,
      )}
      {detail && <TokenSheet k={detail} amount={s.shielded[detail] ?? 0} total={bal} onClose={() => setDetail(null)} onUnshield={() => openAdd('unshield', detail)} />}
    </div>
  )
}

/** One holding, up close: value, amount, price and what you can do with it. */
function TokenSheet({ k, amount, total: all, onClose, onUnshield }: { k: string; amount: number; total: number; onClose: () => void; onUnshield: () => void }) {
  const t = token(k), value = amount * t.price
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal tsheet" onClick={e => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        <TokenIcon symbol={k} size={64} />
        <div className="ts-name">{t.name}</div>
        <div className="ts-val">{usd(value)}</div>
        <div className="ts-amt">{fmt(amount, k === 'USDG' ? 2 : 4)} {k}</div>
        <dl className="ts-facts">
          <div><dt>Price</dt><dd>{usd(t.price)}</dd></div>
          <div><dt>Share of balance</dt><dd>{all ? Math.round((value / all) * 100) : 0}%</dd></div>
          <div><dt>Visible to others</dt><dd><Icon name="lock" size={14} /> No</dd></div>
        </dl>
        <div className="ts-acts">
          <button onClick={() => go('swap?from=' + k)}><i><Icon name="swap" /></i>Swap</button>
          <button onClick={() => go('send?token=' + k)}><i><Icon name="right" /></i>Send</button>
          <button onClick={onUnshield}><i><Icon name="up" /></i>Withdraw</button>
        </div>
      </div>
    </div>, document.body,
  )
}

const CHECK_KEY = 'hagi-checklist-hidden'
/** First-run steps: claim, make it private, do something private. Hides itself once all three are done. */
function Checklist({ onClaim, onPrivate }: { onClaim: () => void; onPrivate: () => void }) {
  const { s } = useStore()
  const [hidden, setHidden] = useState(() => { try { return !!localStorage.getItem(CHECK_KEY) } catch { return false } })
  const did = (...k: string[]) => s.activity.some(a => k.includes(a.kind))
  const privateBal = Object.values(s.shielded).some(v => v > 0)
  const steps = [
    { t: 'Claim test USDG', d: '5,000 free test USDG, one time.', done: s.claimed || Object.keys(s.walletBal).length > 0 || privateBal || did('shield'), act: onClaim, cta: 'Claim' },
    { t: 'Make it private', d: 'Move it into your private balance.', done: privateBal || did('shield'), act: onPrivate, cta: 'Make private' },
    { t: 'Do something private', d: 'Swap, send or buy a basket.', done: did('swap', 'send', 'basket'), act: () => go('swap'), cta: 'Swap' },
  ]
  const count = steps.filter(x => x.done).length
  if (hidden || count === steps.length) return null
  const next = steps.findIndex(x => !x.done)
  const hide = () => { setHidden(true); try { localStorage.setItem(CHECK_KEY, '1') } catch { /* fine */ } }
  return (
    <div className="card check">
      <div className="ck-hd"><div><b>Get started</b><span>{count} of {steps.length} done</span></div><button className="x" onClick={hide} aria-label="Hide"><Icon name="close" size={14} /></button></div>
      <div className="ck-bar"><i style={{ width: (count / steps.length) * 100 + '%' }} /></div>
      {steps.map((x, i) => (
        <div className={'ck-row' + (x.done ? ' done' : i === next ? ' next' : '')} key={x.t}>
          <span className="ck-dot">{x.done ? <Icon name="check" size={13} /> : i + 1}</span>
          <div className="g"><b>{x.t}</b><span>{x.d}</span></div>
          {i === next && <button className="chip strong" onClick={x.act}>{x.cta}</button>}
        </div>
      ))}
    </div>
  )
}
