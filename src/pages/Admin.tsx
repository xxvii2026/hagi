// Admin dashboard: what is happening on Hagi, read from public chain data and the relayer's status endpoint.
// Everything shown here is already public on the explorer. Nothing private (notes, keys, who owns what) is read.
import { useEffect, useMemo, useState } from 'react'
import { createPublicClient, http, parseAbi, parseAbiItem, zeroAddress, type Hex } from 'viem'
import { CFG, chain } from '../chain'
import { TOKENS, fmt, fromUnits, short, tokenByAddress } from '../data'

const client = createPublicClient({ chain, transport: http(CFG.rpc, { batch: { wait: 20, batchSize: 20 }, retryCount: 3, retryDelay: 500 }) })
const CHUNK = 5_000_000n
const VAULT = CFG.contracts.vault
const E = {
  commit: parseAbiItem('event NewCommitment(uint256 indexed commitment, uint256 index, address token, uint256 amount, bytes encryptedNote)'),
  nullifier: parseAbiItem('event NewNullifier(uint256 indexed nullifier)'),
  transfer: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
  created: parseAbiItem('event BasketCreated(uint256 indexed id, address indexed creator, string name, address[] tokens, uint16[] weights)'),
  bought: parseAbiItem('event BasketBought(uint256 indexed id, uint64 buyers)'),
}
const poolsAbi = parseAbi(['function pools(address token) view returns (uint128 reserveToken, uint128 reserveQuote)'])
const balAbi = parseAbi(['function balanceOf(address) view returns (uint256)'])
const adapterAbi = parseAbi(['function adapter() view returns (address)'])

type Kind = 'shield' | 'swap' | 'basket' | 'send' | 'unshield'
// Colours checked with the dataviz palette validator (light surface, adjacent order below).
const KINDS: { k: Kind; label: string; color: string }[] = [
  { k: 'shield', label: 'Shield', color: '#566eba' },
  { k: 'swap', label: 'Swap', color: '#e0a23a' },
  { k: 'basket', label: 'Basket buy', color: '#2f9e7a' },
  { k: 'send', label: 'Private send', color: '#8a7fd6' },
  { k: 'unshield', label: 'Unshield', color: '#c0567a' },
]
const KIND = Object.fromEntries(KINDS.map(x => [x.k, x])) as Record<Kind, (typeof KINDS)[number]>

type Act = { hash: Hex; block: bigint; time: number; kind: Kind; symbol: string; amount: number; usd: number; who?: string; out?: string; basket?: number }
type Data = {
  acts: Act[]
  faucet: { time: number; to: string }[]
  holdings: { symbol: string; amount: number; usd: number }[]
  pools: { symbol: string; stock: number; usdg: number; price: number }[]
  notes: number; spent: number
  baskets: { created: number; bought: number; top: { id: number; name: string; buyers: number }[] }
  relayer: { address: string | null; ok: boolean; eth: number | null; error?: string }
  latest: bigint; at: number
}

async function logs<T>(get: (from: bigint, to: bigint) => Promise<T[]>, latest: bigint): Promise<T[]> {
  const out: T[] = []
  for (let f = BigInt(CFG.deployBlock); f <= latest; f += CHUNK) out.push(...(await get(f, f + CHUNK - 1n > latest ? latest : f + CHUNK - 1n)))
  return out
}

// Block times never change, so they are kept between visits.
const TS_SLOT = 'hagi-admin-ts-' + VAULT.slice(2, 10).toLowerCase()
async function blockTimes(blocks: bigint[]) {
  let cache: Record<string, number> = {}
  try { cache = JSON.parse(localStorage.getItem(TS_SLOT) ?? '{}') } catch { /* fresh */ }
  const missing = [...new Set(blocks.map(String))].filter(b => !(b in cache))
  for (let i = 0; i < missing.length; i += 20) {
    const got = await Promise.all(missing.slice(i, i + 20).map(b => client.getBlock({ blockNumber: BigInt(b) })))
    got.forEach(b => { cache[String(b.number)] = Number(b.timestamp) })
  }
  try { localStorage.setItem(TS_SLOT, JSON.stringify(cache)) } catch { /* optional */ }
  return (b: bigint) => cache[String(b)] ?? 0
}

async function load(): Promise<Data> {
  const latest = await client.getBlockNumber()
  const addrs = TOKENS.map(t => t.address)
  const [commits, nulls, outs, ins, mints, created, bought] = await Promise.all([
    logs((fromBlock, toBlock) => client.getLogs({ address: VAULT, event: E.commit, fromBlock, toBlock }), latest),
    logs((fromBlock, toBlock) => client.getLogs({ address: VAULT, event: E.nullifier, fromBlock, toBlock }), latest),
    logs((fromBlock, toBlock) => client.getLogs({ address: addrs, event: E.transfer, args: { from: VAULT }, fromBlock, toBlock }), latest),
    logs((fromBlock, toBlock) => client.getLogs({ address: addrs, event: E.transfer, args: { to: VAULT }, fromBlock, toBlock }), latest),
    logs((fromBlock, toBlock) => client.getLogs({ address: CFG.contracts.usdg, event: E.transfer, args: { from: zeroAddress }, fromBlock, toBlock }), latest),
    logs((fromBlock, toBlock) => client.getLogs({ address: CFG.contracts.basketRegistry, event: E.created, fromBlock, toBlock }), latest),
    logs((fromBlock, toBlock) => client.getLogs({ address: CFG.contracts.basketRegistry, event: E.bought, fromBlock, toBlock }), latest),
  ])

  // Prices and holdings
  const stocks = TOKENS.filter(t => t.symbol !== 'USDG')
  const [reserves, balances, relayer, adapterAddr] = await Promise.all([
    Promise.all(stocks.map(t => client.readContract({ address: CFG.contracts.swap, abi: poolsAbi, functionName: 'pools', args: [t.address] }).catch(() => [0n, 0n] as const))),
    Promise.all(TOKENS.map(t => client.readContract({ address: t.address, abi: balAbi, functionName: 'balanceOf', args: [VAULT] }).catch(() => 0n))),
    fetch(CFG.relayerUrl).then(r => r.json()).then((j: { relayer: string | null; keyValid: boolean; chainReachable: boolean; balanceEth: string | null }) =>
      ({ address: j.relayer, ok: j.keyValid && j.chainReachable, eth: j.balanceEth === null ? null : Number(j.balanceEth) }),
    ).catch(e => ({ address: null, ok: false, eth: null, error: String(e?.message ?? e) })),
    client.readContract({ address: VAULT, abi: adapterAbi, functionName: 'adapter' }),
  ])
  const price: Record<string, number> = { USDG: 1 }
  const pools = stocks.map((t, i) => {
    const [rt, rq] = reserves[i] as readonly [bigint, bigint]
    const stock = fromUnits(rt, t.decimals), usdg = fromUnits(rq, 6)
    price[t.symbol] = stock ? usdg / stock : 0
    return { symbol: t.symbol, stock, usdg, price: price[t.symbol] }
  })
  const holdings = TOKENS.map((t, i) => { const amount = fromUnits(balances[i] as bigint, t.decimals); return { symbol: t.symbol, amount, usd: amount * price[t.symbol] } })

  // Group every log by transaction, then decide what each transaction was
  type Tx = { block: bigint; nulls: number; commits: typeof commits; outs: typeof outs; ins: typeof ins; basket?: number }
  const txs = new Map<Hex, Tx>()
  const tx = (h: Hex, block: bigint) => { let t = txs.get(h); if (!t) txs.set(h, (t = { block, nulls: 0, commits: [], outs: [], ins: [] })); return t }
  commits.forEach(l => tx(l.transactionHash, l.blockNumber).commits.push(l))
  nulls.forEach(l => { tx(l.transactionHash, l.blockNumber).nulls++ })
  outs.forEach(l => tx(l.transactionHash, l.blockNumber).outs.push(l))
  ins.forEach(l => tx(l.transactionHash, l.blockNumber).ins.push(l))
  bought.forEach(l => { const t = txs.get(l.transactionHash); if (t) t.basket = Number(l.args.id) })

  const adapter = adapterAddr.toLowerCase()
  const val = (token: string, amount: bigint) => { const t = tokenByAddress(token); return t ? fromUnits(amount, t.decimals) : 0 }
  const sym = (token: string) => tokenByAddress(token)?.symbol ?? '?'

  const time = await blockTimes([...[...txs.values()].map(t => t.block), ...mints.map(m => m.blockNumber)])
  const acts: Act[] = []
  for (const [hash, t] of txs) {
    const base = { hash, block: t.block, time: time(t.block) }
    if (t.nulls === 0) {
      const d = t.ins.find(l => l.args.from!.toLowerCase() !== adapter) ?? t.ins[0]
      if (!d) continue
      const amount = val(d.address, d.args.value!)
      acts.push({ ...base, kind: 'shield', symbol: sym(d.address), amount, usd: amount * (price[sym(d.address)] ?? 0), who: d.args.from })
      continue
    }
    const toAdapter = t.outs.filter(l => l.args.to!.toLowerCase() === adapter)
    const toOthers = t.outs.filter(l => l.args.to!.toLowerCase() !== adapter)
    if (toAdapter.length) {
      const amount = toAdapter.reduce((s, l) => s + val(l.address, l.args.value!), 0), s = sym(toAdapter[0].address)
      const outSyms = [...new Set(t.commits.filter(c => c.args.token !== zeroAddress).map(c => sym(c.args.token!)))].join(', ')
      acts.push({ ...base, kind: t.basket !== undefined ? 'basket' : 'swap', symbol: s, amount, usd: amount * (price[s] ?? 0), out: outSyms, basket: t.basket })
    } else if (toOthers.length) {
      // The withdrawal is the biggest transfer out; a relayer fee, if any, is the smaller one.
      const w = toOthers.reduce((a, b) => (b.args.value! > a.args.value! ? b : a))
      const amount = val(w.address, w.args.value!)
      acts.push({ ...base, kind: 'unshield', symbol: sym(w.address), amount, usd: amount * (price[sym(w.address)] ?? 0), who: w.args.to })
    } else acts.push({ ...base, kind: 'send', symbol: '', amount: 0, usd: 0 })
  }
  acts.sort((a, b) => Number(b.block - a.block))

  const byBuyers = new Map<number, { id: number; name: string; buyers: number }>()
  created.forEach(l => byBuyers.set(Number(l.args.id), { id: Number(l.args.id), name: l.args.name ?? '', buyers: 0 }))
  bought.forEach(l => { const b = byBuyers.get(Number(l.args.id)); if (b) b.buyers = Math.max(b.buyers, Number(l.args.buyers)) })

  return {
    acts,
    faucet: mints.map(m => ({ time: time(m.blockNumber), to: m.args.to! })),
    holdings, pools, notes: commits.length, spent: nulls.length,
    baskets: { created: created.length, bought: bought.length, top: [...byBuyers.values()].sort((a, b) => b.buyers - a.buyers).slice(0, 5) },
    relayer, latest, at: Date.now(),
  }
}

// ---------- view ----------

const ago = (s: number) => { const d = Date.now() / 1000 - s; return d < 90 ? 'just now' : d < 5400 ? `${Math.round(d / 60)}m ago` : d < 129600 ? `${Math.round(d / 3600)}h ago` : `${Math.round(d / 86400)}d ago` }
const money = (n: number) => '$' + (n >= 1e6 ? fmt(n / 1e6, 2) + 'M' : n >= 1e4 ? fmt(n / 1e3, 1) + 'K' : fmt(n, n < 100 ? 2 : 0))
const DAY = 86400

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' | 'bad' }) {
  return <div className={'ad-tile' + (tone ? ' ' + tone : '')}><div className="ad-l">{label}</div><div className="ad-v">{value}</div>{sub && <div className="ad-s">{sub}</div>}</div>
}

function Daily({ acts }: { acts: Act[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const today = Math.floor(Date.now() / 1000 / DAY)
  const days = Array.from({ length: 14 }, (_, i) => today - 13 + i)
  const rows = days.map(d => { const r = Object.fromEntries(KINDS.map(k => [k.k, 0])) as Record<Kind, number>; acts.forEach(a => { if (Math.floor(a.time / DAY) === d) r[a.kind]++ }); return r })
  const totals = rows.map(r => KINDS.reduce((s, k) => s + r[k.k], 0))
  const max = Math.max(4, ...totals), W = 760, H = 220, pad = 28, bw = (W - pad) / 14
  const step = Math.ceil(max / 4)
  const label = (d: number) => new Date(d * DAY * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <div className="ad-chart">
      <div className="ad-legend">{KINDS.map(k => <span key={k.k}><i style={{ background: k.color }} />{k.label}</span>)}</div>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 -12 ${W} ${H + 38}`} width="100%" role="img" aria-label="Private actions per day for the last 14 days">
          {Array.from({ length: 5 }, (_, i) => i * step).filter(v => v <= max).map(v => { const y = H - (v / max) * H; return <g key={v}><line x1={pad} x2={W} y1={y} y2={y} stroke="#eef0f6" /><text x={pad - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#8a8fa8">{v}</text></g> })}
          {rows.map((r, i) => {
            let y = H; const x = pad + i * bw + bw * 0.18, w = bw * 0.64
            const segs = KINDS.filter(k => r[k.k] > 0)
            return <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad + i * bw} y={0} width={bw} height={H} fill={hover === i ? 'rgba(86,110,186,.06)' : 'transparent'} />
              {segs.map((k, j) => {
                const h = (r[k.k] / max) * H, top = j === segs.length - 1
                y -= h
                const gap = j > 0 ? 2 : 0
                return top
                  ? <path key={k.k} d={`M${x},${y + h - gap} V${y + 4} Q${x},${y} ${x + 4},${y} H${x + w - 4} Q${x + w},${y} ${x + w},${y + 4} V${y + h - gap} Z`} fill={k.color} />
                  : <rect key={k.k} x={x} y={y} width={w} height={Math.max(0, h - gap)} fill={k.color} />
              })}
              {i % 2 === 1 && <text x={x + w / 2} y={H + 18} textAnchor="middle" fontSize="11" fill="#8a8fa8">{label(days[i])}</text>}
            </g>
          })}
          <line x1={pad} x2={W} y1={H} y2={H} stroke="#d9dcea" />
        </svg>
        {hover !== null && (
          <div className="ad-tip" style={{ left: `${((pad + (hover + 0.5) * bw) / W) * 100}%`, transform: `translateX(${hover > 10 ? '-100%' : hover < 3 ? '0' : '-50%'})` }}>
            <b>{label(days[hover])}</b>
            {KINDS.map(k => <div key={k.k}><i style={{ background: k.color }} />{k.label}<span>{rows[hover][k.k]}</span></div>)}
            <div className="tot">Total<span>{totals[hover]}</span></div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Admin() {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = async () => { setBusy(true); setErr(''); try { setData(await load()) } catch (e) { setErr(e instanceof Error ? e.message.split('\n')[0] : String(e)) } finally { setBusy(false) } }
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 60_000); return () => clearInterval(t) }, [])

  const s = useMemo(() => {
    if (!data) return null
    const now = Date.now() / 1000, day = (a: { time: number }) => now - a.time < DAY
    const by = (k: Kind, list = data.acts) => list.filter(a => a.kind === k)
    const priv = data.acts.filter(a => a.kind !== 'shield')
    const wallets = new Set(by('shield').map(a => a.who!.toLowerCase()))
    const testers = new Set(data.faucet.map(f => f.to.toLowerCase()))
    const tvl = data.holdings.reduce((a, h) => a + h.usd, 0)
    const last = data.acts[0]
    const alerts: { tone: 'warn' | 'bad'; text: string }[] = []
    const r = data.relayer
    if (!r.ok) alerts.push({ tone: 'bad', text: r.error ? `Relayer status could not be read (${r.error}).` : 'Relayer is misconfigured or cannot reach the chain. Check RELAYER_PRIVATE_KEY on Vercel.' })
    else if (r.eth !== null && r.eth < 0.0005) alerts.push({ tone: 'bad', text: `Relayer gas is almost out (${fmt(r.eth, 5)} ETH). Private actions will start failing. Top it up now.` })
    else if (r.eth !== null && r.eth < 0.002) alerts.push({ tone: 'warn', text: `Relayer gas is getting low (${fmt(r.eth, 5)} ETH). Top it up soon.` })
    data.pools.filter(p => p.usdg < 1000).forEach(p => alerts.push({ tone: 'warn', text: `The ${p.symbol} pool only holds ${money(p.usdg)} of USDG. Swaps into ${p.symbol} will move the price a lot.` }))
    if (last && now - last.time > 3 * DAY) alerts.push({ tone: 'warn', text: `No vault activity for ${ago(last.time).replace(' ago', '')}.` })
    return {
      tvl, wallets: wallets.size, testers: testers.size, testers24: new Set(data.faucet.filter(day).map(f => f.to.toLowerCase())).size,
      priv: priv.length, priv24: priv.filter(day).length, shields: by('shield').length, shields24: by('shield').filter(day).length,
      rows: KINDS.map(k => { const l = by(k.k); return { ...k, n: l.length, n24: l.filter(day).length, usd: l.reduce((a, x) => a + x.usd, 0) } }),
      alerts, last,
    }
  }, [data])

  return (
    <div className="ad">
      <header className="ad-head">
        <div><h1>Hagi admin</h1><p className="muted">Live from {CFG.name}. Everything here is public onchain data, nothing private is read.</p></div>
        <div className="ad-r">
          {data && <span className="muted">Block {data.latest.toLocaleString()} · updated {new Date(data.at).toLocaleTimeString()}</span>}
          <button className="btn o sm" onClick={() => void refresh()} disabled={busy}>{busy ? 'Loading…' : 'Refresh'}</button>
        </div>
      </header>

      {err && <div className="ad-alert bad">Couldn't load: {err}</div>}
      {!data && !err && <div className="card ad-load">Reading the chain…</div>}

      {data && s && <>
        {s.alerts.length ? s.alerts.map((a, i) => <div key={i} className={'ad-alert ' + a.tone}><b>{a.tone === 'bad' ? 'Action needed' : 'Heads up'}</b> {a.text}</div>)
          : <div className="ad-alert good"><b>All good</b> Relayer is funded, pools have liquidity and the vault is active.</div>}

        <div className="ad-tiles">
          <Tile label="Value in the vault" value={money(s.tvl)} sub={`${data.holdings.filter(h => h.amount > 0).length} tokens held`} />
          <Tile label="Private actions" value={s.priv.toLocaleString()} sub={`${s.priv24} in the last 24h`} />
          <Tile label="Shields" value={s.shields.toLocaleString()} sub={`${s.shields24} in the last 24h`} />
          <Tile label="Wallets that shielded" value={s.wallets.toLocaleString()} sub={`${s.testers} faucet claimers · ${s.testers24} today`} />
          <Tile label="Receipts in the tree" value={data.notes.toLocaleString()} sub={`${data.spent.toLocaleString()} nullifiers spent`} />
          <Tile label="Relayer gas" value={data.relayer.eth === null ? '–' : fmt(data.relayer.eth, 4) + ' ETH'} sub={data.relayer.address ? short(data.relayer.address) : 'status unavailable'} tone={!data.relayer.ok || (data.relayer.eth ?? 1) < 0.0005 ? 'bad' : (data.relayer.eth ?? 1) < 0.002 ? 'warn' : undefined} />
        </div>

        <div className="ad-grid">
          <section className="card"><h2>Activity, last 14 days</h2><Daily acts={data.acts} /></section>
          <section className="card"><h2>By action</h2>
            <table className="ad-t"><thead><tr><th>Action</th><th>All time</th><th>24h</th><th>Public volume</th></tr></thead>
              <tbody>{s.rows.map(r => <tr key={r.k}><td><i className="dot" style={{ background: r.color }} />{r.label}</td><td>{r.n}</td><td>{r.n24}</td><td>{r.k === 'send' ? <span className="muted">hidden</span> : money(r.usd)}</td></tr>)}</tbody></table>
            <p className="muted ad-note">Private sends move value inside the vault, so their amounts never appear onchain.</p>
          </section>
        </div>

        <div className="ad-grid three">
          <section className="card"><h2>Vault holdings</h2>
            <table className="ad-t"><thead><tr><th>Token</th><th>Amount</th><th>Value</th><th>Share</th></tr></thead>
              <tbody>{data.holdings.map(h => <tr key={h.symbol}><td>{h.symbol}</td><td>{fmt(h.amount, h.symbol === 'USDG' ? 2 : 4)}</td><td>{money(h.usd)}</td><td>{s.tvl ? fmt((h.usd / s.tvl) * 100, 1) + '%' : '–'}</td></tr>)}</tbody></table>
          </section>
          <section className="card"><h2>Test pools</h2>
            <table className="ad-t"><thead><tr><th>Pool</th><th>Price</th><th>Stock</th><th>USDG</th></tr></thead>
              <tbody>{data.pools.map(p => <tr key={p.symbol} className={p.usdg < 1000 ? 'low' : ''}><td>{p.symbol}</td><td>{money(p.price)}</td><td>{fmt(p.stock, 2)}</td><td>{money(p.usdg)}</td></tr>)}</tbody></table>
          </section>
          <section className="card"><h2>Baskets</h2>
            <div className="ad-mini"><div><b>{data.baskets.created}</b><span>created</span></div><div><b>{data.baskets.bought}</b><span>bought</span></div></div>
            <table className="ad-t"><thead><tr><th>Most bought</th><th>Buyers</th></tr></thead>
              <tbody>{data.baskets.top.length ? data.baskets.top.map(b => <tr key={b.id}><td>{b.name || `#${b.id}`}</td><td>{b.buyers}</td></tr>) : <tr><td colSpan={2} className="muted">No baskets yet</td></tr>}</tbody></table>
          </section>
        </div>

        <section className="card"><h2>Recent activity</h2>
          <table className="ad-t feed"><thead><tr><th>When</th><th>Action</th><th>Public detail</th><th>Value</th><th /></tr></thead>
            <tbody>{data.acts.slice(0, 30).map(a => <tr key={a.hash}>
              <td className="muted">{ago(a.time)}</td>
              <td><i className="dot" style={{ background: KIND[a.kind].color }} />{KIND[a.kind].label}</td>
              <td>{a.kind === 'shield' ? `${fmt(a.amount, 2)} ${a.symbol} in from ${short(a.who!)}` : a.kind === 'unshield' ? `${fmt(a.amount, 2)} ${a.symbol} out to ${short(a.who!)}` : a.kind === 'send' ? <span className="muted">Nothing public</span> : `${fmt(a.amount, 2)} ${a.symbol} → ${a.out}${a.basket !== undefined ? ` (basket #${a.basket})` : ''}`}</td>
              <td>{a.kind === 'send' ? '–' : money(a.usd)}</td>
              <td><a className="ad-x" href={`${CFG.explorer}/tx/${a.hash}`} target="_blank" rel="noopener noreferrer">View ↗</a></td>
            </tr>)}</tbody></table>
        </section>
      </>}
    </div>
  )
}
