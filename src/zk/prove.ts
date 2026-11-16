// Builds a vault transaction: picks the circuit inputs, generates the proof and
// returns the two structs HagiVault.transact expects.
import * as snarkjs from 'snarkjs'
import { toHex, type Hex } from 'viem'
import { FIELD, LEVELS, MerkleTree, commitment, encryptNote, hashExtData, nullifier, randomField, type ExtData, type Keys, type Note, type SwapLeg } from './core'

export type ProofStruct = {
  a: readonly [bigint, bigint]; b: readonly [readonly [bigint, bigint], readonly [bigint, bigint]]; c: readonly [bigint, bigint]
  root: bigint; nullifiers: readonly [bigint, bigint]; commitments: readonly [bigint, bigint]
}
export type Artifacts = { wasm: string | Uint8Array; zkey: string | Uint8Array }
export type Output = { amount: bigint; publicKey: bigint; encPublic: Uint8Array }

export type TxRequest = {
  keys: Keys
  tree: MerkleTree
  token: Hex                      // the token of every note in this transaction
  inputs: Note[]                  // one or two of your notes, each with its leaf index
  outputs: Output[]               // up to two new notes; change back to yourself goes here
  withdraw?: { recipient: Hex; amount: bigint }
  swap?: { legs: Omit<SwapLeg, 'encryptedNote'>[]; legNotes: { blinding: bigint }[]; basketId?: bigint }
  relayer?: Hex
  fee?: bigint
  /** Tests only: change the circuit inputs before proving, to check that the circuit rejects them. */
  tamper?: (input: Record<string, unknown>) => void
}

const ZERO = '0x0000000000000000000000000000000000000000' as Hex

export async function buildTransaction(req: TxRequest, art: Artifacts): Promise<{ proof: ProofStruct; ext: ExtData; outNotes: Note[] }> {
  const { keys, tree } = req
  const token = BigInt(req.token)
  if (req.inputs.length < 1 || req.inputs.length > 2 || req.outputs.length > 2) throw new Error('A transaction takes 1 or 2 inputs and up to 2 outputs')
  if (req.withdraw && req.swap) throw new Error('Withdraw or swap, not both')

  // Pad to two inputs and two outputs with zero-value notes.
  const inputs = [...req.inputs]
  while (inputs.length < 2) inputs.push({ amount: 0n, token, blinding: randomField(), publicKey: keys.publicKey, index: 0 })
  const outNotes: Note[] = req.outputs.map(o => ({ amount: o.amount, token, blinding: randomField(), publicKey: o.publicKey }))
  const outKeys = req.outputs.map(o => o.encPublic)
  while (outNotes.length < 2) { outNotes.push({ amount: 0n, token, blinding: randomField(), publicKey: keys.publicKey }); outKeys.push(keys.encPublic) }

  const fee = req.fee ?? 0n
  const swapTotal = req.swap?.legs.reduce((t, l) => t + l.amountIn, 0n) ?? 0n
  const amount = req.withdraw?.amount ?? swapTotal
  const leaving = amount + fee
  const sumIn = inputs.reduce((t, n) => t + n.amount, 0n)
  const sumOut = outNotes.reduce((t, n) => t + n.amount, 0n)
  if (sumIn !== sumOut + leaving) throw new Error('Inputs must equal outputs plus what leaves the vault')

  const ext: ExtData = {
    recipient: req.withdraw?.recipient ?? ZERO,
    token: leaving > 0n ? req.token : ZERO,
    amount,
    relayer: req.relayer ?? ZERO,
    fee,
    encryptedOutput1: encryptNote(outNotes[0], outKeys[0]),
    encryptedOutput2: encryptNote(outNotes[1], outKeys[1]),
    // A swap output's amount is only known on chain, so its note is encrypted with amount 0 and read back from the event.
    legs: (req.swap?.legs ?? []).map((l, i) => ({ ...l, encryptedNote: encryptNote({ amount: 0n, token: BigInt(l.tokenOut), blinding: req.swap!.legNotes[i].blinding }, keys.encPublic) })),
    basketId: req.swap?.basketId ?? 2n ** 256n - 1n,
  }

  const input = {
    root: tree.root,
    publicAmount: leaving === 0n ? 0n : FIELD - leaving,
    publicToken: leaving === 0n ? 0n : token,
    extDataHash: hashExtData(ext),
    inputNullifier: inputs.map(n => nullifier(n, keys.privateKey)),
    outputCommitment: outNotes.map(commitment),
    token,
    inAmount: inputs.map(n => n.amount),
    inPrivateKey: inputs.map(() => keys.privateKey),
    inBlinding: inputs.map(n => n.blinding),
    inPathIndices: inputs.map(n => BigInt(n.index ?? 0)),
    inPathElements: inputs.map(n => (n.amount > 0n ? tree.path(n.index!) : Array<bigint>(LEVELS).fill(0n))),
    outAmount: outNotes.map(n => n.amount),
    outPubkey: outNotes.map(n => n.publicKey),
    outBlinding: outNotes.map(n => n.blinding),
  }

  req.tamper?.(input)
  const { proof } = await snarkjs.groth16.fullProve(input as never, art.wasm as never, art.zkey as never)
  const g = (x: string) => BigInt(x)
  return {
    proof: {
      a: [g(proof.pi_a[0]), g(proof.pi_a[1])],
      b: [[g(proof.pi_b[0][1]), g(proof.pi_b[0][0])], [g(proof.pi_b[1][1]), g(proof.pi_b[1][0])]],
      c: [g(proof.pi_c[0]), g(proof.pi_c[1])],
      root: input.root,
      nullifiers: [input.inputNullifier[0], input.inputNullifier[1]],
      commitments: [input.outputCommitment[0], input.outputCommitment[1]],
    },
    ext,
    outNotes,
  }
}

export const hexField = (n: bigint) => toHex(n, { size: 32 })
