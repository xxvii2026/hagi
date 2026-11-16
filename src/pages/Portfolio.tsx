import { useRef, useState } from 'react'
import { FAUCET_URL } from '../chain'
import * as engine from '../engine'
import { TOKENS, asInput, fmt, token, usd } from '../data'
import { go } from '../nav'
import { total, useStore } from '../store'
import { Amount, AmountField, Card, Censor, Icon, Mark, TokenIcon, TokenPicker, Visibility, type Run } from '../ui'
import { ActivityList } from './Activity'

const MIX = ['#1b2140', '#566eba', '#8696cf', '#b0a7b8', '#3a4a8a', '#c9d1ee', '#7f86ad', '#d9def0']

export function Portfolio({ run }: { run: Run }) {
  const { s, api } = useStore()
  const [tab, setTab] = useState<'shield' | 'unshield'>('shield')
  const [sym, setSym] = useState('USDG')
  const [amt, setAmt] = useState('')
  const [copied, setCopied] = useState(false)
  const [flash, setFlash] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)
  // The big Shield and Unshield buttons jump to the form, select the right tab and put the cursor in the amount box.
  const openForm = (t: 'shield' | 'unshield') => {
    setTab(t); setAmt(''); setFlash(true); setTimeout(() => setFlash(false), 900)
    requestAnimationFrame(() => { amountRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); amountRef.current?.focus() })
  }
  const src = tab === 'shield' ? s.walletBal : s.shielded
  // Every token can be shielded and unshielded, so the picker always lists all of them.
  const options = TOKENS.map(t => t.symbol)
  const cur = options.includes(sym) ? sym : options[0]
  const have = src[cur] ?? 0
  const n = parseFloat(amt) || 0
  const bal = total(s.shielded)
  const [whole, cents] = fmt(bal).split('.')
  const holdings = Object.entries(s.shielded).sort((a, b) => b[1] * token(b[0]).price - a[1] * token(a[0]).price)
  const unshielded = total(s.walletBal)
  const popular = [...s.baskets].sort((a, b) => b.buyers - a.buyers).slice(0, 3)
  const addr = s.hagiAddress ?? ''
  const amt4 = (k: string, v: number) => fmt(v, k === 'USDG' ? 2 : 4) + ' ' + k
  // Gas comes first: without testnet ETH nothing else can be sent.
  const needsEth = s.eth < 0.00002
  const faucet = () => needsEth ? void window.open(FAUCET_URL, '_blank', 'noopener')
    : run('Getting test USDG', async step => { await engine.faucet(step); await api.refresh() }, '5,000 test USDG is in your wallet.')
  const copy = async () => { try { await navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ } }
  // Live version: one transaction per token. The demo applies them together.
  const shieldAll = () => run('Shielding', async step => {
    for (const [k, v] of Object.entries(s.walletBal)) { await engine.shield(k, v, step); api.log({ kind: 'shield', title: 'Shielded ' + k, detail: amt4(k, v) }) }
    await api.refresh()
  }, 'Shielded. Off the record now.')

  return (
    <div className="wrap">
      <div className="col">
        <Card className="hero">
          <div className="ghost"><Mark size={320} leaf="#252d5a" block="#313c74" /></div>
          <div className="lab">
            <span>Your private balance</span>
            <span className="heroR">
              <button className="addr" onClick={copy} title="Copy your Hagi address">{copied ? 'Copied' : addr.slice(0, 9) + '…' + addr.slice(-4)}<Icon name="copy" size={13} /></button>
              <button className="addr plain" onClick={api.toggleHidden}>{s.hidden ? 'Show amounts' : 'Hide amounts'}</button>
            </span>
          </div>
          <div className="big">{s.hidden ? <Censor seed="balance" cols={12} cell={22} onDark /> : <>${whole}<small>.{cents}</small></>}</div>
          <div className="qas">
            <button className="qa p" onClick={() => openForm('shield')}><i><Icon name="down" /></i>Shield</button>
            <button className="qa" onClick={() => openForm('unshield')}><i><Icon name="up" /></i>Unshield</button>
            <button className="qa" onClick={() => go('swap')}><i><Icon name="swap" /></i>Swap</button>
            <button className="qa" onClick={() => go('send')}><i><Icon name="right" /></i>Send</button>
          </div>
        </Card>

        {unshielded > 0 && (
          <div className="nudge">
            <span><i><Icon name="alert" /></i><span><b>{usd(unshielded)} in your wallet isn’t private yet.</b><em>Shield it to add it to your private balance.</em></span></span>
            <button className="btn sm" onClick={shieldAll}>Shield all</button>
          </div>
        )}

        <Card title="Your stocks and cash">
          {holdings.length === 0 ? (
            <div className="empty">
              <b>Nothing here yet</b>
              <p>{needsEth ? 'First get free testnet ETH for gas from the Robinhood faucet. Then come back and claim test USDG.' : Object.keys(s.walletBal).length ? 'You have test funds in your wallet. Shield them to start.' : 'Claim free test USDG, then shield it to start. Nothing here is real money.'}</p>
              {(needsEth || !Object.keys(s.walletBal).length) && <button className="btn sm" onClick={faucet}>{needsEth ? 'Open the ETH faucet' : 'Get test USDG'}</button>}
            </div>
          ) : <>
            {!s.hidden && holdings.length > 1 && (
              <div className="mix">
                <div className="mixbar">{holdings.map(([k, v], i) => <i key={k} style={{ width: (v * token(k).price / bal) * 100 + '%', background: MIX[i % MIX.length] }} title={k} />)}</div>
                <div className="mixkey">{holdings.map(([k, v], i) => <span key={k}><i style={{ background: MIX[i % MIX.length] }} />{k} {Math.round((v * token(k).price / bal) * 100)}%</span>)}</div>
              </div>
            )}
            {holdings.map(([k, v]) => (
              <div className="row hold" key={k}>
                <TokenIcon symbol={k} />
                <div className="g"><b>{token(k).name}</b><span>{k}</span></div>
                <div className="rowacts">
                  <button className="chip line" onClick={() => go('swap?from=' + k)}>Swap</button>
                  <button className="chip line" onClick={() => go('send?token=' + k)}>Send</button>
                </div>
                <div className="r"><b><Amount value={v * token(k).price} seed={k + 'v'} prefix="$" /></b><span><Amount value={v} seed={k + 'q'} digits={k === 'USDG' ? 2 : 4} cell={6} /> {k}</span></div>
              </div>
            ))}
          </>}
        </Card>

        <Card title="Popular baskets" action={<button className="tag" onClick={() => go('baskets')}>See all</button>}>
          <div className="minis">{popular.map(b => (
            <div className="mini" key={b.id}>
              <div className="st">{b.items.slice(0, 4).map(it => <TokenIcon key={it.symbol} symbol={it.symbol} size={34} />)}{b.items.length > 4 && <span className="ti more">+{b.items.length - 4}</span>}</div>
              <b>{b.name}</b>
              <span>{b.items.length} stocks · {b.buyers} buyers</span>
              <button className="chip strong" onClick={() => go('baskets?buy=' + b.id)}>Buy</button>
            </div>
          ))}</div>
        </Card>
      </div>

      <div className="col">
        <Card className={flash ? 'flash' : ''}>
          <div className="tabs"><button className={tab === 'shield' ? 'on' : ''} onClick={() => setTab('shield')}>Shield</button><button className={tab === 'unshield' ? 'on' : ''} onClick={() => setTab('unshield')}>Unshield</button></div>
          <AmountField label={tab === 'shield' ? 'From your wallet' : 'From your private balance'} value={amt} onChange={setAmt}
            hint={<>{tab === 'shield' ? 'Wallet balance' : 'Private balance'} {fmt(have, cur === 'USDG' ? 2 : 4)} {cur}</>} onMax={() => setAmt(asInput(have))}
            right={<TokenPicker value={cur} onChange={setSym} options={options} balances={s.hidden ? undefined : src} />} inputRef={amountRef} />
          <button className="btn" disabled={n <= 0 || n > have} onClick={() => run(tab === 'shield' ? 'Shielding' : 'Unshielding', async step => {
            await engine[tab](cur, n, step)
            api.log({ kind: tab, title: (tab === 'shield' ? 'Shielded ' : 'Unshielded ') + cur, detail: amt4(cur, n) })
            setAmt(''); await api.refresh()
          }, tab === 'shield' ? 'Shielded. Off the record now.' : 'Unshielded. Back on the record.')}>
            {n <= 0 ? 'Enter an amount' : n > have ? 'Not enough ' + cur : (tab === 'shield' ? 'Shield ' : 'Unshield ') + fmt(n) + ' ' + cur}
          </button>
          {tab === 'shield' && <button className="link center" onClick={faucet}>{needsEth ? 'Need gas? Open the ETH faucet' : 'Get 5,000 test USDG (once a day)'}</button>}
          <Visibility pub={tab === 'shield' ? 'this deposit: your wallet and the amount.' : 'this withdrawal: the receiving wallet and the amount.'} priv="your balance and what you hold." />
        </Card>
        <Card title="Recent activity" action={<button className="tag" onClick={() => go('activity')}>See all</button>}>
          <ActivityList limit={4} />
        </Card>
      </div>
    </div>
  )
}
