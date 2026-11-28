// HELL window feed. Reads $HAGI on Robinhood Chain mainnet: supply, everything burned, and the burn history.
// Burned = supply already destroyed + tokens sitting in the dead and zero addresses. Read-only, no keys.
import { createPublicClient, http, parseAbi, parseAbiItem, type Hex } from 'viem'

const TOKEN = '0x4643d8eaa4adc2ce361331b831ea6335742a29a1' as Hex
const RPC = process.env.MAINNET_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'
const DEAD = '0x000000000000000000000000000000000000dEaD' as Hex
const ZERO = '0x0000000000000000000000000000000000000000' as Hex
const START = 1_000_000_000 // $HAGI launched with 1B
const abi = parseAbi(['function totalSupply() view returns (uint256)', 'function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'])

type Burn = { tx: string; amount: number; at: string }
const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

// Burn history straight from the chain: every $HAGI transfer into the dead or zero address.
async function history(c: any, dec: number): Promise<Burn[]> {
  try {
    const logs = await c.getLogs({ address: TOKEN, event: transfer, args: { to: [DEAD, ZERO] }, fromBlock: 0n, toBlock: 'latest' })
    const last = logs.slice(-50)
    const out = await Promise.all(last.map(async (l: any) => {
      let at = ''
      try { const blk = await c.getBlock({ blockNumber: l.blockNumber }); at = new Date(Number(blk.timestamp) * 1000).toISOString() } catch { /* date is optional */ }
      return { tx: l.transactionHash as string, amount: Number((l.args.value as bigint) / 10n ** BigInt(Math.max(0, dec - 6))) / 10 ** Math.min(6, dec), at }
    }))
    return out.filter(b => b.amount > 0).reverse()
  } catch { return [] /* history is optional, the totals still load */ }
}

export default async function handler(_req: any, res: any) {
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 's-maxage=20, stale-while-revalidate=60')
  try {
    const c = createPublicClient({ transport: http(RPC) })
    const [supply, dead, zero, dec] = await Promise.all([
      c.readContract({ address: TOKEN, abi, functionName: 'totalSupply' }),
      c.readContract({ address: TOKEN, abi, functionName: 'balanceOf', args: [DEAD] }),
      c.readContract({ address: TOKEN, abi, functionName: 'balanceOf', args: [ZERO] }),
      c.readContract({ address: TOKEN, abi, functionName: 'decimals' }),
    ])
    const n = (v: bigint) => Number(v / 10n ** BigInt(Math.max(0, dec - 6))) / 10 ** Math.min(6, dec)
    const destroyed = Math.max(0, START - n(supply))
    const burned = destroyed + n(dead) + n(zero)
    res.end(JSON.stringify({ start: START, supply: n(supply), burned, circulating: START - burned, burns: await history(c, dec), at: Date.now() }))
  } catch (e: any) {
    res.statusCode = 502
    res.end(JSON.stringify({ error: 'Could not reach Robinhood Chain' }))
  }
}
