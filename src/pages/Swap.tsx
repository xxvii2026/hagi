import { useEffect, useState } from 'react'
import { CFG } from '../chain'
import { asInput, STOCKS, TOKENS, fmt, fromUnits, toUnits, token } from '../data'
import * as engine from '../engine'
import { hashParam } from '../nav'
import { useStore } from '../store'
import { AmountField, Card, Icon, NeedAccount, TokenIcon, TokenPicker, type Run } from '../ui'

export function Swap({ run }: { run: Run }) {
  const { s, api } = useStore()
  const all = TOKENS.map(t => t.symbol)
  const start = hashParam('from')
  const [from, setFrom] = useState(start && all.includes(start) ? start : 'USDG')
  const [to, setTo] = useState(start && start !== 'USDG' ? 'USDG' : 'TSLA')
  // Mainnet: each private transaction pays the relayer back for gas, in the token you pay with.
  const [fee, setFee] = useState<number | null>(null)
  useEffect(() => { if (!CFG.mainnet) return; let on = true; setFee(null); engine.networkFee(from, 1).then(f => on && setFee(f)).catch(() => {}); return () => { on = false } }, [from])
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
          <div className="kv"><span>Route</span><b>{CFG.mainnet ? 'Uniswap' : 'Hagi test pools'}</b></div>
          {CFG.mainnet && <div className="kv"><span>Network fee</span><b>{fee === null ? 'Loading' : <>{fmt(fee, from === 'USDG' ? 2 : 6)} {from}</>}</b></div>}
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
        <Card title="Popular right now">
          <div className="pop">{STOCKS.slice(0, 12).map(x => x.symbol).map(t => <button key={t} className="chip" onClick={() => { if (t === from) setFrom(to); setTo(t) }}><TokenIcon symbol={t} size={26} />{t}</button>)}</div>
        </Card>
      </div>
    </div>
  )
}
