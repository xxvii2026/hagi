// Hagi relayer. Receives a finished proof, checks it would succeed, then submits it and pays the gas,
// so the user's own wallet never appears on a private transaction.
// It cannot change a transaction: the proof binds the recipient, amounts and swap terms.
import { createPublicClient, createWalletClient, encodeFunctionData, formatEther, http, parseAbi, parseEther, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// Two networks share this relayer. `?net=main` is the mainnet beta, with its own vault and its own key.
const NETS = {
  test: { vault: (process.env.VAULT_ADDRESS || '0x0C3C8c6929851818d6a15A4c57D68F9342B81798') as Hex, rpc: process.env.RPC_URL || 'https://rpc.testnet.chain.robinhood.com', chainId: Number(process.env.CHAIN_ID || 46630), key: () => process.env.RELAYER_PRIVATE_KEY, keyName: 'RELAYER_PRIVATE_KEY' },
  main: { vault: (process.env.MAINNET_VAULT_ADDRESS || '0x4450EFCd81DC7d3DfE54f27b351E1FF498437787') as Hex, rpc: process.env.MAINNET_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com', chainId: 4663, key: () => process.env.MAINNET_RELAYER_PRIVATE_KEY, keyName: 'MAINNET_RELAYER_PRIVATE_KEY' },
}

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

// ---------- mainnet: network fee and gas top-up ----------
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' as Hex
const WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as Hex
const QUOTER = '0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7' as Hex
const ROUTER = '0xCaf681a66D020601342297493863E78C959E5cb2' as Hex
const uni = parseAbi([
  'struct QuoteParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }',
  'function quoteExactInputSingle(QuoteParams params) returns (uint256 amountOut, uint160, uint32, uint256)',
  'struct SwapParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }',
  'function exactInputSingle(SwapParams params) payable returns (uint256)',
  'function unwrapWETH9(uint256 amountMinimum, address recipient) payable',
  'function multicall(bytes[] data) payable returns (bytes[])',
  'function adapter() view returns (address)',
  'function feeOf(address) view returns (uint24)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address, address) view returns (uint256)',
  'function approve(address, uint256) returns (bool)',
])
const quoteOne = async (pub: any, tokenIn: Hex, tokenOut: Hex, fee: number, amountIn: bigint): Promise<bigint> =>
  (await pub.simulateContract({ address: QUOTER, abi: uni, functionName: 'quoteExactInputSingle', args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }] })).result[0]

// Gas a private transaction uses, measured on a copy of mainnet, with headroom.
const GAS_BASE = 2_000_000n, GAS_PER_LEG = 1_000_000n
const FLOOR_USDG = 20_000n // 2 cents
const feeCache = new Map<string, { at: number; fee: bigint }>()

/** What a private transaction owes this relayer for gas, in `token`. Priced through Uniswap. */
async function feeFor(pub: any, vault: Hex, token: Hex, legs: number): Promise<bigint> {
  const key = token.toLowerCase() + ':' + legs, hit = feeCache.get(key)
  if (hit && Date.now() - hit.at < 20_000) return hit.fee
  const wei = ((GAS_BASE + GAS_PER_LEG * BigInt(Math.min(8, Math.max(0, legs)))) * (await pub.getGasPrice()) * 125n) / 100n
  let usdg = await quoteOne(pub, WETH, USDG, 100, wei)
  if (usdg < FLOOR_USDG) usdg = FLOOR_USDG
  let fee = usdg
  if (token.toLowerCase() !== USDG.toLowerCase()) {
    const adapter = await pub.readContract({ address: vault, abi: uni, functionName: 'adapter' })
    const tier = await pub.readContract({ address: adapter, abi: uni, functionName: 'feeOf', args: [token] })
    if (!tier) throw new Error('No market for that token')
    fee = await quoteOne(pub, USDG, token, tier, usdg)
  }
  feeCache.set(key, { at: Date.now(), fee })
  return fee
}

/** When the relayer's gas runs low, it sells the USDG it has collected in fees for ETH. */
async function topUp(pub: any, wallet: any, me: Hex) {
  const min = parseEther(process.env.MAINNET_MIN_ETH || '0.0015')
  if ((await pub.getBalance({ address: me })) >= min) return
  const have = await pub.readContract({ address: USDG, abi: uni, functionName: 'balanceOf', args: [me] })
  if (have < 1_000_000n) return // under $1 is not worth a swap
  if ((await pub.readContract({ address: USDG, abi: uni, functionName: 'allowance', args: [me, ROUTER] })) < have)
    await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: USDG, abi: uni, functionName: 'approve', args: [ROUTER, 2n ** 255n] }) })
  const minOut = ((await quoteOne(pub, USDG, WETH, 100, have)) * 98n) / 100n
  const swap = encodeFunctionData({ abi: uni, functionName: 'exactInputSingle', args: [{ tokenIn: USDG, tokenOut: WETH, fee: 100, recipient: '0x0000000000000000000000000000000000000002', amountIn: have, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }] })
  const unwrap = encodeFunctionData({ abi: uni, functionName: 'unwrapWETH9', args: [minOut, me] })
  await wallet.writeContract({ address: ROUTER, abi: uni, functionName: 'multicall', args: [[swap, unwrap]] })
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

  const net = NETS[String(req.query?.net ?? new URL(req.url || '/', 'http://x').searchParams.get('net')) === 'main' ? 'main' : 'test']
  const VAULT = net.vault, RPC = net.rpc, CHAIN_ID = net.chainId
  if (!VAULT) return reply(503, { error: 'The mainnet vault is not deployed yet' })
  const isMain = net === NETS.main
  const chain = { id: CHAIN_ID, name: 'hagi', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
  const pub = createPublicClient({ chain, transport: http(RPC) })
  const key = net.key()
  let account
  try { if (key) account = privateKeyToAccount(('0x' + key.trim().replace(/^["']|["']$/g, '').replace(/^0x/, '')) as Hex) } catch { /* reported below */ }

  // Opening this address in a browser shows whether the relayer is set up. It never reveals the key.
  const q = req.query ?? Object.fromEntries(new URL(req.url || '/', 'http://x').searchParams)
  if (req.method === 'GET' && isMain && q.fee) {
    if (!account) return reply(503, { error: net.keyName + ' is not set for this deployment' })
    try { return reply(200, { fee: String(await feeFor(pub, VAULT, String(q.fee) as Hex, Number(q.legs) || 0)), relayer: account.address }) }
    catch (e: any) { return reply(502, { error: e?.shortMessage || 'Could not price the network fee' }) }
  }
  if (req.method === 'GET') {
    let balance: string | null = null, reachable = true
    try { if (account) balance = formatEther(await pub.getBalance({ address: account.address })) } catch { reachable = false }
    return reply(200, { relayer: account?.address ?? null, keyPresent: !!key, keyValid: !!account, chainReachable: reachable, balanceEth: balance, chainId: CHAIN_ID, vault: VAULT })
  }
  if (req.method !== 'POST') return reply(405, { error: 'POST only' })
  if (!key) return reply(503, { error: net.keyName + ' is not set for this deployment' })
  if (!account) return reply(503, { error: net.keyName + ' is not a valid private key' })

  let args
  try { args = parse(await readBody(req)) } catch { return reply(400, { error: 'Malformed request' }) }

  const wallet = createWalletClient({ chain, transport: http(RPC), account })

  // Mainnet: the transaction has to pay this relayer back for the gas. A little slack covers price moves
  // between the quote and now.
  if (isMain) {
    const ext = args[1]
    if (ext.relayer.toLowerCase() !== account.address.toLowerCase()) return reply(400, { error: 'This transaction pays a different relayer' })
    if (BigInt(ext.token) === 0n) return reply(400, { error: 'This transaction does not pay the network fee' })
    let need: bigint
    try { need = await feeFor(pub, VAULT, ext.token, ext.legs.length) } catch { return reply(502, { error: 'Could not price the network fee' }) }
    if (ext.fee * 100n < need * 70n) return reply(400, { error: 'The network fee is too low. Refresh and try again.' })
  }

  // Never spend gas on a transaction that would fail.
  let request
  try {
    ;({ request } = await pub.simulateContract({ address: VAULT, abi, functionName: 'transact', args, account }))
  } catch (e: any) {
    const name = e?.cause?.data?.errorName || e?.cause?.reason
    // A named revert is the vault refusing the transaction. Anything else is the relayer failing to reach the chain.
    if (name) return reply(400, { error: String(name) })
    return reply(502, { error: e?.shortMessage || 'The relayer could not reach the chain' })
  }
  try {
    const hash = await wallet.writeContract(request)
    if (isMain) await topUp(pub, wallet, account.address).catch(() => { /* a failed top-up never fails the user's transaction */ })
    return reply(200, { hash })
  } catch (e: any) {
    return reply(502, { error: e?.shortMessage || e?.message || 'The relayer could not send the transaction' })
  }
}
