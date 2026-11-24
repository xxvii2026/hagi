// Talks to the chain: balances, pools, baskets, vault notes, and every action the app can take.
import { concat, createPublicClient, createWalletClient, custom, getAddress, http, isAddress, keccak256, maxUint256, parseAbiItem, toHex, type Hex } from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import { erc20Abi, ghostAbi, registryAbi, swapAbi, vaultAbi } from './abi'
import { CFG, chain } from './chain'
import { STOCKS, TOKENS, fromUnits, token, tokenByAddress, type Basket } from './data'
import { SIGN_MESSAGE, MerkleTree, commitment, decryptNote, deriveKeys, encryptNote, ghostAddress, ghostBlinding, ghostPartial, matchGhost, nullifier, parseAddress, partialCommitment, randomField, toAddress, type Keys, type Note } from './zk/core'
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

export async function readWallet(): Promise<{ balances: Record<string, number>; eth: number; claimed: boolean }> {
  if (!account) return { balances: {}, eth: 0, claimed: false }
  const [eth, last, ...raw] = await Promise.all([pub.getBalance({ address: account }), pub.readContract({ address: CFG.contracts.usdg, abi: erc20Abi, functionName: 'lastClaim', args: [account] }).catch(() => 0n), ...TOKENS.map(t => pub.readContract({ address: t.address, abi: erc20Abi, functionName: 'balanceOf', args: [account!] }))])
  const balances: Record<string, number> = {}
  TOKENS.forEach((t, i) => { if (raw[i] > 0n) balances[t.symbol] = fromUnits(raw[i], t.decimals) })
  // The test USDG claim is once per account: the token records when this wallet last claimed.
  return { balances, eth: fromUnits(eth, 18), claimed: last > 0n }
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
  const ghosts = ghostKeys()
  for (const [index, c, tk, amount, enc] of logs) {
    if (index !== t.size) throw new Error('The vault history has a gap. Try again in a minute.')
    t.insert(BigInt(c))
    const d = decryptNote(enc, keys)
    let note: Note | null = d ? { ...d, amount: BigInt(amount) > 0n ? BigInt(amount) : d.amount, publicKey: keys.publicKey, index } : null
    if (!note || commitment(note) !== BigInt(c)) {
      // A claim from one of this account's Ghost Addresses is found from its public token and amount,
      // so a claim someone else sent with a bad encrypted note still shows up.
      const g = ghosts.length ? matchGhost(BigInt(c), BigInt(tk), BigInt(amount), ghosts) : null
      note = g == null ? null : { amount: BigInt(amount), token: BigInt(tk), blinding: g, publicKey: keys.publicKey, index }
    }
    if (note && note.amount > 0n && commitment(note) === BigInt(c)) { mine.push(note); if (BigInt(amount) === 0n) privateOnes.add(note) }
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

// ---------- Ghost Addresses ----------
// A Ghost Address is a plain 0x address that anyone can pay (a wallet, an exchange, a friend) and that only
// this account can claim from. Claiming moves the funds straight into a private note. The relayer sends the
// claim and pays the gas, so no wallet and no ETH are needed. Each account can make as many as it likes:
// addresses are numbered from the spending key, so every device finds the same ones.

export const ghostEnabled = () => !!CFG.contracts.ghost
const LOOKAHEAD = 1 // also watch the next unused address, so a new device spots funds sent to one made elsewhere
const ghostSlot = () => 'hagi-ghosts-' + keys!.publicKey.toString(16).slice(0, 24)
const ghostCount = () => { try { return Math.max(1, Number(localStorage.getItem(ghostSlot())) || 1) } catch { return 1 } }
const setGhostCount = (n: number) => { try { localStorage.setItem(ghostSlot(), String(n)) } catch { /* optional */ } }
function ghostKeys() {
  if (!keys || !ghostEnabled()) return []
  return Array.from({ length: ghostCount() + LOOKAHEAD }, (_, i) => ({ i, blinding: ghostBlinding(keys!, i), partial: ghostPartial(keys!, i) }))
}

let codeHash: Hex | null = null
async function ghostCodeHash(): Promise<Hex> {
  const slot = 'hagi-ghost-code-' + CFG.contracts.ghost!.toLowerCase()
  try { codeHash ??= localStorage.getItem(slot) as Hex | null } catch { /* optional */ }
  if (!codeHash) {
    codeHash = await pub.readContract({ address: CFG.contracts.ghost!, abi: ghostAbi, functionName: 'walletCodeHash' })
    try { localStorage.setItem(slot, codeHash) } catch { /* optional */ }
  }
  return codeHash
}

export type GhostDeposit = { index: number; address: Hex; symbol: string; amount: number; raw: bigint }
export type GhostState = { address: Hex; index: number; count: number; pending: GhostDeposit[] }

/** The current Ghost Address, every older one, and whatever is waiting at any of them to be claimed. */
export async function readGhosts(onlyCurrent = false): Promise<GhostState | null> {
  if (!keys || !ghostEnabled()) return null
  const hash = await ghostCodeHash()
  let list = ghostKeys().map(g => ({ ...g, address: ghostAddress(CFG.contracts.ghost!, hash, g.partial) }))
  const current = ghostCount() - 1
  const watch = onlyCurrent ? list.filter(g => g.i === current) : list
  const raw = await Promise.all(watch.flatMap(g => TOKENS.map(t => pub.readContract({ address: t.address, abi: erc20Abi, functionName: 'balanceOf', args: [g.address] }))))
  const pending: GhostDeposit[] = []
  watch.forEach((g, gi) => TOKENS.forEach((t, ti) => { const r = raw[gi * TOKENS.length + ti]; if (r > 0n) pending.push({ index: g.i, address: g.address, symbol: t.symbol, amount: fromUnits(r, t.decimals), raw: r }) }))
  // Funds at an address this device hasn't made yet means another device made it: catch up.
  const top = Math.max(current, ...pending.map(p => p.index))
  if (top > current) { setGhostCount(top + 1); list = ghostKeys().map(g => ({ ...g, address: ghostAddress(CFG.contracts.ghost!, hash, g.partial) })) }
  const now = list[ghostCount() - 1]
  return { address: now.address, index: now.i, count: ghostCount(), pending }
}

/** Moves to a brand new Ghost Address. Older ones keep working and are still watched. */
export async function newGhost(): Promise<GhostState | null> {
  if (!keys) throw new Error('Sign in first')
  setGhostCount(ghostCount() + 1)
  return readGhosts()
}

/** Claims a deposit from a Ghost Address into the private balance. The relayer sends it, so no wallet or gas is needed. */
export async function claimGhost(d: GhostDeposit, step: Step): Promise<number> {
  if (!keys) throw new Error('Sign in first')
  const t = token(d.symbol)
  const g = ghostKeys().find(x => x.i === d.index)
  if (!g) throw new Error('That Ghost Address isn’t on this account')
  step('Checking the deposit')
  const raw = await pub.readContract({ address: t.address, abi: erc20Abi, functionName: 'balanceOf', args: [d.address] })
  if (raw === 0n) throw new Error('Nothing is waiting at this address anymore. If it was claimed, it’s already in your balance.')
  const net = await pub.readContract({ address: CFG.contracts.ghost!, abi: ghostAbi, functionName: 'netOf', args: [raw] })
  step('Sending the claim through the relayer')
  const body = { partial: g.partial.toString(), token: t.address, amount: raw.toString(), encryptedNote: encryptNote({ amount: net, token: BigInt(t.address), blinding: g.blinding }, keys.encPublic) }
  let res: Response
  try { res = await fetch(CFG.relayerUrl.replace(/relay$/, 'ghost'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }
  catch { throw new Error('The relayer couldn’t be reached. Your deposit is safe at the Ghost Address. Try again in a minute.') }
  const j: { hash?: Hex; error?: string } = await res.json().catch(() => ({}))
  if (!res.ok || !j.hash) {
    if (j.error === 'TokenNotAllowed') throw new Error('Hagi doesn’t list this token, so it can’t be claimed.')
    throw new Error((j.error ?? 'The claim didn’t go through.') + ' Your deposit is safe at the Ghost Address.')
  }
  await sync(await waitFor(j.hash, step))
  return fromUnits(net, t.decimals)
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
  if (account && await pub.readContract({ address: CFG.contracts.usdg, abi: erc20Abi, functionName: 'lastClaim', args: [account] }) > 0n) throw new Error('You’ve already claimed your test USDG.')
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
    step(local ? `Allowing the vault to use ${sym}` : `Approve ${sym} in your wallet`)
    await waitFor(await wal().writeContract({ address: t.address, abi: erc20Abi, functionName: 'approve', args: [CFG.contracts.vault, maxUint256], account: acct() }), () => {})
  }
  const blinding = randomField()
  step(local ? 'Moving it into your private balance' : 'Confirm the deposit in your wallet')
  const hash = await wal().writeContract({ ...V, functionName: 'shield', args: [t.address, amount, partialCommitment(keys.publicKey, blinding), encryptNote({ amount, token: BigInt(t.address), blinding }, keys.encPublic)], account: acct() })
  await sync(await waitFor(hash, step))
}

/** Takes funds out of the vault, to your own wallet or to any other 0x wallet. The relayer submits it, so your wallet isn't on the transaction. */
export async function unshield(sym: string, n: number, step: Step, recipient?: Hex) {
  const amount = amountOf(sym, n, rawShielded(sym))
  const inputs = await inputsFor(sym, amount, step)
  await privately({ token: token(sym).address, inputs, outputs: change(inputs, amount), withdraw: { recipient: recipient ?? account!, amount } }, step)
}

export async function send(sym: string, n: number, to: string, step: Step) {
  const dest = parseAddress(to)
  if (!dest) throw new Error('That is not a Hagi address')
  const amount = amountOf(sym, n, rawShielded(sym))
  const inputs = await inputsFor(sym, amount, step)
  await privately({ token: token(sym).address, inputs, outputs: [{ amount, publicKey: dest.publicKey, encPublic: dest.encPublic }, ...change(inputs, amount)] }, step)
}

export type BurstItem = { to: string; n: number }
export const BURST_MAX = 20

/** Pays many people in one go. Each payment is its own private transaction that spends the change of the one before,
 *  so it runs as a quick chain. hagi1 addresses get a private note, 0x wallets are paid straight from the vault.
 *  Returns how many were paid, so a failure part way through can say exactly where it stopped. */
export async function burst(sym: string, items: BurstItem[], step: Step, onPaid?: (i: number) => void): Promise<number> {
  if (!keys || !account) throw new Error('Unlock your Hagi account first')
  if (items.length === 0) throw new Error('Add at least one person')
  if (items.length > BURST_MAX) throw new Error(`You can pay up to ${BURST_MAX} people at once`)
  const t = token(sym)
  const plan = items.map(it => {
    const to = it.to.trim(), amount = amountOf(sym, it.n, 0n)
    if (amount <= 0n) throw new Error('Every amount needs to be more than zero')
    const hagi = parseAddress(to)
    if (hagi) return { amount, hagi, wallet: null as Hex | null }
    if (isAddress(to)) return { amount, hagi: null, wallet: getAddress(to) }
    throw new Error(`${to.slice(0, 12)}… is not a Hagi or 0x address`)
  })
  const total = plan.reduce((s, x) => s + x.amount, 0n)
  if (total > rawShielded(sym)) throw new Error('Not enough shielded ' + sym + ' for everyone')
  // Gather the funds into one note first, so each payment after that only spends the change.
  await inputsFor(sym, total, m => step('Getting ready · ' + m))
  let paid = 0
  for (const [i, x] of plan.entries()) {
    const sub: Step = m => step(`Paying ${i + 1} of ${plan.length} · ${m}`)
    try {
      const inputs = await inputsFor(sym, x.amount, sub)
      if (x.hagi) await privately({ token: t.address, inputs, outputs: [{ amount: x.amount, publicKey: x.hagi.publicKey, encPublic: x.hagi.encPublic }, ...change(inputs, x.amount)] }, sub)
      else await privately({ token: t.address, inputs, outputs: change(inputs, x.amount), withdraw: { recipient: x.wallet!, amount: x.amount } }, sub)
    } catch (e) {
      if (paid === 0) throw e
      throw new Error(`Paid ${paid} of ${plan.length}, then stopped: ${friendly(e)} The rest were not sent and their funds are still in your private balance.`)
    }
    paid++; onPaid?.(i)
  }
  return paid
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

/** Buys several stocks from USDG in one private transaction. Returns how much of each stock arrived. */
async function buyLegs(items: { symbol: string; usdg: bigint }[], step: Step, basketId?: number): Promise<Record<string, number>> {
  const total = items.reduce((s, x) => s + x.usdg, 0n)
  const inputs = await inputsFor('USDG', total, step)
  const usdg = token('USDG').address
  const before = shielded()
  const legs = [], legNotes = []
  for (const it of items) {
    const out = token(it.symbol).address
    const blinding = randomField()
    legs.push({ tokenOut: out, amountIn: it.usdg, minOut: ((await quote(usdg, out, it.usdg)) * SLIPPAGE) / 1000n, partialCommitment: partialCommitment(keys!.publicKey, blinding) })
    legNotes.push({ blinding })
  }
  await privately({ token: usdg, inputs, outputs: change(inputs, total), swap: { legs, legNotes, ...(basketId != null ? { basketId: BigInt(basketId) } : {}) } }, step)
  await readPools()
  const after = shielded(), got: Record<string, number> = {}
  for (const it of items) got[it.symbol] = Math.max(0, (after[it.symbol] ?? 0) - (before[it.symbol] ?? 0))
  return got
}

export async function buyBasket(b: Basket, n: number, step: Step): Promise<Record<string, number>> {
  const total = amountOf('USDG', n, rawShielded('USDG'))
  let used = 0n
  const items = b.items.map((it, i) => { const usdg = i + 1 < b.items.length ? (total * BigInt(it.bps)) / 10_000n : total - used; used += usdg; return { symbol: it.symbol, usdg } })
  return buyLegs(items, step, b.id)
}

/** Sells a set of stocks back to USDG. Each stock is its own private swap, run one after another.
 *  Returns the USDG received for each stock that sold, so a stop part way through still reports what happened. */
export async function sellStocks(units: Record<string, number>, step: Step): Promise<Record<string, number>> {
  const todo = Object.entries(units).filter(([, v]) => v > 1e-9)
  const got: Record<string, number> = {}
  for (const [i, [sym, n]] of todo.entries()) {
    const sub: Step = m => step(`Selling ${sym} · ${i + 1} of ${todo.length} · ${m}`)
    try { got[sym] = await swap(sym, 'USDG', Math.min(n, shielded()[sym] ?? 0), sub) }
    catch (e) {
      if (i === 0) throw e
      throw Object.assign(new Error(`Sold ${i} of ${todo.length}, then stopped: ${friendly(e)} The rest are still in your private balance.`), { partial: got })
    }
  }
  return got
}

/** Brings a basket back to its weights: sells what has grown past its share, then buys what fell behind in one go. Returns the new amounts. */
export async function rebalance(items: Basket['items'], units: Record<string, number>, step: Step): Promise<Record<string, number>> {
  const price = (k: string) => token(k).price
  const V = items.reduce((t, it) => t + (units[it.symbol] ?? 0) * price(it.symbol), 0)
  if (V <= 0) throw new Error('Nothing in this basket to rebalance')
  const gap = items.map(it => ({ sym: it.symbol, d: V * it.weight / 100 - (units[it.symbol] ?? 0) * price(it.symbol) }))
  const min = Math.max(0.5, V * 0.005)
  const sells: Record<string, number> = {}
  for (const g of gap) if (-g.d > min && price(g.sym) > 0) sells[g.sym] = -g.d / price(g.sym)
  if (!Object.keys(sells).length) throw new Error('This basket is already on target')
  const out = { ...units }
  const sold = await sellStocks(sells, step)
  for (const k of Object.keys(sold)) out[k] = (out[k] ?? 0) - sells[k]
  const cash = Object.values(sold).reduce((t, v) => t + v, 0)
  const need = gap.filter(g => g.d > min)
  const want = need.reduce((t, g) => t + g.d, 0)
  if (cash > 0 && want > 0) {
    const scale = Math.min(1, cash / want)
    const buys = need.map(g => ({ symbol: g.sym, usdg: amountOf('USDG', Math.floor(g.d * scale * 1e6) / 1e6, 0n) })).filter(x => x.usdg > 0n)
    if (buys.length) { const got = await buyLegs(buys, m => step('Buying back in · ' + m)); for (const [k, v] of Object.entries(got)) out[k] = (out[k] ?? 0) + v }
  }
  return out
}

export async function createBasket(name: string, items: { symbol: string; weight: number }[], step: Step) {
  await ensureChain()
  step(local ? 'Creating your basket' : 'Confirm in your wallet')
  const hash = await wal().writeContract({ address: CFG.contracts.basketRegistry, abi: registryAbi, functionName: 'createBasket', args: [name, items.map(i => token(i.symbol).address), items.map(i => Math.round(i.weight * 100))], account: acct() })
  await waitFor(hash, step)
}

/** Turns wallet and contract errors into a sentence a person can act on. */
export function friendly(e: unknown): string {
  const m = String((e as { shortMessage?: string })?.shortMessage ?? (e as Error)?.message ?? e)
  if (/user rejected|denied|rejected the request/i.test(m)) return 'Cancelled in your wallet.'
  if (/FaucetCooldown/.test(m)) return 'You’ve already claimed your test USDG.'
  if (/insufficient funds|gas required exceeds/i.test(m)) return 'Your wallet needs testnet ETH to pay for gas. Get some from the faucet.'
  if (/SwapOutputTooLow/.test(m)) return 'The price moved too far while this was sending. Try again.'
  if (/UnknownRoot|NullifierSpent/.test(m)) return 'Your balance changed while this was sending. Reload and try again.'
  if (/TokenNotListed|DuplicateToken|WeightsMustTotal/.test(m)) return 'That basket is not valid. Check the stocks and weights.'
  if (/does not match the target chain|chain mismatch/i.test(m)) return 'Your wallet is on another network. Switch it to Robinhood Chain Testnet and try again.'
  if (/Failed to fetch|HTTP request failed|fetch failed/i.test(m)) return 'Could not reach the network. Check your connection and try again.'
  return m.length > 160 ? m.slice(0, 160) + '…' : m
}
export { toHex }
