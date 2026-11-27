// End-to-end test of the vault on a local chain, using the same code the browser uses.
// Run from the repo root:  npx tsx contracts/e2e/e2e.ts
import { execSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { createPublicClient, createWalletClient, encodeAbiParameters, http, keccak256, parseAbiItem, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { MerkleTree, commitment, decryptNote, deriveKeys, encryptNote, ghostAddress, ghostBlinding, ghostPartial, matchGhost, nullifier, parseAddress, partialCommitment, randomField, toAddress, type Keys, type Note } from '../../src/zk/core'
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
    async function scan(keys: Keys, ghosts: { blinding: bigint; partial: bigint }[] = []) {
      const logs = await pub.getLogs({ address: v.vault, event: NEW_COMMITMENT, fromBlock: 0n })
      const tree = new MerkleTree()
      const notes: Note[] = []
      for (const l of logs.sort((a, b) => Number(a.args.index! - b.args.index!))) {
        assert.equal(Number(l.args.index), tree.size)
        tree.insert(l.args.commitment!)
        let d = decryptNote(l.args.encryptedNote!, keys)
        if (!d || commitment({ ...d, amount: l.args.amount! > 0n ? l.args.amount! : d.amount, publicKey: keys.publicKey }) !== l.args.commitment) {
          // A claim from a Ghost Address is recognised from the public token and amount, even without a usable encrypted note.
          const g = matchGhost(l.args.commitment!, BigInt(l.args.token!), l.args.amount!, ghosts)
          d = g == null ? null : { amount: l.args.amount!, token: BigInt(l.args.token!), blinding: g }
        }
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

    // 9. Ghost Addresses: a plain 0x address, funded from anywhere, that only claims into Alice's note
    const gd = forge('DeployGhost.s.sol:DeployGhost', { HAGI_VAULT: v.vault, HAGI_GHOST_FEE_TO: relayer.account.address })
    const ghostAbi = abi('HagiGhost')
    const factory = { address: gd.ghost, abi: ghostAbi } as const
    const codeHash = await pub.readContract({ ...factory, functionName: 'walletCodeHash' }) as Hex
    const ghosts = [0, 1].map(i => ({ blinding: ghostBlinding(aKeys, i), partial: ghostPartial(aKeys, i) }))
    const gAddr = ghostAddress(gd.ghost, codeHash, ghosts[0].partial)
    assert.equal(gAddr, await pub.readContract({ ...factory, functionName: 'ghostAddress', args: [ghosts[0].partial] }))
    assert.notEqual(gAddr, ghostAddress(gd.ghost, codeHash, ghosts[1].partial))
    assert.equal(await pub.getCode({ address: gAddr }) ?? '0x', '0x', 'nothing is deployed before the first claim')
    // "An exchange" pays the Ghost Address. Here it is Alice's wallet, but it could be anyone.
    await send(alice, { address: base.usdg, abi: erc20, functionName: 'transfer', args: [gAddr, 400_000000n] })
    assert.equal(await bal(base.usdg, gAddr), 400_000000n)
    const net = await pub.readContract({ ...factory, functionName: 'netOf', args: [400_000000n] }) as bigint
    assert.equal(net, 398_000000n)
    const r1 = await bal(base.usdg, relayer.account.address)
    rc = await send(relayer, { ...factory, functionName: 'claim', args: [ghosts[0].partial, base.usdg, 400_000000n, encryptNote({ amount: net, token: BigInt(base.usdg), blinding: ghosts[0].blinding }, aKeys.encPublic)] })
    assert.equal(await bal(base.usdg, gAddr), 0n)
    assert.equal(await bal(base.usdg, relayer.account.address) - r1, 2_000000n, '0.5% fee to the fee recipient')
    a = await scan(aKeys)
    assert.ok(find(a.notes, base.usdg).some(n => n.amount === net), 'the claimed note is found by decryption')
    console.log(`ok  ghost claim: 400 USDG sent to ${gAddr.slice(0, 10)}… became a 398 USDG private note (gas ${rc.gasUsed})`)

    // A stranger claims a second deposit with a junk note: it still lands with Alice, found from the public amount
    await send(alice, { address: stocks[1], abi: erc20, functionName: 'transfer', args: [gAddr, 3n * 10n ** 18n] })
    const stranger = wallet(K0)
    await send(stranger, { ...factory, functionName: 'claim', args: [ghosts[0].partial, stocks[1], 3n * 10n ** 18n, '0x1234'] })
    const amdNet = 3n * 10n ** 18n - 3n * 10n ** 18n * 50n / 10_000n
    assert.ok(!find((await scan(aKeys)).notes, stocks[1]).some(n => n.amount === amdNet), 'without Ghost matching the junk note is invisible')
    a = await scan(aKeys, ghosts)
    const amdNote = find(a.notes, stocks[1]).find(n => n.amount === amdNet)
    assert.ok(amdNote, 'Ghost matching finds the note anyway')
    console.log('ok  ghost safety: a third-party claim with a bad note still lands in Alice\'s balance and is found')

    // The ghost note spends like any other: unshield it to a fresh wallet with a proof
    const fresh = privateKeyToAccount(K2).address
    const f0 = await bal(stocks[1], fresh)
    tx = await buildTransaction({ keys: aKeys, tree: a.tree, token: stocks[1], inputs: [amdNote!], outputs: [], withdraw: { recipient: fresh, amount: amdNote!.amount } }, ART)
    await transact(tx)
    assert.equal(await bal(stocks[1], fresh) - f0, amdNote!.amount)
    await assert.rejects(pub.simulateContract({ ...factory, functionName: 'claim', args: [ghosts[0].partial, base.usdg, 1n, '0x'], account: relayer.account }))
    console.log('ok  ghost spend: the claimed note was spent with a proof; an empty Ghost Address cannot be claimed')

    // 10. Ghost Swaps: USDG sent to an AMZN Ghost Swap address arrives as an AMZN note
    const gsd = forge('DeployGhostSwap.s.sol:DeployGhostSwap', { HAGI_VAULT: v.vault, HAGI_SWAP: base.swap, HAGI_RELAYER: relayer.account.address })
    const gsw = { address: gsd.ghostswap, abi: abi('HagiGhostSwap') } as const
    const amzn = stocks[2]
    const gsHash = await pub.readContract({ ...gsw, functionName: 'walletCodeHash' }) as Hex
    const salt = BigInt(keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'address' }], [ghosts[0].partial, amzn])))
    const gsAddr = ghostAddress(gsd.ghostswap, gsHash, salt)
    assert.equal(gsAddr, await pub.readContract({ ...gsw, functionName: 'ghostAddress', args: [ghosts[0].partial, amzn] }))
    await send(alice, { address: base.usdg, abi: erc20, functionName: 'transfer', args: [gsAddr, 300_000000n] })
    const gNet = await pub.readContract({ ...gsw, functionName: 'netOf', args: [300_000000n] }) as bigint
    const gq = await pub.readContract({ address: base.swap, abi: swapAbi, functionName: 'quoteExactIn', args: [base.usdg, amzn, gNet] }) as bigint
    await assert.rejects(pub.simulateContract({ ...gsw, functionName: 'claimSwap', args: [ghosts[0].partial, amzn, base.usdg, 300_000000n, 0n, '0x'], account: alice.account }), /NotClaimer/)
    rc = await send(relayer, { ...gsw, functionName: 'claimSwap', args: [ghosts[0].partial, amzn, base.usdg, 300_000000n, gq * 98n / 100n, '0x'] })
    a = await scan(aKeys, ghosts)
    assert.ok(find(a.notes, amzn).some(n => n.amount === gq), 'the AMZN note is found from the Ghost Address it came through')
    console.log(`ok  ghost swap: 300 USDG sent to an AMZN Ghost Swap address became ${Number(gq) / 1e18} AMZN in Alice's balance (gas ${rc.gasUsed})`)

    // 8. The vault holds exactly what the unspent notes say it holds
    a = await scan(aKeys, ghosts)
    const shieldedUsdg = [...a.notes, ...b.notes].filter(n => n.token === BigInt(base.usdg)).reduce((t, n) => t + n.amount, 0n)
    assert.equal(await bal(base.usdg, v.vault), shieldedUsdg)
    console.log('ok  accounting: vault USDG balance equals the sum of unspent USDG notes')
    console.log('\nALL END-TO-END CHECKS PASSED')
  } finally {
    anvil.kill()
  }
}
main().then(() => process.exit(0), e => { console.error(e); process.exit(1) })
