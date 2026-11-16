import { useState } from 'react'
import { TOKENS, fmt, token } from '../data'
import { hashParam } from '../nav'
import { useStore } from '../store'
import { AmountField, Card, TokenIcon, TokenPicker, Visibility } from '../ui'

export function Swap({ run }: { run: (title: string, fn: () => void) => void }) {
  const { s, d } = useStore()
  const all = TOKENS.map(t => t.symbol)
  const start = hashParam('from')
  const [from, setFrom] = useState(start && all.includes(start) ? start : 'USDG')
  const [to, setTo] = useState(start && start !== 'USDG' ? 'USDG' : 'TSLA')
  const [amt, setAmt] = useState('')
  const n = parseFloat(amt) || 0
  const have = s.shielded[from] ?? 0
  const out = (n * token(from).price) / token(to).price
  const flip = () => { setFrom(to); setTo(from); setAmt('') }
  return (
    <div className="wrap c">
      <Card title="Swap">
        <AmountField label="You pay" value={amt} onChange={setAmt} hint={<>You have {fmt(have, from === 'USDG' ? 2 : 4)} {from}</>} onMax={() => setAmt(String(have))}
          right={<TokenPicker value={from} onChange={v => { if (v === to) setTo(from); setFrom(v) }} options={all} />} />
        <button className="flip" onClick={flip} aria-label="Switch tokens">↓</button>
        <AmountField label="You get" value={n ? fmt(out, to === 'USDG' ? 2 : 4) : ''} readOnly hint={n ? <>About ${fmt(n * token(from).price)}</> : <>&nbsp;</>}
          right={<TokenPicker value={to} onChange={v => { if (v === from) setFrom(to); setTo(v) }} options={all} />} />
        <div className="kvs">
          <div className="kv"><span>Price</span><b>1 {to} = {fmt(token(to).price / token(from).price, 2)} {from}</b></div>
          <div className="kv"><span>Route</span><b>Uniswap</b></div>
          <div className="kv"><span>Slippage limit</span><b>0.5%</b></div>
        </div>
        <button className="btn" disabled={n <= 0 || n > have} onClick={() => run('Swapping', () => { d({ type: 'swap', from, to, amount: n }); setAmt('') })}>
          {n <= 0 ? 'Enter an amount' : n > have ? 'Not enough ' + from : 'Swap'}
        </button>
      </Card>
      <div className="col n">
        <Card title="What others can see">
          <Visibility pub="this swap: your wallet, the tokens and the amounts." priv="your total balance and your other holdings." />
        </Card>
        <Card title="Popular right now">
          <div className="pop">{['TSLA', 'NVDA', 'AAPL', 'MSFT', 'AMZN', 'META'].map(t => <button key={t} className="chip" onClick={() => { if (t === from) setFrom(to); setTo(t) }}><TokenIcon symbol={t} size={26} />{t}</button>)}</div>
        </Card>
      </div>
    </div>
  )
}
