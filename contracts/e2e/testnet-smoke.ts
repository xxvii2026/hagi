// Runs one real pass through the live vault on Robinhood Chain Testnet using the deployer wallet:
// claim test USDG, shield, swap privately through the relayer, then unshield.
// Run from the repo root:  DEPLOYER_PRIVATE_KEY=... RELAYER_URL=https://<site>/api/relay npx tsx contracts/e2e/testnet-smoke.ts
import assert from 'node:assert/strict'
import { createPublicClient, createWalletClient, http, maxUint256, parseAbi, parseAbiItem, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { readFileSync } from 'node:fs'
import { MerkleTree, SIGN_MESSAGE, commitment, decryptNote, deriveKeys, encryptNote, nullifier, partialCommitment, randomField, type Note } from '../../src/zk/core'
import { buildTransaction } from '../../src/zk/prove'

const D = JSON.parse(readFileSync('contracts/deployments/testnet.json', 'utf8'))
const RPC = process.env.RPC_URL || 'https://rpc.testnet.chain.robinhood.com'
const RELAYER_URL = process.env.RELAYER_URL || ''
const DEPLOY_BLOCK = 154069900n
const USDG = D.contracts.TestUSDG as Hex, VAULT = D.contracts.HagiVault as Hex, SWAP = D.contracts.HagiSwap as Hex, TSLA = D.stockTokens.TSLA as Hex
const ART = { wasm: 'public/zk/transaction.wasm', zkey: 'public/zk/transaction.zkey' }
const chain = { id: 46630, name: 'Robinhood Chain Testnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
const account = privateKeyToAccount(('0x' + process.env.DEPLOYER_PRIVATE_KEY!.replace(/^0x/, '')) as Hex)
const pub = createPublicClient({ chain, transport: http(RPC) })
const wallet = createWalletClient({ chain, transport: http(RPC), account })
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function faucet()', 'function lastClaim(address) view returns (uint256)'])
const vaultAbi = parseAbi([
  'struct Proof { uint256[2] a; uint256[2][2] b; uint256[2] c; uint256 root; uint256[2] nullifiers; uint256[2] commitments; }',
  'struct SwapLeg { address tokenOut; uint256 amountIn; uint256 minOut; uint256 partialCommitment; bytes encryptedNote; }',
  'struct ExtData { address recipient; address token; uint256 amount; address relayer; uint256 fee; bytes encryptedOutput1; bytes encryptedOutput2; SwapLeg[] legs; uint256 basketId; }',
  'function shield(address token, uint256 amount, uint256 partialCommitment, bytes encryptedNote)', 'function transact(Proof p, ExtData ext)',
  'function nullifierSpent(uint256) view returns (bool)', 'function latestRoot() view returns (uint256)',
])
const swapAbi = parseAbi(['function quoteExactIn(address,address,uint256) view returns (uint256)'])
const EVENT = parseAbiItem('event NewCommitment(uint256 indexed commitment, uint256 index, address token, uint256 amount, bytes encryptedNote)')
const bal = (t: Hex, who: Hex) => pub.readContract({ address: t, abi: erc20, functionName: 'balanceOf', args: [who] })
const mined = async (hash: Hex) => { const r = await pub.waitForTransactionReceipt({ hash }); assert.equal(r.status, 'success', 'transaction ' + hash + ' failed'); return r }

async function main() {
  console.log('SMOKE wallet', account.address, '· relayer url', RELAYER_URL || '(none, sending directly)')
  const keys = deriveKeys(await account.signMessage({ message: SIGN_MESSAGE }))

  async function scan() {
    const latest = await pub.getBlockNumber({ cacheTime: 0 })
    const logs = []
    for (let from = DEPLOY_BLOCK; from <= latest; from += 5_000_000n) logs.push(...await pub.getLogs({ address: VAULT, event: EVENT, fromBlock: from, toBlock: from + 4_999_999n > latest ? latest : from + 4_999_999n }))
    const tree = new MerkleTree(), notes: Note[] = []
    for (const l of logs.sort((a, b) => Number(a.args.index! - b.args.index!))) {
      tree.insert(l.args.commitment!)
      const d = decryptNote(l.args.encryptedNote!, keys)
      if (!d) continue
      const n: Note = { ...d, amount: l.args.amount! > 0n ? l.args.amount! : d.amount, publicKey: keys.publicKey, index: Number(l.args.index) }
      if (n.amount > 0n && commitment(n) === l.args.commitment && !(await pub.readContract({ address: VAULT, abi: vaultAbi, functionName: 'nullifierSpent', args: [nullifier(n, keys.privateKey)] }))) notes.push(n)
    }
    assert.equal(tree.root, await pub.readContract({ address: VAULT, abi: vaultAbi, functionName: 'latestRoot' }), 'local tree must match the vault')
    return { tree, notes }
  }
  const of = (notes: Note[], t: Hex) => notes.filter(n => n.token === BigInt(t)).sort((a, b) => (b.amount > a.amount ? 1 : -1))

  async function submit(tx: Awaited<ReturnType<typeof buildTransaction>>) {
    if (RELAYER_URL) {
      const res = await fetch(RELAYER_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proof: tx.proof, ext: tx.ext }, (_, v) => (typeof v === 'bigint' ? v.toString() : v)) })
      const text = await res.text()
      if (res.ok) { const hash = JSON.parse(text).hash as Hex; const r = await mined(hash); console.log('SMOKE relayed by', r.from, 'tx', hash); return 'relayer' }
      console.log('SMOKE relayer answered', res.status, text.slice(0, 200).replace(/\s+/g, ' '))
    }
    const hash = await wallet.writeContract({ address: VAULT, abi: vaultAbi, functionName: 'transact', args: [tx.proof, tx.ext] })
    await mined(hash); console.log('SMOKE sent directly, tx', hash); return 'direct'
  }

  // 1. Test USDG
  if (await bal(USDG, account.address) < 200_000000n) { await mined(await wallet.writeContract({ address: USDG, abi: erc20, functionName: 'faucet' })); console.log('SMOKE claimed 5,000 test USDG') }

  // 2. Shield 200 USDG
  if (await pub.readContract({ address: USDG, abi: erc20, functionName: 'allowance', args: [account.address, VAULT] }) < 200_000000n) await mined(await wallet.writeContract({ address: USDG, abi: erc20, functionName: 'approve', args: [VAULT, maxUint256] }))
  const blinding = randomField()
  const sh = await mined(await wallet.writeContract({ address: VAULT, abi: vaultAbi, functionName: 'shield', args: [USDG, 200_000000n, partialCommitment(keys.publicKey, blinding), encryptNote({ amount: 200_000000n, token: BigInt(USDG), blinding }, keys.encPublic)] }))
  let s = await scan()
  assert.ok(of(s.notes, USDG).length >= 1)
  console.log('SMOKE ok shield: 200 USDG, gas', sh.gasUsed.toString())

  // 3. Private swap of 50 USDG into TSLA
  const input = of(s.notes, USDG)[0]
  const q = await pub.readContract({ address: SWAP, abi: swapAbi, functionName: 'quoteExactIn', args: [USDG, TSLA, 50_000000n] })
  const lb = randomField()
  const tslaBefore = of(s.notes, TSLA).length
  let via = await submit(await buildTransaction({ keys, tree: s.tree, token: USDG, inputs: [input], outputs: [{ amount: input.amount - 50_000000n, publicKey: keys.publicKey, encPublic: keys.encPublic }],
    swap: { legs: [{ tokenOut: TSLA, amountIn: 50_000000n, minOut: q * 99n / 100n, partialCommitment: partialCommitment(keys.publicKey, lb) }], legNotes: [{ blinding: lb }] } }, ART))
  s = await scan()
  assert.equal(of(s.notes, TSLA).length, tslaBefore + 1)
  console.log(`SMOKE ok private swap via ${via}: 50 USDG became ${Number(of(s.notes, TSLA)[0].amount) / 1e18} TSLA in the vault`)

  // 4. Unshield 10 USDG
  const u = of(s.notes, USDG)[0], before = await bal(USDG, account.address)
  via = await submit(await buildTransaction({ keys, tree: s.tree, token: USDG, inputs: [u], outputs: [{ amount: u.amount - 10_000000n, publicKey: keys.publicKey, encPublic: keys.encPublic }], withdraw: { recipient: account.address, amount: 10_000000n } }, ART))
  assert.equal(await bal(USDG, account.address) - before, 10_000000n)
  console.log(`SMOKE ok unshield via ${via}: 10 USDG back in the wallet`)
  console.log('SMOKE ALL TESTNET CHECKS PASSED')
}
main().then(() => process.exit(0), e => { console.error('SMOKE FAILED', e); process.exit(1) })
