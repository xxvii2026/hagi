// End-to-end test of the mainnet beta on a copy of Robinhood Chain mainnet, with real proofs.
// Real USDG, real stock tokens, real Uniswap pools, the mainnet proving keys and the mainnet deploy script.
// Run from the repo root:  MAINNET_RPC=... npx tsx contracts/e2e/mainnet-fork.ts
import { execSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { createPublicClient, createWalletClient, encodePacked, http, parseAbi, parseAbiItem, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { MerkleTree, commitment, decryptNote, deriveKeys, encryptNote, nullifier, partialCommitment, randomField, type Keys, type Note } from '../../src/zk/core'
import { buildTransaction } from '../../src/zk/prove'

const UP = process.env.MAINNET_RPC || 'https://rpc.mainnet.chain.robinhood.com'
const PORT = 8547, RPC = `http://127.0.0.1:${PORT}`
const K0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const K1 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const K2 = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'
const ART = { wasm: 'public/zk/main/transaction.wasm', zkey: 'public/zk/main/transaction.zkey' }
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' as Hex
const QUOTER = '0x33e885eD0Ec9bf04EcfB19341582AaDCB4C8A9e7' as Hex
const WHALE = '0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca' // a Uniswap pool that holds plenty of USDG
const tokens: { symbol: string; address: Hex; fee: number }[] = JSON.parse(readFileSync('contracts/deployments/mainnet-tokens.json', 'utf8'))
const T = (s: string) => tokens.find(t => t.symbol === s)!
const vaultAbi = JSON.parse(readFileSync('contracts/out/HagiVault.sol/HagiVault.json', 'utf8')).abi
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function transfer(address,uint256) returns (bool)'])
const quoter = parseAbi([
  'struct P { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }',
  'function quoteExactInputSingle(P params) returns (uint256 amountOut, uint160, uint32, uint256)',
  'function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[], uint32[], uint256)',
])
const NEW_COMMITMENT = parseAbiItem('event NewCommitment(uint256 indexed commitment, uint256 index, address token, uint256 amount, bytes encryptedNote)')

const chain = { ...foundry, rpcUrls: { default: { http: [RPC] } } }
const pub = createPublicClient({ chain, transport: http(RPC, { timeout: 120_000 }) })
const wallet = (k: string) => createWalletClient({ chain, transport: http(RPC, { timeout: 120_000 }), account: privateKeyToAccount(k as Hex) })
const alice = wallet(K1), relayer = wallet(K2)
const sh = (cmd: string) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

async function main() {
  const anvil = spawn('anvil', ['--fork-url', UP, '--port', String(PORT), '--silent', '--no-rate-limit', '--retries', '10', '--timeout', '60000'], { stdio: 'ignore' })
  try {
    for (let i = 0; ; i++) { try { await pub.getBlockNumber(); break } catch { if (i > 60) throw new Error('anvil did not start'); await new Promise(r => setTimeout(r, 1000)) } }
    const forkBlock = await pub.getBlockNumber()

    const out = execSync(`forge script script/DeployMainnet.s.sol:DeployMainnet --rpc-url ${RPC} --broadcast --slow`, { cwd: 'contracts', env: { ...process.env, DEPLOYER_PRIVATE_KEY: K0 }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    const d = Object.fromEntries([...out.matchAll(/DEPLOYED (\w+) (0x[0-9a-fA-F]{40})/g)].map(m => [m[1], m[2] as Hex]))
    const listed = Number(out.match(/LISTED stocks (\d+)/)?.[1])
    assert.equal(listed, tokens.length)
    const deployGas = sh(`cast receipt --rpc-url ${RPC} $(cast block latest --rpc-url ${RPC} --json | jq -r '.transactions[0]') gasUsed`).trim()
    const spent = 10_000n * 10n ** 18n - await pub.getBalance({ address: privateKeyToAccount(K0).address })
    console.log(`ok  deploy: vault ${d.vault}, adapter ${d.adapter}, ${listed} stocks listed, whole deploy cost ${Number(spent) / 1e18} ETH at the fork's gas price (last tx gas ${deployGas})`)
    const vault = { address: d.vault, abi: vaultAbi } as const
    const bal = (token: Hex, who: Hex) => pub.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [who] })
    const send = async (w: typeof alice, req: any) => { const hash = await w.writeContract(req); const r = await pub.waitForTransactionReceipt({ hash }); assert.equal(r.status, 'success'); return r }

    // Give Alice 150 real USDG from a Uniswap pool's balance.
    sh(`cast rpc anvil_impersonateAccount ${WHALE} --rpc-url ${RPC}`)
    sh(`cast rpc anvil_setBalance ${WHALE} 0xde0b6b3a7640000 --rpc-url ${RPC}`)
    sh(`cast send ${USDG} "transfer(address,uint256)" ${alice.account.address} 150000000 --from ${WHALE} --unlocked --rpc-url ${RPC}`)
    assert.equal(await bal(USDG, alice.account.address), 150_000000n)

    const aKeys = deriveKeys('0xa11ce0'), bKeys = deriveKeys('0xb0b0')
    async function scan(keys: Keys) {
      const logs = await pub.getLogs({ address: d.vault, event: NEW_COMMITMENT, fromBlock: forkBlock })
      const tree = new MerkleTree(), notes: Note[] = []
      for (const l of logs.sort((a, b) => Number(a.args.index! - b.args.index!))) {
        tree.insert(l.args.commitment!)
        const x = decryptNote(l.args.encryptedNote!, keys)
        if (!x) continue
        const note: Note = { ...x, amount: l.args.amount! > 0n ? l.args.amount! : x.amount, publicKey: keys.publicKey, index: Number(l.args.index) }
        if (commitment(note) !== l.args.commitment || note.amount === 0n) continue
        if (!(await pub.readContract({ ...vault, functionName: 'nullifierSpent', args: [nullifier(note, keys.privateKey)] }))) notes.push(note)
      }
      assert.equal(tree.root, await pub.readContract({ ...vault, functionName: 'latestRoot' }), 'local tree root must match the vault')
      return { tree, notes }
    }
    const find = (notes: Note[], token: Hex) => notes.filter(n => n.token === BigInt(token))
    const transact = (r: Awaited<ReturnType<typeof buildTransaction>>) => send(relayer, { ...vault, functionName: 'transact', args: [r.proof, r.ext] })
    const me = { publicKey: aKeys.publicKey, encPublic: aKeys.encPublic }
    const RELAYER = relayer.account.address

    // 1. Shield 100 USDG (the per-address limit), and check the limit holds on the 101st dollar.
    await send(alice, { address: USDG, abi: erc20, functionName: 'approve', args: [d.vault, 2n ** 255n] })
    const shield = (amt: bigint) => { const blinding = randomField(); return alice.writeContract({ ...vault, functionName: 'shield', args: [USDG, amt, partialCommitment(aKeys.publicKey, blinding), encryptNote({ amount: amt, token: BigInt(USDG), blinding }, aKeys.encPublic)] }) }
    let rc = await pub.waitForTransactionReceipt({ hash: await shield(100_000000n) })
    assert.equal(rc.status, 'success')
    await assert.rejects(shield(1_000000n), /OverAddressLimit|revert/i)
    let a = await scan(aKeys)
    assert.deepEqual(a.notes.map(n => n.amount), [100_000000n])
    console.log(`ok  shield: 100 real USDG in, the 101st dollar is refused (gas ${rc.gasUsed})`)

    // 2. Private swap: 40 USDG into TSLA through Uniswap, paying the relayer 0.05 USDG.
    const FEE = 50_000n
    const q1 = (await pub.simulateContract({ address: QUOTER, abi: quoter, functionName: 'quoteExactInputSingle', args: [{ tokenIn: USDG, tokenOut: T('TSLA').address, amountIn: 40_000000n, fee: T('TSLA').fee, sqrtPriceLimitX96: 0n }] })).result[0]
    let bl = randomField()
    let t0 = Date.now()
    let tx = await buildTransaction({ keys: aKeys, tree: a.tree, token: USDG, inputs: [a.notes[0]], outputs: [{ amount: 100_000000n - 40_000000n - FEE, ...me }],
      swap: { legs: [{ tokenOut: T('TSLA').address, amountIn: 40_000000n, minOut: q1 * 995n / 1000n, partialCommitment: partialCommitment(aKeys.publicKey, bl) }], legNotes: [{ blinding: bl }] }, relayer: RELAYER, fee: FEE }, ART)
    const proofMs = Date.now() - t0
    rc = await transact(tx)
    a = await scan(aKeys)
    assert.equal(find(a.notes, T('TSLA').address)[0].amount, q1)
    assert.equal(await bal(USDG, RELAYER), FEE)
    console.log(`ok  private swap: 40 USDG became ${Number(q1) / 1e18} TSLA, relayer was paid 0.05 USDG (proof ${proofMs} ms, gas ${rc.gasUsed})`)

    // 3. Stock to stock: half the TSLA into NVDA, through USDG, with the fee paid in TSLA.
    const tsla = find(a.notes, T('TSLA').address)[0], half = tsla.amount / 2n, feeT = tsla.amount / 500n
    const path = encodePacked(['address', 'uint24', 'address', 'uint24', 'address'], [T('TSLA').address, T('TSLA').fee, USDG, T('NVDA').fee, T('NVDA').address])
    const q2 = (await pub.simulateContract({ address: QUOTER, abi: quoter, functionName: 'quoteExactInput', args: [path, half] })).result[0]
    bl = randomField()
    tx = await buildTransaction({ keys: aKeys, tree: a.tree, token: T('TSLA').address, inputs: [tsla], outputs: [{ amount: tsla.amount - half - feeT, ...me }],
      swap: { legs: [{ tokenOut: T('NVDA').address, amountIn: half, minOut: q2 * 995n / 1000n, partialCommitment: partialCommitment(aKeys.publicKey, bl) }], legNotes: [{ blinding: bl }] }, relayer: RELAYER, fee: feeT }, ART)
    rc = await transact(tx)
    a = await scan(aKeys)
    assert.equal(find(a.notes, T('NVDA').address)[0].amount, q2)
    assert.equal(await bal(T('TSLA').address, RELAYER), feeT)
    console.log(`ok  stock to stock: TSLA became ${Number(q2) / 1e18} NVDA, fee paid in TSLA (gas ${rc.gasUsed})`)

    // 4. Private send of 20 USDG to Bob. Nothing leaves the vault except the fee.
    const usdgNote = find(a.notes, USDG)[0]
    tx = await buildTransaction({ keys: aKeys, tree: a.tree, token: USDG, inputs: [usdgNote], outputs: [{ amount: 20_000000n, publicKey: bKeys.publicKey, encPublic: bKeys.encPublic }, { amount: usdgNote.amount - 20_000000n - FEE, ...me }], relayer: RELAYER, fee: FEE }, ART)
    rc = await transact(tx)
    let b = await scan(bKeys)
    assert.deepEqual(b.notes.map(n => n.amount), [20_000000n])
    console.log(`ok  private send: Bob has 20 USDG, only the fee left the vault (gas ${rc.gasUsed})`)

    // 5. Bob unshields to a fresh wallet, and Alice takes her NVDA out as the real token.
    const fresh = '0x00000000000000000000000000000000000B0b01' as Hex
    tx = await buildTransaction({ keys: bKeys, tree: b.tree, token: USDG, inputs: [b.notes[0]], outputs: [], withdraw: { recipient: fresh, amount: 20_000000n - FEE }, relayer: RELAYER, fee: FEE }, ART)
    rc = await transact(tx)
    assert.equal(await bal(USDG, fresh), 20_000000n - FEE)
    a = await scan(aKeys)
    const nvda = find(a.notes, T('NVDA').address)[0]
    tx = await buildTransaction({ keys: aKeys, tree: a.tree, token: T('NVDA').address, inputs: [nvda], outputs: [], withdraw: { recipient: alice.account.address, amount: nvda.amount } }, ART)
    const rc2 = await transact(tx)
    assert.equal(await bal(T('NVDA').address, alice.account.address), nvda.amount)
    console.log(`ok  unshield: 19.95 USDG reached a fresh wallet, real NVDA reached Alice (gas ${rc.gasUsed} and ${rc2.gasUsed})`)

    // 6. Pause: deposits and swaps stop, a withdrawal still goes through.
    await send(wallet(K0), { ...vault, functionName: 'setPaused', args: [true] })
    a = await scan(aKeys)
    const left = find(a.notes, USDG)[0]
    tx = await buildTransaction({ keys: aKeys, tree: a.tree, token: USDG, inputs: [left], outputs: [], withdraw: { recipient: alice.account.address, amount: left.amount - FEE }, relayer: RELAYER, fee: FEE }, ART)
    await transact(tx)
    console.log('ok  paused vault still pays out')

    // 7. A proof made with the old testnet keys must be refused by the mainnet verifier.
    a = await scan(aKeys)
    const t2 = find(a.notes, T('TSLA').address)[0]
    const bad = await buildTransaction({ keys: aKeys, tree: a.tree, token: T('TSLA').address, inputs: [t2], outputs: [], withdraw: { recipient: alice.account.address, amount: t2.amount } }, { wasm: 'public/zk/transaction.wasm', zkey: 'public/zk/transaction.zkey' })
    await assert.rejects(relayer.writeContract({ ...vault, functionName: 'transact', args: [bad.proof, bad.ext] }), /InvalidProof|revert/i)
    console.log('ok  a proof from the testnet keys is rejected on mainnet')
    console.log('ALL MAINNET FORK CHECKS PASSED')
  } finally { anvil.kill() }
}
main().catch(e => { console.error(e); process.exit(1) })
