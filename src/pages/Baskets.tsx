import { useState } from 'react'
import { asInput, MAX_BASKET, STOCKS, fmt, token, type Basket } from '../data'
import * as engine from '../engine'
import { hashParam } from '../nav'
import { useStore } from '../store'
import { AmountField, Card, Icon, TokenIcon, Visibility, type Run } from '../ui'

/** Draws a branded 1200x675 image of a basket and downloads it, ready to post. */
function shareBasket(b: Basket) {
  const c = document.createElement('canvas'); c.width = 2400; c.height = 1350
  const x = c.getContext('2d')!; x.scale(2, 2)
  x.fillStyle = '#1b2140'; x.fillRect(0, 0, 1200, 675)
  const leaf = (px: number, py: number, sx: number, sy: number, k: number) => { x.save(); x.translate(px, py); x.scale(sx * k, sy * k); x.fill(new Path2D('M0 23A23 23 0 0 1 23 0A23 23 0 0 1 46 23V46H23A23 23 0 0 1 0 23Z')); x.restore() }
  const mark = (px: number, py: number, k: number, l: string, bl: string) => { x.fillStyle = l; leaf(px, py, 1, 1, k); leaf(px + 100 * k, py, -1, 1, k); leaf(px, py + 100 * k, 1, -1, k); x.fillStyle = bl; x.fillRect(px + 54 * k, py + 54 * k, 42 * k, 42 * k) }
  mark(760, 150, 5.4, '#20264b', '#2b3566')
  mark(88, 80, 0.34, '#ffffff', '#566eba')
  x.fillStyle = '#fff'; x.font = '600 34px "Inter Variable", Inter, sans-serif'; x.fillText('hagi', 134, 108)
  x.fillStyle = '#7f86ad'; x.font = '500 15px ui-monospace, monospace'; x.fillText('BASKET · ' + b.items.length + ' STOCKS', 88, 236)
  x.fillStyle = '#fff'; x.font = '400 76px "Inter Variable", Inter, sans-serif'; x.fillText(b.name, 86, 318)
  b.items.forEach((it, i) => {
    const y = 380 + i * 30
    x.fillStyle = '#fff'; x.font = '500 19px "Inter Variable", Inter, sans-serif'; x.fillText(it.symbol, 88, y)
    x.fillStyle = '#2b3566'; x.fillRect(160, y - 9, 360, 5); x.fillStyle = '#566eba'; x.fillRect(160, y - 9, 360 * it.weight / 100, 5)
    x.fillStyle = '#7f86ad'; x.fillText(it.weight + '%', 540, y)
  })
  x.fillStyle = '#7f86ad'; x.font = '400 18px "Inter Variable", Inter, sans-serif'; x.fillText('Buy this mix in one transaction on Hagi · Robinhood Chain Testnet', 88, 620)
  const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'hagi-basket-' + b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png'; a.click()
}

function BuyModal({ b, close, run }: { b: Basket; close: () => void; run: Run }) {
  const { s, api } = useStore()
  const [amt, setAmt] = useState('')
  const n = parseFloat(amt) || 0
  const have = s.shielded.USDG ?? 0
  return (
    <div className="overlay" onClick={close}><div className="modal wide" onClick={e => e.stopPropagation()}>
      <div className="ch"><span>{b.name}</span><button className="x" onClick={close} aria-label="Close"><Icon name="close" size={15} /></button></div>
      <p className="muted">Created by {b.creator} · {b.buyers} buyers</p>
      <div className="weights">{b.items.map(it => <div className="wb" key={it.symbol}><TokenIcon symbol={it.symbol} size={28} /><span>{it.symbol}</span><div className="bar"><i style={{ width: it.weight + '%' }} /></div><b>{it.weight}%{n > 0 && <em>{fmt((n * it.weight) / 100 / token(it.symbol).price, 3)}</em>}</b></div>)}</div>
      <AmountField label="Amount" value={amt} onChange={setAmt} hint={<>You have {fmt(have)} USDG</>} onMax={() => setAmt(asInput(have))} right={<span className="unit">USDG</span>} />
      <button className="btn" disabled={n <= 0 || n > have} onClick={() => { close(); run('Buying ' + b.name, async step => {
        await engine.buyBasket(b, n, step)
        api.log({ kind: 'basket', title: 'Bought basket: ' + b.name, detail: fmt(n) + ' USDG' })
        await api.refresh()
      }, 'Bought. Straight into the vault.') }}>{n <= 0 ? 'Enter an amount' : n > have ? 'Not enough USDG' : 'Buy basket'}</button>
      <Visibility pub="that someone bought this basket, and for how much." priv="who bought it and your balance." />
    </div></div>
  )
}

/** Reads a mix handed over from the landing page, e.g. #/baskets?name=Chips&mix=AMD:60,PLTR:40 */
function handedOver() {
  const mix = hashParam('mix'); if (!mix) return null
  const w: Record<string, number> = {}
  for (const part of mix.split(',')) { const [k, v] = part.split(':'); if (STOCKS.some(s => s.symbol === k) && Number(v) > 0) w[k] = Math.round(Number(v)) }
  return Object.keys(w).length >= 2 ? { name: (hashParam('name') ?? '').slice(0, 32), w } : null
}

function CreateModal({ close, run, start }: { close: () => void; run: Run; start?: { name: string; w: Record<string, number> } | null }) {
  const { api } = useStore()
  const [name, setName] = useState(start?.name ?? '')
  const [w, setW] = useState<Record<string, number>>(start?.w ?? {})
  const picked = Object.keys(w)
  const sum = picked.reduce((t, k) => t + (w[k] || 0), 0)
  const toggle = (sym: string) => { const n = { ...w }; if (sym in n) delete n[sym]; else if (picked.length < MAX_BASKET) n[sym] = 0; setW(n) }
  const even = () => { const base = Math.floor(100 / picked.length); const n: Record<string, number> = {}; picked.forEach((k, i) => (n[k] = base + (i < 100 - base * picked.length ? 1 : 0))); setW(n) }
  const ok = name.trim().length >= 2 && picked.length >= 2 && sum === 100 && picked.every(k => w[k] > 0)
  return (
    <div className="overlay" onClick={close}><div className="modal wide" onClick={e => e.stopPropagation()}>
      <div className="ch"><span>Create a basket</span><button className="x" onClick={close} aria-label="Close"><Icon name="close" size={15} /></button></div>
      <div className="fld"><span className="fl">Name</span><input className="txt" placeholder="e.g. Chip makers" maxLength={32} value={name} onChange={e => setName(e.target.value)} aria-label="Basket name" /></div>
      <span className="fl pad">Pick 2 to {MAX_BASKET} stocks</span>
      <div className="pop">{STOCKS.map(t => <button key={t.symbol} className={'chip ' + (t.symbol in w ? 'on' : '')} onClick={() => toggle(t.symbol)}><TokenIcon symbol={t.symbol} size={26} />{t.symbol}</button>)}</div>
      {picked.length > 0 && <>
        <div className="lab pad"><span>Weights · total {sum}%</span><button className="tag" onClick={even}>Split evenly</button></div>
        <div className="weights">{picked.map(k => <div className="wb" key={k}><TokenIcon symbol={k} size={28} /><span>{k}</span><div className="bar"><i style={{ width: Math.min(100, w[k] || 0) + '%' }} /></div><input className="pct" inputMode="numeric" value={w[k] || ''} onChange={e => setW({ ...w, [k]: Math.min(100, parseInt(e.target.value.replace(/\D/g, '')) || 0) })} aria-label={k + ' weight'} /></div>)}</div>
      </>}
      <button className="btn" disabled={!ok} onClick={() => { close(); run('Creating your basket', async step => { await engine.createBasket(name.trim(), picked.map(k => ({ symbol: k, weight: w[k] })), step); await api.refresh() }, 'Basket created. It’s permanent now.') }}>{picked.length >= 2 && sum !== 100 ? `Weights must total 100% (now ${sum}%)` : 'Create basket'}</button>
      <p className="muted small">A basket can’t be changed after it’s created. To change the mix, make a new one.</p>
    </div></div>
  )
}

export function Baskets({ run }: { run: Run }) {
  const { s } = useStore()
  const [sort, setSort] = useState<'top' | 'new' | 'mine'>('top')
  const [buy, setBuy] = useState<Basket | null>(() => s.baskets.find(b => String(b.id) === hashParam('buy')) ?? null)
  const [start, setStart] = useState(handedOver)
  const [creating, setCreating] = useState(!!start)
  const me = s.wallet ? s.wallet.slice(0, 6) + '…' + s.wallet.slice(-4) : ''
  const list = [...s.baskets].filter(b => sort !== 'mine' || b.creator.toLowerCase() === me.toLowerCase()).sort((a, b) => (sort === 'new' ? b.created - a.created : b.buyers - a.buyers))
  return (
    <div className="wrap one">
      <div className="bhd"><div><h2><span>Baskets,</span> in one go.</h2><p>Buy a ready-made mix of stocks in one transaction. Anyone can make one.</p></div><button className="btn o" onClick={() => setCreating(true)}>+ Create a basket</button></div>
      <div className="seg">{([['top', 'Most bought'], ['new', 'Newest'], ['mine', 'Mine']] as const).map(([k, t]) => <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{t}</button>)}</div>
      {list.length === 0 ? <Card><div className="empty"><b>You haven’t made a basket yet</b><p>Pick a few stocks, set the weights and share it.</p><button className="btn sm" onClick={() => setCreating(true)}>Create a basket</button></div></Card> : (
        <div className="grid">{list.map(b => (
          <Card key={b.id} className="bk">
            <div className="st">{b.items.slice(0, 5).map(it => <TokenIcon key={it.symbol} symbol={it.symbol} size={34} />)}{b.items.length > 5 && <span className="ti more">+{b.items.length - 5}</span>}</div>
            <div className="bn">{b.name}</div>
            <div className="bm">{b.items.length} stocks · by {b.creator}</div>
            <div className="bf"><span>{b.buyers} buyers</span><span className="acts"><button className="chip line" onClick={() => shareBasket(b)}>Share</button><button className="chip strong" onClick={() => setBuy(b)}>Buy</button></span></div>
          </Card>
        ))}</div>
      )}
      {buy && <BuyModal b={buy} close={() => setBuy(null)} run={run} />}
      {creating && <CreateModal close={() => { setCreating(false); if (start) { setStart(null); history.replaceState(null, '', '#/baskets') } }} run={run} start={start} />}
    </div>
  )
}
