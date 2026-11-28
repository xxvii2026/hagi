// HELL window feed. Reads $HAGI on Robinhood Chain mainnet: supply, everything burned, and the burn history.
// Burned = supply already destroyed + tokens sitting in the dead and zero addresses. Read-only, no keys.
import { createPublicClient, http, parseAbi, type Hex } from 'viem'

const TOKEN = '0x4643d8eaa4adc2ce361331b831ea6335742a29a1' as Hex
const RPC = process.env.MAINNET_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'
const DEAD = '0x000000000000000000000000000000000000dEaD' as Hex
const ZERO = '0x0000000000000000000000000000000000000000' as Hex
const START = 1_000_000_000 // $HAGI launched with 1B
const abi = parseAbi(['function totalSupply() view returns (uint256)', 'function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'])

export default async function handler(_req: any, res: any) {
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 's-maxage=4, stale-while-revalidate=8')
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
    res.end(JSON.stringify({ start: START, supply: n(supply), burned, circulating: START - burned, burns: [], at: Date.now() }))
  } catch (e: any) {
    res.statusCode = 502
    res.end(JSON.stringify({ error: 'Could not reach Robinhood Chain' }))
  }
}
