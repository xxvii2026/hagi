import { useState } from 'react'
import { asInput, STOCKS, TOKENS, fmt, fromUnits, toUnits, token } from '../data'
import * as engine from '../engine'
import { hashParam } from '../nav'
import { useStore } from '../store'
import { AmountField, Card, Icon, NeedAccount, TokenIcon, TokenPicker, Visibility, type Run } from '../ui'

export function Swap({ run }: { run: Run }) {
  const { s, api } = useStore()
  const all = TOKENS.map(t => t.symbol)
  const start = hashParam('from')
  const [from, setFrom] = useState(start && all.includes(start) ? start : 'USDG')
  const [to, setTo] = useState(start && start !== 'USDG' ? 'USDG' : 'TSLA')
  const [amt, setAmt] = useState('')
  const n = parseFloat(amt) || 0
  const have = s.shielded[from] ?? 0
  const out = fromUnits(engine.estimate(from, to, toUnits(n, token(from).decimals)), token(to).decimals)
  const flip = () => { setFrom(to); setTo(from); setAmt('') }
  return (
    <div className="wrap c">
      <div className="ptitle"><h2><span>Swap,</span> off the record.</h2><p>Trade from your private balance, straight out of the vault and back in.</p></div>
      <Card>
        <AmountField label="You pay" value={amt} onChange={setAmt} hint={<>You have {fmt(have, from === 'USDG' ? 2 : 4)} {from}</>} onMax={() => setAmt(asInput(have))}
          right={<TokenPicker value={from} onChange={v => { if (v === to) setTo(from); setFrom(v) }} options={all} balances={s.shielded} />} />
        <button className="flip" onClick={flip} aria-label="Switch tokens"><Icon name="down" /></button>
        <AmountField label="You get" value={n ? fmt(out, to === 'USDG' ? 2 : 4) : ''} readOnly hint={n ? <>About ${fmt(n * token(from).price)}</> : <>&nbsp;</>}
          right={<TokenPicker value={to} onChange={v => { if (v === from) setFrom(to); setTo(v) }} options={all} balances={s.shielded} />} />
        <div className="kvs">
          <div className="kv"><span>Price</span><b>{token(from).price > 0 ? <>1 {to} = {fmt(token(to).price / token(from).price, from === 'USDG' ? 2 : 4)} {from}</> : 'Loading'}</b></div>
          <div className="kv"><span>Route</span><b>Hagi test pools</b></div>
          <div className="kv"><span>Slippage limit</span><b>0.5%</b></div>
        </div>
        {!(s.wallet && s.hagiAddress) ? <NeedAccount /> : <button className="btn" disabled={n <= 0 || n > have} onClick={() => run('Swapping', async step => {
          const got = await engine.swap(from, to, n, step)
          api.log({ kind: 'swap', title: `Swapped ${from} for ${to}`, detail: fmt(got, to === 'USDG' ? 2 : 4) + ' ' + to })
          setAmt(''); await api.refresh()
        }, 'Done. Swapped inside the vault.')}>
          {n <= 0 ? 'Enter an amount' : n > have ? 'Not enough ' + from : 'Swap'}
        </button>}
      </Card>
      <div className="col n">
        <Card title="What others can see">
          <Visibility pub="that someone swapped these tokens, and how much. A relayer sends it, so your wallet isn’t on it." priv="who made the swap, your balance and your other holdings." />
        </Card>
        <Card title="Popular right now">
          <div className="pop">{STOCKS.map(x => x.symbol).map(t => <button key={t} className="chip" onClick={() => { if (t === from) setFrom(to); setTo(t) }}><TokenIcon symbol={t} size={26} />{t}</button>)}</div>
        </Card>
      </div>
    </div>
  )
}
