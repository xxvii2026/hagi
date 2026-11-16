// End-to-end test of the vault on a local chain, using the same code the browser uses.
// Run from the repo root:  npx tsx contracts/e2e/e2e.ts
import { execSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { createPublicClient, createWalletClient, http, parseAbiItem, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { MerkleTree, commitment, decryptNote, deriveKeys, encryptNote, nullifier, parseAddress, partialCommitment, randomField, toAddress, type Keys, type Note } from '../../src/zk/core'
import { buildTransaction } from '../../src/zk/prove'

const PORT = 8546
const RPC = `http://127.0.0.1:${PORT}`
const K0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const K1 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const K2 = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'
const ART = { wasm: 'public/zk/transaction.wasm', zkey: 'public/zk/transaction.zkey' }
const abi = (n: string) => JSON.parse(readFileSync(`contracts/out/${n}.sol/${n}.json`, 'utf8')).abi
const NEW_COMMITMENT = parseAbiItem('event NewCommitment(uint256 indexed commitment, uint256 index, address token, uint256 amount, bytes encryptedNote)')

const chain = { ...foundry, rpcUrls: { default: { http: [RPC] } } }
const pub = createPublicClient({ chain, transport: http(RPC) })
const wallet = (k: string) => createWalletClient({ chain, transport: http(RPC), account: privateKeyToAccount(k as Hex) })
const alice = wallet(K1), relayer = wallet(K2)

function forge(script: string, env: Record<string, string>) {
  const out = execSync(`forge script script/${script} --rpc-url ${RPC} --broadcast --slow`, { cwd: 'contracts', env: { ...process.env, DEPLOYER_PRIVATE_KEY: K0, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return Object.fromEntries([...out.matchAll(/DEPLOYED (\w+) (0x[0-9a-fA-F]{40})/g)].map(m => [m[1], m[2] as Hex]))
}

async function main() {
  const anvil = spawn('anvil', ['--port', String(PORT), '--silent'], { stdio: 'ignore' })
  try {
    await new Promise(r => setTimeout(r, 1500))
    const base = forge('LocalSetup.s.sol:LocalSetup', { TEST_USER: alice.account.address })
    const stocks = ['TSLA', 'AMD', 'AMZN', 'NFLX', 'PLTR'].map(s => base[s])
    const v = forge('DeployVault.s.sol:DeployVault', { HAGI_USDG: base.usdg, HAGI_SWAP: base.swap, HAGI_TOKENS: stocks.join(',') })
    const vaultAbi = abi('HagiVault'), erc20 = abi('TestUSDG'), swapAbi = abi('HagiSwap'), regAbi = abi('BasketRegistry')
    const vault = { address: v.vault, abi: vaultAbi } as const
    const bal = (token: Hex, who: Hex) => pub.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [who] }) as Promise<bigint>
    const send = async (w: typeof alice, req: any) => { const hash = await w.writeContract(req); const r = await pub.waitForTransactionReceipt({ hash }); assert.equal(r.status, 'success'); return r }

    const aKeys = deriveKeys('0xa11ce0')
    const bKeys = deriveKeys('0xb0b0')
    assert.deepEqual(parseAddress(toAddress(bKeys))?.publicKey, bKeys.publicKey)

    // Rebuilds the tree and finds a key's unspent notes from chain events, as the app will.
    async function scan(keys: Keys) {
      const logs = await pub.getLogs({ address: v.vault, event: NEW_COMMITMENT, fromBlock: 0n })
      const tree = new MerkleTree()
      const notes: Note[] = []
      for (const l of logs.sort((a, b) => Number(a.args.index! - b.args.index!))) {
        assert.equal(Number(l.args.index), tree.size)
        tree.insert(l.args.commitment!)
        const d = decryptNote(l.args.encryptedNote!, keys)
        if (!d) continue
        const note: Note = { ...d, amount: l.args.amount! > 0n ? l.args.amount! : d.amount, publicKey: keys.publicKey, index: Number(l.args.index) }
        if (commitment(note) !== l.args.commitment || note.amount === 0n) continue
        const spent = await pub.readContract({ ...vault, functionName: 'nullifierSpent', args: [nullifier(note, keys.privateKey)] })
        if (!spent) notes.push(note)
      }
      assert.equal(tree.root, await pub.readContract({ ...vault, functionName: 'latestRoot' }), 'local tree root must match the vault')
      return { tree, notes }
    }
    const find = (notes: Note[], token: Hex) => notes.filter(n => n.token === BigInt(token))
    const transact = async (r: Awaited<ReturnType<typeof buildTransaction>>) => send(relayer, { ...vault, functionName: 'transact', args: [r.proof, r.ext] })

    // 1. Shield 1,000 USDG
    await send(alice, { address: base.usdg, abi: erc20, functionName: 'approve', args: [v.vault, 2n ** 255n] })
    const blinding = randomField()
    await send(alice, { ...vault, functionName: 'shield', args: [base.usdg, 1_000_000000n, partialCommitment(aKeys.publicKey, blinding), encryptNote({ amount: 1_000_000000n, token: BigInt(base.usdg), blinding }, aKeys.encPublic)] })
    let a = await scan(aKeys)
    assert.equal(a.notes.length, 1); assert.equal(a.notes[0].amount, 1_000_000000n)
    console.log('ok  shield: 1,000 USDG note found, tree root matches')

    // 2. Private send of 300 USDG to Bob, submitted by the relayer
    let t0 = Date.now()
    let tx = await buildTransaction({ keys: aKeys, tree: a.tree, token: base.usdg, inputs: [a.notes[0]], outputs: [{ amount: 300_000000n, publicKey: bKeys.publicKey, encPublic: bKeys.encPublic }, { amount: 700_000000n, publicKey: aKeys.publicKey, encPublic: aKeys.encPublic }] }, ART)
    const proofMs = Date.now() - t0
    let rc = await transact(tx)
    a = await scan(aKeys)
    let b = await scan(bKeys)
    assert.deepEqual(a.notes.map(n => n.amount), [700_000000n]); assert.deepEqual(b.notes.map(n => n.amount), [300_000000n])
    console.log(`ok  private send: Bob has 300, Alice has 700 change (proof ${proofMs} ms, gas ${rc.gasUsed})`)

    // 3. Private swap of 200 USDG into TSLA
    const quote = await pub.readContract({ address: base.swap, abi: swapAbi, functionName: 'quoteExactIn', args: [base.usdg, stocks[0], 200_000000n] }) as bigint
    let legBlinding = randomField()
    tx = await buildTransaction({ keys: aKeys, tree: a.tree, token: base.usdg, inputs: [a.notes[0]], outputs: [{ amount: 500_000000n, publicKey: aKeys.publicKey, encPublic: aKeys.encPublic }],
      swap: { legs: [{ tokenOut: stocks[0], amountIn: 200_000000n, minOut: quote * 99n / 100n, partialCommitment: partialCommitment(aKeys.publicKey, legBlinding) }], legNotes: [{ blinding: legBlinding }] } }, ART)
    rc = await transact(tx)
    a = await scan(aKeys)
    const tsla = find(a.notes, stocks[0])
    assert.equal(tsla.length, 1); assert.equal(tsla[0].amount, quote)
    assert.deepEqual(find(a.notes, base.usdg).map(n => n.amount), [500_000000n])
    console.log(`ok  private swap: 200 USDG became ${Number(quote) / 1e18} TSLA as a new note (gas ${rc.gasUsed})`)

    // 4. Basket buy: 250 USDG into basket 0 (all five, 20% each)
    const basket = await pub.readContract({ address: v.registry, abi: regAbi, functionName: 'getBasket', args: [0n] }) as { tokens: Hex[]; weights: number[] }
    const total = 250_000000n
    let used = 0n
    const legs = [], legNotes = []
    for (let i = 0; i < basket.tokens.length; i++) {
      const amountIn = i + 1 < basket.tokens.length ? total * BigInt(basket.weights[i]) / 10_000n : total - used
      used += amountIn
      const q = await pub.readContract({ address: base.swap, abi: swapAbi, functionName: 'quoteExactIn', args: [base.usdg, basket.tokens[i], amountIn] }) as bigint
      const bl = randomField()
      legs.push({ tokenOut: basket.tokens[i], amountIn, minOut: q * 99n / 100n, partialCommitment: partialCommitment(aKeys.publicKey, bl) })
      legNotes.push({ blinding: bl })
    }
    tx = await buildTransaction({ keys: aKeys, tree: a.tree, token: base.usdg, inputs: find(a.notes, base.usdg), outputs: [{ amount: 250_000000n, publicKey: aKeys.publicKey, encPublic: aKeys.encPublic }], swap: { legs, legNotes, basketId: 0n } }, ART)
    rc = await transact(tx)
    a = await scan(aKeys)
    for (const s of stocks) assert.ok(find(a.notes, s).length >= 1, 'a note for every basket stock')
    assert.equal(find(a.notes, stocks[0]).length, 2)
    assert.equal((await pub.readContract({ address: v.registry, abi: regAbi, functionName: 'getBasket', args: [0n] }) as { buyers: bigint }).buyers, 1n)
    console.log(`ok  basket buy: five new stock notes, buyer count is 1 (gas ${rc.gasUsed})`)

    // 5. Merge two TSLA notes and unshield all of it to Alice's wallet
    const two = find(a.notes, stocks[0])
    const sum = two[0].amount + two[1].amount
    const before = await bal(stocks[0], alice.account.address)
    tx = await buildTransaction({ keys: aKeys, tree: a.tree, token: stocks[0], inputs: two, outputs: [], withdraw: { recipient: alice.account.address, amount: sum } }, ART)
    await transact(tx)
    assert.equal(await bal(stocks[0], alice.account.address) - before, sum)
    console.log('ok  unshield: two TSLA notes merged and withdrawn to the wallet')

    // 6. The same proof cannot be used twice, and a proof cannot be redirected
    await assert.rejects(pub.simulateContract({ ...vault, functionName: 'transact', args: [tx.proof, tx.ext], account: relayer.account }), /NullifierSpent/)
    b = await scan(bKeys)
    const bobTx = await buildTransaction({ keys: bKeys, tree: b.tree, token: base.usdg, inputs: [b.notes[0]], outputs: [{ amount: 199_000000n, publicKey: bKeys.publicKey, encPublic: bKeys.encPublic }], withdraw: { recipient: alice.account.address, amount: 100_000000n }, relayer: relayer.account.address, fee: 1_000000n }, ART)
    await assert.rejects(pub.simulateContract({ ...vault, functionName: 'transact', args: [bobTx.proof, { ...bobTx.ext, recipient: relayer.account.address }], account: relayer.account }), /InvalidProof/)
    await assert.rejects(pub.simulateContract({ ...vault, functionName: 'transact', args: [bobTx.proof, { ...bobTx.ext, amount: 150_000000n }], account: relayer.account }), /InvalidProof/)
    console.log('ok  safety: replayed and tampered proofs are rejected')

    // The circuit itself refuses to prove a lie
    const lie = (tamper: (i: any) => void) => assert.rejects(buildTransaction({ keys: bKeys, tree: b.tree, token: base.usdg, inputs: [b.notes[0]], outputs: [{ amount: 200_000000n, publicKey: bKeys.publicKey, encPublic: bKeys.encPublic }], withdraw: { recipient: alice.account.address, amount: 100_000000n }, tamper }, ART))
    await lie(i => { i.inAmount[0] += 1n })                       // claim a bigger note than the one in the tree
    await lie(i => { i.outAmount[0] += 1n })                      // create value from nothing
    await lie(i => { i.publicToken = BigInt(stocks[0]) })         // withdraw a different token than the notes hold
    await lie(i => { i.inPrivateKey[0] = aKeys.privateKey })      // spend with someone else's key
    console.log('ok  circuit: inflated, mismatched-token and wrong-key inputs cannot be proven')

    // 7. Withdraw with a relayer fee
    const [u0, r0] = [await bal(base.usdg, alice.account.address), await bal(base.usdg, relayer.account.address)]
    await transact(bobTx)
    assert.equal(await bal(base.usdg, alice.account.address) - u0, 100_000000n)
    assert.equal(await bal(base.usdg, relayer.account.address) - r0, 1_000000n)
    b = await scan(bKeys)
    assert.deepEqual(b.notes.map(n => n.amount), [199_000000n])
    console.log('ok  relayer fee: 100 USDG withdrawn, 1 USDG paid to the relayer, 199 left shielded')

    // 8. The vault holds exactly what the unspent notes say it holds
    a = await scan(aKeys)
    const shieldedUsdg = [...a.notes, ...b.notes].filter(n => n.token === BigInt(base.usdg)).reduce((t, n) => t + n.amount, 0n)
    assert.equal(await bal(base.usdg, v.vault), shieldedUsdg)
    console.log('ok  accounting: vault USDG balance equals the sum of unspent USDG notes')
    console.log('\nALL END-TO-END CHECKS PASSED')
  } finally {
    anvil.kill()
  }
}
main().then(() => process.exit(0), e => { console.error(e); process.exit(1) })
