// Hagi relayer. Receives a finished proof, checks it would succeed, then submits it and pays the gas,
// so the user's own wallet never appears on a private transaction.
// It cannot change a transaction: the proof binds the recipient, amounts and swap terms.
import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const VAULT = (process.env.VAULT_ADDRESS || '0x0C3C8c6929851818d6a15A4c57D68F9342B81798') as Hex
const RPC = process.env.RPC_URL || 'https://rpc.testnet.chain.robinhood.com'
const CHAIN_ID = Number(process.env.CHAIN_ID || 46630)

const abi = parseAbi([
  'struct Proof { uint256[2] a; uint256[2][2] b; uint256[2] c; uint256 root; uint256[2] nullifiers; uint256[2] commitments; }',
  'struct SwapLeg { address tokenOut; uint256 amountIn; uint256 minOut; uint256 partialCommitment; bytes encryptedNote; }',
  'struct ExtData { address recipient; address token; uint256 amount; address relayer; uint256 fee; bytes encryptedOutput1; bytes encryptedOutput2; SwapLeg[] legs; uint256 basketId; }',
  'function transact(Proof p, ExtData ext)',
  'error TokenNotAllowed(address token)', 'error BadAmount()', 'error BadFieldElement()', 'error UnknownRoot()', 'error NullifierSpent(uint256 nullifier)',
  'error InvalidProof()', 'error BadExtData()', 'error SwapOutputTooLow(uint256 got, uint256 minOut)', 'error BasketMismatch()',
])

const big = (v: unknown) => BigInt(v as string)
const pair = (v: unknown) => { const a = v as string[]; if (!Array.isArray(a) || a.length !== 2) throw new Error('bad pair'); return [big(a[0]), big(a[1])] as const }

function parse(body: any) {
  const p = body.proof, e = body.ext
  if (!p || !e || !Array.isArray(e.legs) || e.legs.length > 8) throw new Error('bad request')
  const proof = { a: pair(p.a), b: [pair(p.b[0]), pair(p.b[1])] as const, c: pair(p.c), root: big(p.root), nullifiers: pair(p.nullifiers), commitments: pair(p.commitments) }
  const ext = {
    recipient: e.recipient as Hex, token: e.token as Hex, amount: big(e.amount), relayer: e.relayer as Hex, fee: big(e.fee),
    encryptedOutput1: e.encryptedOutput1 as Hex, encryptedOutput2: e.encryptedOutput2 as Hex,
    legs: e.legs.map((l: any) => ({ tokenOut: l.tokenOut as Hex, amountIn: big(l.amountIn), minOut: big(l.minOut), partialCommitment: big(l.partialCommitment), encryptedNote: l.encryptedNote as Hex })),
    basketId: big(e.basketId),
  }
  return [proof, ext] as const
}

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
  if (!key) return reply(503, { error: 'The relayer has no key configured' })

  let args
  try { args = parse(await readBody(req)) } catch { return reply(400, { error: 'Malformed request' }) }

  const chain = { id: CHAIN_ID, name: 'hagi', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
  const account = privateKeyToAccount(('0x' + key.trim().replace(/^0x/, '')) as Hex)
  const pub = createPublicClient({ chain, transport: http(RPC) })
  const wallet = createWalletClient({ chain, transport: http(RPC), account })

  // Never spend gas on a transaction that would fail.
  let request
  try {
    ;({ request } = await pub.simulateContract({ address: VAULT, abi, functionName: 'transact', args, account }))
  } catch (e: any) {
    const name = e?.cause?.data?.errorName || e?.cause?.reason || e?.shortMessage || 'The vault rejected this transaction'
    return reply(400, { error: String(name) })
  }
  try {
    const hash = await wallet.writeContract(request)
    return reply(200, { hash })
  } catch (e: any) {
    return reply(502, { error: e?.shortMessage || 'The relayer could not send the transaction' })
  }
}
