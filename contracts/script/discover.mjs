// Finds every Robinhood Stock Token that has a usable Uniswap v3 pool against USDG on mainnet.
// Read-only. Prints a JSON list the app and the deploy script are built from.
import { createPublicClient, http, parseAbi } from 'viem'

const RPC = process.env.MAINNET_RPC || 'https://rpc.mainnet.chain.robinhood.com'
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'
const FACTORY = '0x1f7d7550b1b028f7571e69a784071f0205fd2efa'
const MIN_USDG = BigInt(process.env.MIN_USDG || 5000) * 10n ** 6n
const FEES = [100, 500, 3000, 10000]
const ZERO = '0x0000000000000000000000000000000000000000'
const abi = parseAbi([
  'function getPool(address,address,uint24) view returns (address)',
  'function balanceOf(address) view returns (uint256)',
  'function liquidity() view returns (uint128)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
])
const MC = '0xcA11bde05977b3631167028862bE2a173976CA11'
const pub = createPublicClient({ transport: http(RPC, { retryCount: 6, retryDelay: 1500 }) })
// Everything goes through Multicall3 in a few big calls, so the public RPC's rate limit can't drop reads.
async function many(calls) {
  const res = []
  for (let i = 0; i < calls.length; i += 150) {
    for (let tries = 0; ; tries++) {
      try { res.push(...await pub.multicall({ contracts: calls.slice(i, i + 150).map(([address, functionName, args = []]) => ({ address, abi, functionName, args })), multicallAddress: MC, allowFailure: true })); break }
      catch (e) { if (tries > 5) throw e; await new Promise(r => setTimeout(r, 2000 * (tries + 1))) }
    }
  }
  return res.map(r => (r.status === 'success' ? r.result : null))
}

const walk = (o, out = []) => { if (Array.isArray(o)) o.forEach(x => walk(x, out)); else if (o && typeof o === 'object') { if (o.tokenSymbol && o.deployments) out.push(o); else Object.values(o).forEach(x => walk(x, out)) } return out }
const assets = walk(await (await fetch('https://api.robinhood.com/rhj/assets')).json())
const list = assets.map(a => ({ symbol: a.tokenSymbol, name: a.tokenName, status: a.status, address: a.deployments.find(d => String(d.chainId) === '4663')?.contractAddress })).filter(a => a.address && a.status === 'ASSET_STATUS_ACTIVE')
console.log(`assets in Robinhood's list: ${assets.length}, active on chain 4663: ${list.length}`)

const meta = await many(list.flatMap(a => [[a.address, 'symbol'], [a.address, 'decimals']]))
const poolsOf = await many(list.flatMap(a => FEES.map(f => [FACTORY, 'getPool', [a.address, USDG, f]])))
const found = []
list.forEach((a, i) => FEES.forEach((f, k) => { const p = poolsOf[i * 4 + k]; if (p && p !== ZERO) found.push({ i, fee: f, pool: p }) }))
const stats = await many(found.flatMap(x => [[USDG, 'balanceOf', [x.pool]], [x.pool, 'liquidity']]))
found.forEach((x, j) => { x.usdg = stats[j * 2]; x.liq = stats[j * 2 + 1] })
console.log(`failed reads: meta ${meta.filter(x => x === null).length}, pool lookups ${poolsOf.filter(x => x === null).length}, pool stats ${stats.filter(x => x === null).length}`)

const out = [], thin = [], none = [], odd = []
list.forEach((a, i) => {
  if (meta[i * 2] !== a.symbol || meta[i * 2 + 1] !== 18) { odd.push(`${a.symbol}(onchain ${meta[i * 2]}/${meta[i * 2 + 1]})`); return }
  const best = found.filter(x => x.i === i && x.liq > 0n && x.usdg !== null).sort((x, y) => (y.usdg > x.usdg ? 1 : -1))[0]
  if (!best) { none.push(a.symbol); return }
  if (best.usdg < MIN_USDG) { thin.push(`${a.symbol}:$${best.usdg / 10n ** 6n}`); return }
  out.push({ symbol: a.symbol, name: a.name, address: a.address, fee: best.fee, pool: best.pool, usdg: Number(best.usdg / 10n ** 6n) })
})
out.sort((x, y) => y.usdg - x.usdg)
console.log(`symbol or decimals mismatch (${odd.length}): ${odd.join(' ')}`)
console.log(`usable (pool holds at least $${MIN_USDG / 10n ** 6n} USDG): ${out.length}`)
console.log(`too thin (${thin.length}): ${thin.join(' ')}`)
console.log(`no v3 USDG pool (${none.length}): ${none.join(' ')}`)
console.log('TOKENS_JSON_BEGIN')
for (let i = 0; i < out.length; i += 5) console.log(JSON.stringify(out.slice(i, i + 5)))
console.log('TOKENS_JSON_END')
