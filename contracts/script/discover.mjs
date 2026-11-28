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
const pub = createPublicClient({ transport: http(RPC, { batch: { batchSize: 40, wait: 30 }, retryCount: 4, retryDelay: 800 }) })
const read = (address, functionName, args = []) => pub.readContract({ address, abi, functionName, args }).catch(() => null)

const walk = (o, out = []) => { if (Array.isArray(o)) o.forEach(x => walk(x, out)); else if (o && typeof o === 'object') { if (o.tokenSymbol && o.deployments) out.push(o); else Object.values(o).forEach(x => walk(x, out)) } return out }
const assets = walk(await (await fetch('https://api.robinhood.com/rhj/assets')).json())
const list = assets.map(a => ({ symbol: a.tokenSymbol, name: a.tokenName, status: a.status, address: a.deployments.find(d => String(d.chainId) === '4663')?.contractAddress })).filter(a => a.address)
console.log(`assets in Robinhood's list: ${assets.length}, on chain 4663: ${list.length}, active: ${list.filter(a => a.status === 'ASSET_STATUS_ACTIVE').length}`)

const out = [], thin = [], none = []
for (let i = 0; i < list.length; i += 25) {
  await Promise.all(list.slice(i, i + 25).map(async a => {
    if (a.status !== 'ASSET_STATUS_ACTIVE') return
    const [sym, dec, ...pools] = await Promise.all([read(a.address, 'symbol'), read(a.address, 'decimals'), ...FEES.map(f => read(FACTORY, 'getPool', [a.address, USDG, f]))])
    let best = null
    await Promise.all(pools.map(async (p, k) => {
      if (!p || p === ZERO) return
      const [usdg, liq] = await Promise.all([read(USDG, 'balanceOf', [p]), read(p, 'liquidity')])
      if (liq && liq > 0n && usdg !== null && (!best || usdg > best.usdg)) best = { fee: FEES[k], pool: p, usdg }
    }))
    if (sym !== a.symbol || dec !== 18) { none.push(`${a.symbol}(onchain ${sym}/${dec})`); return }
    if (!best) { none.push(a.symbol); return }
    if (best.usdg < MIN_USDG) { thin.push(`${a.symbol}:$${best.usdg / 10n ** 6n}`); return }
    out.push({ symbol: a.symbol, name: a.name, address: a.address, fee: best.fee, pool: best.pool, usdg: Number(best.usdg / 10n ** 6n) })
  }))
}
out.sort((x, y) => y.usdg - x.usdg)
const mc = await pub.getCode({ address: '0xcA11bde05977b3631167028862bE2a173976CA11' }).catch(() => null)
console.log(`multicall3 at the standard address: ${mc && mc.length > 2 ? 'yes' : 'no'}`)
console.log(`usable (pool holds at least $${MIN_USDG / 10n ** 6n} USDG): ${out.length}`)
console.log(`too thin (${thin.length}): ${thin.join(' ')}`)
console.log(`no v3 USDG pool (${none.length}): ${none.join(' ')}`)
console.log('TOKENS_JSON_BEGIN')
for (let i = 0; i < out.length; i += 5) console.log(JSON.stringify(out.slice(i, i + 5)))
console.log('TOKENS_JSON_END')
