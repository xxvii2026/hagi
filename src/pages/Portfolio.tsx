import { useState } from 'react'
import { FAUCET_URL, DEMO_MODE } from '../chain'
import { fmt, token, usd } from '../data'
import { go } from '../nav'
import { total, useStore } from '../store'
import { Amount, AmountField, Card, Censor, Mark, TokenIcon, TokenPicker, Visibility } from '../ui'
import { ActivityList } from './Activity'

const MIX = ['#1b2140', '#566eba', '#8696cf', '#b0a7b8', '#3a4a8a', '#c9d1ee', '#7f86ad', '#d9def0']

export function Portfolio({ run }: { run: (title: string, fn: () => void) => void }) {
  const { s, d } = useStore()
  const [tab, setTab] = useState<'shield' | 'unshield'>('shield')
  const [sym, setSym] = useState('USDG')
  const [amt, setAmt] = useState('')
  const [copied, setCopied] = useState(false)
  const src = tab === 'shield' ? s.walletBal : s.shielded
  const options = Object.keys(src).length ? Object.keys(src) : ['USDG']
  const cur = options.includes(sym) ? sym : options[0]
  const have = src[cur] ?? 0
  const n = parseFloat(amt) || 0
  const bal = total(s.shielded)
  const [whole, cents] = fmt(bal).split('.')
  const holdings = Object.entries(s.shielded).sort((a, b) => b[1] * token(b[0]).price - a[1] * token(a[0]).price)
  const unshielded = total(s.walletBal)
  const popular = [...s.baskets].sort((a, b) => b.buyers - a.buyers).slice(0, 3)
  const addr = s.hagiAddress ?? ''
  const faucet = () => { if (DEMO_MODE) d({ type: 'faucet' }); window.open(FAUCET_URL, '_blank', 'noopener') }
  const copy = async () => { try { await navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ } }
  // Live version: one transaction per token. The demo applies them together.
  const shieldAll = () => run('Shielding', () => Object.entries(s.walletBal).forEach(([k, v]) => d({ type: 'shield', symbol: k, amount: v })))

  return (
    <div className="wrap">
      <div className="col">
        <Card className="hero">
          <div className="ghost"><Mark size={320} leaf="#252d5a" block="#313c74" /></div>
          <div className="lab">
            <span>Your private balance</span>
            <span className="heroR">
              <button className="addr" onClick={copy} title="Copy your Hagi address">{copied ? 'Copied' : addr.slice(0, 9) + '…' + addr.slice(-4)}<i>⧉</i></button>
              <button className="link" onClick={() => d({ type: 'toggleHidden' })}>{s.hidden ? 'Show' : 'Hide'}</button>
            </span>
          </div>
          <div className="big">{s.hidden ? <Censor seed="balance" cols={12} cell={22} onDark /> : <>${whole}<small>.{cents}</small></>}</div>
          <div className="qas">
            <button className="qa p" onClick={() => setTab('shield')}><i>↓</i>Shield</button>
            <button className="qa" onClick={() => setTab('unshield')}><i>↑</i>Unshield</button>
            <button className="qa" onClick={() => go('swap')}><i>⇄</i>Swap</button>
            <button className="qa" onClick={() => go('send')}><i>→</i>Send</button>
          </div>
        </Card>

        {unshielded > 0 && (
          <div className="nudge">
            <span><i />You have <b>{usd(unshielded)}</b> in your wallet that isn’t private yet.</span>
            <button className="chip strong" onClick={shieldAll}>Shield all</button>
          </div>
        )}

        <Card title="Your stocks and cash">
          {holdings.length === 0 ? (
            <div className="empty">
              <b>Nothing here yet</b>
              <p>Get free test funds, then shield them to start. This is a testnet, so nothing here is real money.</p>
              <button className="btn sm" onClick={faucet}>Get test funds</button>
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
                  <button className="chip" onClick={() => go('swap?from=' + k)}>Swap</button>
                  <button className="chip" onClick={() => go('send?token=' + k)}>Send</button>
                </div>
                <div className="r"><b><Amount value={v * token(k).price} seed={k + 'v'} prefix="$" /></b><span><Amount value={v} seed={k + 'q'} digits={k === 'USDG' ? 2 : 4} cell={6} /> {k}</span></div>
              </div>
            ))}
          </>}
        </Card>

        <Card title="Popular baskets" action={<button className="link" onClick={() => go('baskets')}>See all</button>}>
          <div className="minis">{popular.map(b => (
            <div className="mini" key={b.id}>
              <div className="st">{b.items.slice(0, 4).map(it => <TokenIcon key={it.symbol} symbol={it.symbol} size={28} />)}{b.items.length > 4 && <span className="ti more sm">+{b.items.length - 4}</span>}</div>
              <b>{b.name}</b>
              <span>{b.items.length} stocks · {b.buyers} buyers</span>
              <button className="chip strong" onClick={() => go('baskets?buy=' + b.id)}>Buy</button>
            </div>
          ))}</div>
        </Card>
      </div>

      <div className="col">
        <Card>
          <div className="tabs"><button className={tab === 'shield' ? 'on' : ''} onClick={() => setTab('shield')}>Shield</button><button className={tab === 'unshield' ? 'on' : ''} onClick={() => setTab('unshield')}>Unshield</button></div>
          <AmountField label={tab === 'shield' ? 'From your wallet' : 'From your private balance'} value={amt} onChange={setAmt}
            hint={<>{tab === 'shield' ? 'Wallet balance' : 'Private balance'} {fmt(have)} {cur}</>} onMax={() => setAmt(String(have))}
            right={<TokenPicker value={cur} onChange={setSym} options={options} />} />
          <button className="btn" disabled={n <= 0 || n > have} onClick={() => run(tab === 'shield' ? 'Shielding' : 'Unshielding', () => { d({ type: tab, symbol: cur, amount: n }); setAmt('') })}>
            {n > have ? 'Not enough ' + cur : (tab === 'shield' ? 'Shield ' : 'Unshield ') + (n ? fmt(n) + ' ' + cur : '')}
          </button>
          {have === 0 && tab === 'shield' && <button className="link center" onClick={faucet}>Wallet empty? Get test funds</button>}
          <Visibility pub={tab === 'shield' ? 'this deposit: your wallet and the amount.' : 'this withdrawal: the receiving wallet and the amount.'} priv="your balance and what you hold." />
        </Card>
        <Card title="Recent activity" action={<button className="link" onClick={() => go('activity')}>See all</button>}>
          <ActivityList limit={4} />
        </Card>
      </div>
    </div>
  )
}
