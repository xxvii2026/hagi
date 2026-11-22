// Hagi gas drip (testnet only). Sends a tiny amount of testnet ETH to a wallet that has none,
// so new users can claim test USDG without visiting a separate faucet first.
// It only tops up wallets that are nearly empty, and only by enough for a handful of transactions.
import { createPublicClient, createWalletClient, http, isAddress, parseEther, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const RPC = process.env.RPC_URL || 'https://rpc.testnet.chain.robinhood.com'
const CHAIN_ID = Number(process.env.CHAIN_ID || 46630)
// Enough for a claim, an approval and a shield at today's gas price, with room to spare.
const FLOOR = parseEther('0.00005')
// The drip never takes the relayer below this, so private transactions keep working.
const RESERVE = parseEther('0.002')

async function readBody(req: any) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

export default async function handler(req: any, res: any) {
  const reply = (status: number, data: unknown) => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('access-control-allow-headers', 'content-type')
    res.setHeader('access-control-allow-methods', 'POST, OPTIONS')
    res.end(JSON.stringify(data))
  }
  if (req.method === 'OPTIONS') return reply(204, {})
  if (req.method !== 'POST') return reply(405, { error: 'POST only' })

  const key = process.env.RELAYER_PRIVATE_KEY
  if (!key) return reply(503, { error: 'Gas drip is not set up' })
  let to: Hex
  try { to = (await readBody(req)).address } catch { return reply(400, { error: 'bad request' }) }
  if (!to || !isAddress(to)) return reply(400, { error: 'Send a wallet address' })

  const chain = { id: CHAIN_ID, name: 'hagi', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
  const account = privateKeyToAccount(('0x' + key.trim().replace(/^["']|["']$/g, '').replace(/^0x/, '')) as Hex)
  const pub = createPublicClient({ chain, transport: http(RPC) })
  try {
    const [has, mine, price] = await Promise.all([pub.getBalance({ address: to }), pub.getBalance({ address: account.address }), pub.getGasPrice()])
    const DRIP = price * 2_000_000n > FLOOR ? price * 2_000_000n : FLOOR
    if (has >= DRIP / 2n) return reply(200, { ok: true, skipped: 'already has gas' })
    if (mine - DRIP < RESERVE) return reply(503, { error: 'The gas drip is empty right now. Try the Robinhood faucet instead.' })
    const hash = await createWalletClient({ chain, account, transport: http(RPC) }).sendTransaction({ to, value: DRIP })
    await pub.waitForTransactionReceipt({ hash })
    return reply(200, { ok: true, hash })
  } catch (e) {
    return reply(502, { error: (e as Error).message?.split('\n')[0] ?? 'drip failed' })
  }
}
