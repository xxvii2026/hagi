// Hagi names relayer. Claims name.hagi for a hagi1 address and pays the gas, so claiming is free and needs no wallet.
// The address only ever becomes public as the name's target, like a phone number. Balances stay in the vault.
import { createPublicClient, createWalletClient, http, isAddress, parseAbi, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const NAMES = (process.env.NAMES_ADDRESS || '0x3cF6213fa37D19c1Db4492B942A8B53Fc8F3e193') as Hex
const RPC = process.env.RPC_URL || 'https://rpc.testnet.chain.robinhood.com'
const CHAIN_ID = Number(process.env.CHAIN_ID || 46630)
const abi = parseAbi([
  'function claim(string name, bytes addr)',
  'error BadName()', 'error BadAddress()', 'error Taken()', 'error Reserved()', 'error AddressHasName()',
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
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(data))
  }
  if (req.method === 'GET') return reply(200, { names: NAMES || null })
  if (req.method !== 'POST') return reply(405, { error: 'POST only' })
  const key = process.env.RELAYER_PRIVATE_KEY
  if (!key) return reply(503, { error: 'RELAYER_PRIVATE_KEY is not set for this deployment' })
  if (!NAMES || !isAddress(NAMES)) return reply(503, { error: 'Hagi names are not set up on this deployment' })

  let name: string, addr: Hex
  try {
    const b = await readBody(req)
    name = String(b.name ?? '').trim().toLowerCase().replace(/\.hagi$/, '')
    const m = /^hagi1([0-9a-f]{128})$/.exec(String(b.address ?? '').trim().toLowerCase())
    if (!/^[a-z0-9-]{4,20}$/.test(name) || !m) throw new Error()
    addr = ('0x' + m[1]) as Hex
  } catch { return reply(400, { error: 'Malformed request' }) }

  const chain = { id: CHAIN_ID, name: 'hagi', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
  const pub = createPublicClient({ chain, transport: http(RPC) })
  let account
  try { account = privateKeyToAccount(('0x' + key.trim().replace(/^["']|["']$/g, '').replace(/^0x/, '')) as Hex) } catch { return reply(503, { error: 'RELAYER_PRIVATE_KEY is not a valid private key' }) }

  // Never spend gas on a claim that would fail (taken, reserved, or this address already has a name).
  let request
  try {
    ;({ request } = await pub.simulateContract({ address: NAMES, abi, functionName: 'claim', args: [name, addr], account }))
  } catch (e: any) {
    const err = e?.cause?.data?.errorName || e?.cause?.reason
    if (err) return reply(400, { error: String(err) })
    return reply(502, { error: e?.shortMessage || 'The relayer could not reach the chain' })
  }
  try {
    const hash = await createWalletClient({ chain, transport: http(RPC), account }).writeContract(request as any)
    return reply(200, { hash })
  } catch (e: any) {
    return reply(502, { error: e?.shortMessage || e?.message || 'The relayer could not send the claim' })
  }
}
