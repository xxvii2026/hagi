// Hagi Ghost Address claims. The app asks for a deposit sitting at a Ghost Address to be claimed, and the
// relayer sends the claim and pays the gas, so the person never needs a wallet or ETH to bring funds in.
// It cannot redirect anything: a claim can only ever shield into the note fixed by the Ghost Address itself.
import { createPublicClient, createWalletClient, http, isAddress, parseAbi, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const GHOST = (process.env.GHOST_ADDRESS || '0x722445E4a5582FF615aE7f72fc928f62C87d75EF') as Hex | undefined
const RPC = process.env.RPC_URL || 'https://rpc.testnet.chain.robinhood.com'
const CHAIN_ID = Number(process.env.CHAIN_ID || 46630)
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n

const abi = parseAbi([
  'function claim(uint256 partialCommitment, address token, uint256 amount, bytes encryptedNote) returns (uint256)',
  'error BadFieldElement()', 'error BadAmount()', 'error BadTransfer()', 'error TokenNotAllowed(address token)',
])

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
  if (req.method === 'GET') return reply(200, { ghost: GHOST ?? null, ready: !!GHOST && !!process.env.RELAYER_PRIVATE_KEY })
  if (req.method !== 'POST') return reply(405, { error: 'POST only' })

  const key = process.env.RELAYER_PRIVATE_KEY
  if (!key) return reply(503, { error: 'RELAYER_PRIVATE_KEY is not set for this deployment' })
  if (!GHOST || !isAddress(GHOST)) return reply(503, { error: 'Ghost Addresses are not set up on this deployment' })

  let args: readonly [bigint, Hex, bigint, Hex]
  try {
    const b = await readBody(req)
    const partial = BigInt(b.partial), amount = BigInt(b.amount)
    if (partial <= 0n || partial >= FIELD || amount <= 0n || !isAddress(b.token) || !/^0x([0-9a-f]{2})*$/i.test(b.encryptedNote) || b.encryptedNote.length > 1000) throw new Error()
    args = [partial, b.token as Hex, amount, b.encryptedNote as Hex]
  } catch { return reply(400, { error: 'Malformed request' }) }

  const chain = { id: CHAIN_ID, name: 'hagi', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
  const pub = createPublicClient({ chain, transport: http(RPC) })
  let account
  try { account = privateKeyToAccount(('0x' + key.trim().replace(/^["']|["']$/g, '').replace(/^0x/, '')) as Hex) } catch { return reply(503, { error: 'RELAYER_PRIVATE_KEY is not a valid private key' }) }

  // Never spend gas on a claim that would fail (an empty address, a token Hagi doesn't list, a claim already made).
  let request
  try {
    ;({ request } = await pub.simulateContract({ address: GHOST, abi, functionName: 'claim', args, account }))
  } catch (e: any) {
    const name = e?.cause?.data?.errorName || e?.cause?.reason
    if (name) return reply(400, { error: String(name) })
    return reply(502, { error: e?.shortMessage || 'The relayer could not reach the chain' })
  }
  try {
    const hash = await createWalletClient({ chain, transport: http(RPC), account }).writeContract(request)
    return reply(200, { hash })
  } catch (e: any) {
    return reply(502, { error: e?.shortMessage || e?.message || 'The relayer could not send the claim' })
  }
}
