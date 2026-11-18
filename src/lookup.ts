import { createPublicClient, erc20Abi, getAddress, http, isAddress, parseAbiItem, type Hex } from 'viem'
import { CFG, chain } from './chain'
import { TOKENS, fromUnits, short, tokenByAddress } from './data'

/** What anyone can read about a wallet from the chain's public data. Used by the landing page's wallet check. */
const client = createPublicClient({ chain, transport: http(CFG.rpc, { batch: { wait: 16 } }) })
const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
const ZERO = '0x0000000000000000000000000000000000000000'

export type Seen = {
  address: Hex
  eth: number
  holdings: { symbol: string; amount: number }[]
  activity: { symbol: string; amount: number; incoming: boolean; label: string; time: number | null }[]
  transfers: number
  partial: boolean // true when the activity history could not be read
}

export const validAddress = (a: string) => isAddress(a.trim(), { strict: false })

/** Names the other side of a transfer in plain words, so the list reads like a statement. */
function describe(other: string, incoming: boolean) {
  const o = other.toLowerCase()
  if (o === CFG.contracts.vault.toLowerCase()) return incoming ? 'Unshielded from Hagi' : 'Shielded into Hagi'
  if (o === CFG.contracts.swap.toLowerCase()) return incoming ? 'From the test pools' : 'To the test pools'
  if (o === ZERO) return incoming ? 'Claimed from the faucet' : 'Burned'
  return (incoming ? 'Received from ' : 'Sent to ') + short(getAddress(other))
}

export async function lookup(input: string): Promise<Seen> {
  const address = getAddress(input.trim())
  const [eth, ...bals] = await Promise.all([
    client.getBalance({ address }),
    ...TOKENS.map(t => client.readContract({ address: t.address, abi: erc20Abi, functionName: 'balanceOf', args: [address] })),
  ])
  const holdings = TOKENS.map((t, i) => ({ symbol: t.symbol, amount: fromUnits(bals[i] as bigint, t.decimals) })).filter(h => h.amount > 0)

  let activity: Seen['activity'] = []
  let transfers = 0
  let partial = false
  try {
    const latest = await client.getBlockNumber()
    // The public RPC answers at most 10 million blocks per query.
    const fromBlock = latest > 9_500_000n ? latest - 9_500_000n : 0n
    // The RPC only allows a wide block range when each filter field holds a single value, so ask one token
    // and one direction at a time. That is twelve small queries, sent together in one batch.
    const per = await Promise.all(TOKENS.flatMap(t => [
      client.getLogs({ address: t.address, event: TRANSFER, args: { from: address }, fromBlock, toBlock: latest }),
      client.getLogs({ address: t.address, event: TRANSFER, args: { to: address }, fromBlock, toBlock: latest }),
    ]))
    const out = per.flat(), inn: typeof out = []
    const seen = new Set<string>()
    const logs = [...out, ...inn].filter(l => { const k = l.transactionHash + ':' + l.logIndex; if (seen.has(k)) return false; seen.add(k); return true })
      .sort((a, b) => (a.blockNumber === b.blockNumber ? (b.logIndex ?? 0) - (a.logIndex ?? 0) : Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n))))
    transfers = logs.length
    const recent = logs.slice(0, 6)
    const blocks = [...new Set(recent.map(l => l.blockNumber as bigint))]
    const times = new Map<bigint, number>()
    await Promise.all(blocks.map(async n => { try { times.set(n, Number((await client.getBlock({ blockNumber: n })).timestamp) * 1000) } catch { /* time is optional */ } }))
    activity = recent.map(l => {
      const t = tokenByAddress(l.address)!
      const incoming = (l.args.to ?? '').toLowerCase() === address.toLowerCase()
      return { symbol: t.symbol, amount: fromUnits(l.args.value ?? 0n, t.decimals), incoming, label: describe((incoming ? l.args.from : l.args.to) ?? ZERO, incoming), time: times.get(l.blockNumber as bigint) ?? null }
    })
  } catch (e) {
    console.warn('Could not read the wallet history', e)
    partial = true
  }
  return { address, eth: fromUnits(eth as bigint, 18), holdings, activity, transfers, partial }
}
