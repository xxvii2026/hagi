// Talks to the chain: balances, pools, baskets, vault notes, and every action the app can take.
import { concat, createPublicClient, createWalletClient, custom, getAddress, http, keccak256, maxUint256, parseAbiItem, toHex, type Hex } from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import { erc20Abi, registryAbi, swapAbi, vaultAbi } from './abi'
import { CFG, chain } from './chain'
import { STOCKS, TOKENS, fromUnits, token, tokenByAddress, type Basket } from './data'
import { SIGN_MESSAGE, MerkleTree, commitment, decryptNote, deriveKeys, encryptNote, nullifier, parseAddress, partialCommitment, randomField, toAddress, type Keys, type Note } from './zk/core'
import type { TxRequest } from './zk/prove'

export type Step = (label: string) => void
type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (event: string, fn: () => void) => void }

const provider = (): Eth | undefined => (window as unknown as { ethereum?: Eth }).ethereum
export const hasWallet = () => !!provider()
// Reads are grouped into one request where possible, to stay well inside the public endpoint's limits.
// The public RPC rate-limits, and answers an oversized batch with a 429 that browsers then block
// (its error replies carry a broken CORS header). Keep batches small and retry briefly.
const pub = createPublicClient({ chain, transport: http(CFG.rpc, { batch: { wait: 20, batchSize: 20 }, retryCount: 3, retryDelay: 500 }) })
// A passkey account has no browser wallet: it signs with a key derived from the passkey, and sends through the RPC.
let local: PrivateKeyAccount | null = null
const wal = () => local ? createWalletClient({ chain, account: local, transport: http(CFG.rpc) }) : createWalletClient({ chain, transport: custom(provider()!) })
const acct = () => local ?? account!
export const isPasskey = () => !!local
const V = { address: CFG.contracts.vault, abi: vaultAbi } as const
const ART = { wasm: `${import.meta.env.BASE_URL}zk/transaction.wasm`, zkey: `${import.meta.env.BASE_URL}zk/transaction.zkey` }
const NEW_COMMITMENT = parseAbiItem('event NewCommitment(uint256 indexed commitment, uint256 index, address token, uint256 amount, bytes encryptedNote)')

// ---------- session ----------

let account: Hex | null = null
let keys: Keys | null = null
let notes: Note[] = []
let tree = new MerkleTree()
// Private notes this device has already accounted for, so a new one can be reported as money received.
let known: Set<string> | null = null
let received: { symbol: string; amount: number }[] = []
const knownSlot = () => 'hagi-known-' + keys!.publicKey.toString(16).slice(0, 24)
const saveKnown = () => { try { if (known) localStorage.setItem(knownSlot(), JSON.stringify([...known])) } catch { /* optional */ } }
// A spent receipt stays spent, so each one is only asked about until the first time it comes back spent.
let spentSeen = new Set<string>()
const spentSlot = () => 'hagi-spent-' + CFG.contracts.vault.toLowerCase().slice(2, 10) + '-' + keys!.publicKey.toString(16).slice(0, 24)
const saveSpent = () => { try { localStorage.setItem(spentSlot(), JSON.stringify([...spentSeen])) } catch { /* optional */ } }
/** Hands over, once, the notes that arrived since the last call. */
export const takeReceived = () => { const r = received; received = []; return r }
const reserves: Record<string, [bigint, bigint]> = {}

export const session = { get account() { return account }, get address() { return keys ? toAddress(keys) : null } }

/** Makes sure the wallet is on Robinhood Chain Testnet before it is asked to send anything. */
async function ensureChain() {
  if (local) return
  const w = wal()
  if ((await w.getChainId()) === chain.id) return
  try { await w.switchChain({ id: chain.id }) } catch { await w.addChain({ chain }); await w.switchChain({ id: chain.id }) }
}

export async function connect(): Promise<Hex> {
  const [a] = await wal().requestAddresses()
  await ensureChain()
  account = a
  return a
}

const sigSlot = () => 'hagi-sig-' + account!.toLowerCase()
function adopt(sig: Hex) {
  keys = deriveKeys(sig)
  try { const raw = localStorage.getItem(knownSlot()); known = raw ? new Set(JSON.parse(raw)) : null } catch { known = null }
  try { const raw = localStorage.getItem(spentSlot()); spentSeen = new Set(raw ? JSON.parse(raw) : []) } catch { spentSeen = new Set() }
  return toAddress(keys)
}

const PK_SLOT = 'hagi-passkey'
/** For a passkey account: true if this passkey secret is the one the account was opened with. */
export const matchesPasskey = (secret: Hex) => !!local && privateKeyToAccount(keccak256(concat([secret, toHex('hagi.wallet')]))).address === local.address
/** Signs in with a passkey secret: the vault keys and a built-in wallet address both come from it. */
export function passkeyIn(secret: Hex): { wallet: Hex; address: string } {
  local = privateKeyToAccount(keccak256(concat([secret, toHex('hagi.wallet')])))
  account = local.address
  try { sessionStorage.setItem(PK_SLOT, secret) } catch { /* storage unavailable */ }
  return { wallet: account, address: adopt(secret) }
}

/** After a reload, picks the wallet back up without a prompt if it is still connected to this site. */
export async function resume(): Promise<{ wallet: Hex; address: string | null } | null> {
  // A passkey session lasts as long as the tab, like a wallet signature.
  try { const pk = sessionStorage.getItem(PK_SLOT) as Hex | null; if (pk) return passkeyIn(pk) } catch { /* storage unavailable */ }
  const p = provider()
  if (!p) return null
  try {
    const accounts = (await p.request({ method: 'eth_accounts' })) as string[]
    if (!accounts?.length) return null
    account = getAddress(accounts[0])
    const sig = sessionStorage.getItem(sigSlot()) as Hex | null
    return { wallet: account, address: sig ? adopt(sig) : null }
  } catch { return null }
}

/** Reload when the user switches account in their wallet, so one account's notes never show under another. */
export function watchWallet() {
  provider()?.on?.('accountsChanged', () => { if (!local) location.reload() })
}

/** Derives the vault keys from one signature. The signature is kept for this tab only. */
export async function unlock(): Promise<string> {
  if (!account) throw new Error('Connect a wallet first')
  let sig = sessionStorage.getItem(sigSlot()) as Hex | null
  if (!sig) {
    sig = await wal().signMessage({ account, message: SIGN_MESSAGE })
    try { sessionStorage.setItem(sigSlot(), sig) } catch { /* storage unavailable */ }
  }
  return adopt(sig)
}

export const hasCachedKey = () => { try { return !!account && !!sessionStorage.getItem('hagi-sig-' + account.toLowerCase()) } catch { return false } }

export function lock() {
  if (account) try { sessionStorage.removeItem('hagi-sig-' + account.toLowerCase()) } catch { /* storage unavailable */ }
  try { sessionStorage.removeItem(PK_SLOT) } catch { /* storage unavailable */ }
  local = null
  account = null; keys = null; notes = []; tree = new MerkleTree(); known = null; received = []; spentSeen = new Set()
}

// ---------- reads ----------

export async function readWallet(): Promise<{ balances: Record<string, number>; eth: number }> {
  if (!account) return { balances: {}, eth: 0 }
  const [eth, ...raw] = await Promise.all([pub.getBalance({ address: account }), ...TOKENS.map(t => pub.readContract({ address: t.address, abi: erc20Abi, functionName: 'balanceOf', args: [account!] }))])
  const balances: Record<string, number> = {}
  TOKENS.forEach((t, i) => { if (raw[i] > 0n) balances[t.symbol] = fromUnits(raw[i], t.decimals) })
  return { balances, eth: fromUnits(eth, 18) }
}

/** Reads every pool's reserves and updates each stock's price. */
export async function readPools() {
  const rs = await Promise.all(STOCKS.map(t => pub.readContract({ address: CFG.contracts.swap, abi: swapAbi, functionName: 'pools', args: [t.address] })))
  STOCKS.forEach((t, i) => {
    reserves[t.symbol] = [rs[i][0], rs[i][1]]
    t.price = rs[i][0] > 0n ? Number((rs[i][1] * 10n ** 18n) / rs[i][0]) / 1e6 : 0
  })
}

const out = (amountIn: bigint, rIn: bigint, rOut: bigint) => { const f = amountIn * 9970n; return rIn > 0n ? (f * rOut) / (rIn * 10000n + f) : 0n }
/** Estimates a swap from the last pool reserves read, using the same maths as the pools. */
export function estimate(from: string, to: string, amountIn: bigint): bigint {
  if (from === to || amountIn <= 0n) return 0n
  const sell = (s: string, x: bigint) => out(x, reserves[s]?.[0] ?? 0n, reserves[s]?.[1] ?? 0n)
  const buy = (s: string, x: bigint) => out(x, reserves[s]?.[1] ?? 0n, reserves[s]?.[0] ?? 0n)
  return from === 'USDG' ? buy(to, amountIn) : to === 'USDG' ? sell(from, amountIn) : buy(to, sell(from, amountIn))
}

export async function readBaskets(): Promise<Basket[]> {
  const raw = await pub.readContract({ address: CFG.contracts.basketRegistry, abi: registryAbi, functionName: 'getBaskets', args: [0n, 200n] })
  return raw.map((b, id) => ({
    id, name: b.name, creator: b.creator.slice(0, 6) + '…' + b.creator.slice(-4), buyers: Number(b.buyers), created: Number(b.createdAt),
    items: b.tokens.map((t, i) => ({ symbol: tokenByAddress(t)?.symbol ?? '?', weight: b.weights[i] / 100, bps: b.weights[i] })),
  }))
}

// ---------- vault notes ----------

type CachedLog = [index: number, commitment: string, token: string, amount: string, enc: Hex]
const CACHE = 'hagi-logs-' + CFG.contracts.vault.toLowerCase()
const CHUNK = 5_000_000n

// The public RPC sits behind several nodes that can be a few blocks apart. One node can report a new
// block before another has its logs, so each scan reaches back over recent blocks again. Repeated logs
// are dropped by their index, so going over the same blocks twice is harmless.
const OVERLAP = 2_000n

async function loadLogs(minBlock = 0n, fresh = false): Promise<CachedLog[]> {
  let cache: { last: number; logs: CachedLog[] } = { last: CFG.deployBlock - 1, logs: [] }
  if (!fresh) try { const raw = localStorage.getItem(CACHE); if (raw) cache = JSON.parse(raw) } catch { /* start over */ }
  // After sending a transaction, wait until the node we read from has caught up to its block.
  let latest = await pub.getBlockNumber({ cacheTime: 0 })
  for (let i = 0; latest < minBlock && i < 20; i++) { await new Promise(r => setTimeout(r, 500)); latest = await pub.getBlockNumber({ cacheTime: 0 }) }
  const floor = BigInt(CFG.deployBlock)
  const start = BigInt(cache.last + 1) - OVERLAP
  for (let from = start > floor ? start : floor; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n
    const logs = await pub.getLogs({ address: CFG.contracts.vault, event: NEW_COMMITMENT, fromBlock: from, toBlock: to })
    for (const l of logs) cache.logs.push([Number(l.args.index), l.args.commitment!.toString(), l.args.token!, l.args.amount!.toString(), l.args.encryptedNote!])
  }
  cache.last = Number(latest)
  const seen = new Map(cache.logs.map(l => [l[0], l]))
  cache.logs = [...seen.values()].sort((a, b) => a[0] - b[0])
  try { localStorage.setItem(CACHE, JSON.stringify(cache)) } catch { /* cache is optional */ }
  return cache.logs
}

/** True when the receipts run 0, 1, 2… with nothing missing. */
const complete = (logs: CachedLog[]) => logs.every((l, i) => l[0] === i)

/** Rebuilds the Merkle tree from chain events and finds this account's unspent notes. */
export async function sync(minBlock = 0n): Promise<Record<string, number>> {
  if (!keys) return {}
  let logs = await loadLogs(minBlock)
  // A hole in the saved history (left by an older version, or a node that was behind) is fixed by
  // scanning the vault again from the start, once, instead of failing on every refresh.
  if (!complete(logs)) logs = await loadLogs(minBlock, true)
  const t = new MerkleTree()
  const mine: Note[] = []
  const privateOnes = new Set<Note>()
  for (const [index, c, , amount, enc] of logs) {
    if (index !== t.size) throw new Error('The vault history has a gap. Try again in a minute.')
    t.insert(BigInt(c))
    const d = decryptNote(enc, keys)
    if (!d) continue
    const note: Note = { ...d, amount: BigInt(amount) > 0n ? BigInt(amount) : d.amount, publicKey: keys.publicKey, index }
    if (note.amount > 0n && commitment(note) === BigInt(c)) { mine.push(note); if (BigInt(amount) === 0n) privateOnes.add(note) }
  }
  const nfs = mine.map(n => nullifier(n, keys!.privateKey).toString())
  const spent = await Promise.all(mine.map((_, i) => spentSeen.has(nfs[i]) ? true
    : pub.readContract({ ...V, functionName: 'nullifierSpent', args: [BigInt(nfs[i])] })))
  spent.forEach((sp, i) => { if (sp) spentSeen.add(nfs[i]) })
  saveSpent()
  tree = t
  notes = mine.filter((_, i) => !spent[i])
  // A private note that this device did not create as change is money that arrived.
  const firstScan = known === null
  known ??= new Set()
  mine.forEach((n, i) => {
    const id = commitment(n).toString()
    if (!privateOnes.has(n) || known!.has(id)) return
    known!.add(id)
    const tk = tokenByAddress(n.token)
    if (!firstScan && !spent[i] && tk) received.push({ symbol: tk.symbol, amount: fromUnits(n.amount, tk.decimals) })
  })
  saveKnown()
  return shielded()
}

export function shielded(): Record<string, number> {
  const sums: Record<string, bigint> = {}
  for (const n of notes) { const s = tokenByAddress(n.token)?.symbol; if (s) sums[s] = (sums[s] ?? 0n) + n.amount }
  // Cash first, then stocks in listing order, so every picker defaults to USDG.
  return Object.fromEntries(TOKENS.filter(t => sums[t.symbol]).map(t => [t.symbol, fromUnits(sums[t.symbol], t.decimals)]))
}
const rawShielded = (sym: string) => notes.filter(n => n.token === BigInt(token(sym).address)).reduce((t, n) => t + n.amount, 0n)

/** Converts a typed amount to chain units. Typing the whole balance spends the exact balance, dust included. */
function amountOf(sym: string, n: number, have: bigint) {
  const t = token(sym)
  const typed = BigInt(Math.round(n * 1e6)) * 10n ** BigInt(t.decimals - 6)
  const diff = have > typed ? have - typed : typed - have
  return diff < 10n ** BigInt(Math.max(0, t.decimals - 6)) ? have : typed
}

// ---------- sending transactions ----------

// When the relayer is down the app never sends from the user's wallet by itself, because that puts
// their address on the transaction. It asks first, through whatever the interface registers here.
let confirmWalletSend: (why: string) => Promise<boolean> = async () => false
export const onRelayerDown = (ask: typeof confirmWalletSend | null) => { confirmWalletSend = ask ?? (async () => false) }

const jsonBig = (_: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)

// The last transaction this session waited for, so the activity entry can link to it.
let lastHash: Hex | null = null
export const takeHash = () => { const h = lastHash; lastHash = null; return h }

async function waitFor(hash: Hex, step: Step): Promise<bigint> {
  lastHash = hash
  step('Waiting for the network')
  const rc = await pub.waitForTransactionReceipt({ hash })
  if (rc.status !== 'success') throw new Error('The transaction failed on chain.')
  return rc.blockNumber
}

async function privately(req: Omit<TxRequest, 'keys' | 'tree'>, step: Step) {
  if (!keys || !account) throw new Error('Unlock your Hagi account first')
  step('Building your private proof')
  const { buildTransaction } = await import('./zk/prove')
  const tx = await buildTransaction({ ...req, keys, tree }, ART)
  req.outputs.forEach((o, i) => { if (o.own) known?.add(commitment(tx.outNotes[i]).toString()) })
  saveKnown()
  step('Sending through the relayer')
  let hash: Hex | undefined
  let res: Response | undefined
  try { res = await fetch(CFG.relayerUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proof: tx.proof, ext: tx.ext }, jsonBig) }) } catch { /* relayer unreachable */ }
  const body: { hash?: Hex; error?: string } = res ? await res.json().catch(() => ({})) : {}
  if (res?.ok && body.hash) hash = body.hash
  else if (res?.status === 400) throw new Error('The vault rejected this transaction: ' + (body.error ?? 'unknown reason'))
  else {
    // The relayer is down. Sending from the user's wallet still works, but it puts their address on the transaction.
    const why = !res ? 'could not be reached' : `answered ${res.status}${body.error ? ': ' + body.error : ''}`
    console.warn('Hagi relayer ' + why)
    step('The relayer ' + why)
    if (!(await confirmWalletSend(why))) throw new Error('Stopped. Nothing was sent and your funds have not moved.')
    step('Confirm in your wallet. Your address will show on this one')
    await ensureChain()
    hash = await wal().writeContract({ ...V, functionName: 'transact', args: [tx.proof, tx.ext], account: acct() })
  }
  await sync(await waitFor(hash, step))
}

/** Picks one or two notes that cover `amount`, combining smaller notes first when two are not enough. */
async function inputsFor(sym: string, amount: bigint, step: Step): Promise<Note[]> {
  const t = token(sym)
  for (;;) {
    const mine = notes.filter(n => n.token === BigInt(t.address)).sort((a, b) => (b.amount > a.amount ? 1 : -1))
    if (mine.reduce((s, n) => s + n.amount, 0n) < amount) throw new Error('Not enough shielded ' + sym)
    if (mine[0].amount >= amount) return [mine[0]]
    if (mine[0].amount + mine[1].amount >= amount) return [mine[0], mine[1]]
    step('Combining smaller notes')
    await privately({ token: t.address, inputs: [mine[0], mine[1]], outputs: [{ amount: mine[0].amount + mine[1].amount, publicKey: keys!.publicKey, encPublic: keys!.encPublic, own: true }] }, () => {})
  }
}
const change = (inputs: Note[], spent: bigint) => {
  const left = inputs.reduce((s, n) => s + n.amount, 0n) - spent
  return left > 0n ? [{ amount: left, publicKey: keys!.publicKey, encPublic: keys!.encPublic, own: true }] : []
}

// ---------- actions ----------

/** Claims test USDG. A wallet with no gas first gets a tiny top-up from Hagi's gas drip. */
export async function faucet(step: Step) {
  await ensureChain()
  const [eth, price] = account ? await Promise.all([pub.getBalance({ address: account }), pub.getGasPrice()]) : [0n, 0n]
  if (account && eth < price * 300_000n) {
    step('Getting you a little gas')
    const r = await fetch(CFG.relayerUrl.replace(/relay$/, 'drip'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: account }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error ?? 'Couldn’t get gas. Try the Robinhood faucet.')
  }
  step(local ? 'Claiming test USDG' : 'Confirm in your wallet')
  await waitFor(await wal().writeContract({ address: CFG.contracts.usdg, abi: erc20Abi, functionName: 'faucet', account: acct() }), step)
}

export async function shield(sym: string, n: number, step: Step) {
  if (!keys || !account) throw new Error('Unlock your Hagi account first')
  const t = token(sym)
  await ensureChain()
  const have = await pub.readContract({ address: t.address, abi: erc20Abi, functionName: 'balanceOf', args: [account] })
  const amount = amountOf(sym, n, have)
  if (amount <= 0n || amount > have) throw new Error('Not enough ' + sym + ' in your wallet')
  const allowance = await pub.readContract({ address: t.address, abi: erc20Abi, functionName: 'allowance', args: [account, CFG.contracts.vault] })
  if (allowance < amount) {
    step(`Approve ${sym} in your wallet`)
    await waitFor(await wal().writeContract({ address: t.address, abi: erc20Abi, functionName: 'approve', args: [CFG.contracts.vault, maxUint256], account: acct() }), () => {})
  }
  const blinding = randomField()
  step('Confirm the deposit in your wallet')
  const hash = await wal().writeContract({ ...V, functionName: 'shield', args: [t.address, amount, partialCommitment(keys.publicKey, blinding), encryptNote({ amount, token: BigInt(t.address), blinding }, keys.encPublic)], account: acct() })
  await sync(await waitFor(hash, step))
}

export async function unshield(sym: string, n: number, step: Step) {
  const amount = amountOf(sym, n, rawShielded(sym))
  const inputs = await inputsFor(sym, amount, step)
  await privately({ token: token(sym).address, inputs, outputs: change(inputs, amount), withdraw: { recipient: account!, amount } }, step)
}

export async function send(sym: string, n: number, to: string, step: Step) {
  const dest = parseAddress(to)
  if (!dest) throw new Error('That is not a Hagi address')
  const amount = amountOf(sym, n, rawShielded(sym))
  const inputs = await inputsFor(sym, amount, step)
  await privately({ token: token(sym).address, inputs, outputs: [{ amount, publicKey: dest.publicKey, encPublic: dest.encPublic }, ...change(inputs, amount)] }, step)
}

const quote = (from: Hex, to: Hex, amountIn: bigint) => pub.readContract({ address: CFG.contracts.swap, abi: swapAbi, functionName: 'quoteExactIn', args: [from, to, amountIn] })
const SLIPPAGE = 995n // accept at least 99.5% of the quoted output

export async function swap(from: string, to: string, n: number, step: Step): Promise<number> {
  const amount = amountOf(from, n, rawShielded(from))
  const inputs = await inputsFor(from, amount, step)
  const q = await quote(token(from).address, token(to).address, amount)
  const blinding = randomField()
  await privately({
    token: token(from).address, inputs, outputs: change(inputs, amount),
    swap: { legs: [{ tokenOut: token(to).address, amountIn: amount, minOut: (q * SLIPPAGE) / 1000n, partialCommitment: partialCommitment(keys!.publicKey, blinding) }], legNotes: [{ blinding }] },
  }, step)
  await readPools()
  return fromUnits(q, token(to).decimals)
}

export async function buyBasket(b: Basket, n: number, step: Step) {
  const total = amountOf('USDG', n, rawShielded('USDG'))
  const inputs = await inputsFor('USDG', total, step)
  const usdg = token('USDG').address
  let used = 0n
  const legs = [], legNotes = []
  for (let i = 0; i < b.items.length; i++) {
    const amountIn = i + 1 < b.items.length ? (total * BigInt(b.items[i].bps)) / 10_000n : total - used
    used += amountIn
    const out = token(b.items[i].symbol).address
    const blinding = randomField()
    legs.push({ tokenOut: out, amountIn, minOut: ((await quote(usdg, out, amountIn)) * SLIPPAGE) / 1000n, partialCommitment: partialCommitment(keys!.publicKey, blinding) })
    legNotes.push({ blinding })
  }
  await privately({ token: usdg, inputs, outputs: change(inputs, total), swap: { legs, legNotes, basketId: BigInt(b.id) } }, step)
  await readPools()
}

export async function createBasket(name: string, items: { symbol: string; weight: number }[], step: Step) {
  await ensureChain()
  step('Confirm in your wallet')
  const hash = await wal().writeContract({ address: CFG.contracts.basketRegistry, abi: registryAbi, functionName: 'createBasket', args: [name, items.map(i => token(i.symbol).address), items.map(i => Math.round(i.weight * 100))], account: acct() })
  await waitFor(hash, step)
}

/** Turns wallet and contract errors into a sentence a person can act on. */
export function friendly(e: unknown): string {
  const m = String((e as { shortMessage?: string })?.shortMessage ?? (e as Error)?.message ?? e)
  if (/user rejected|denied|rejected the request/i.test(m)) return 'Cancelled in your wallet.'
  if (/FaucetCooldown/.test(m)) return 'You can claim test USDG once a day. Try again tomorrow.'
  if (/insufficient funds|gas required exceeds/i.test(m)) return 'Your wallet needs testnet ETH to pay for gas. Get some from the faucet.'
  if (/SwapOutputTooLow/.test(m)) return 'The price moved too far while this was sending. Try again.'
  if (/UnknownRoot|NullifierSpent/.test(m)) return 'Your balance changed while this was sending. Reload and try again.'
  if (/TokenNotListed|DuplicateToken|WeightsMustTotal/.test(m)) return 'That basket is not valid. Check the stocks and weights.'
  if (/does not match the target chain|chain mismatch/i.test(m)) return 'Your wallet is on another network. Switch it to Robinhood Chain Testnet and try again.'
  if (/Failed to fetch|HTTP request failed|fetch failed/i.test(m)) return 'Could not reach the network. Check your connection and try again.'
  return m.length > 160 ? m.slice(0, 160) + '…' : m
}
export { toHex }
