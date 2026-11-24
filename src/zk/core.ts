// Hagi vault cryptography. Everything here must match circuits/transaction.circom
// and contracts/src/HagiVault.sol exactly.
import { poseidon1, poseidon2, poseidon3 } from 'poseidon-lite'
import nacl from 'tweetnacl'
import { bytesToHex, concat, encodeAbiParameters, getAddress, hexToBytes, keccak256, pad, toBytes, toHex, type Hex } from 'viem'

export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n
export const LEVELS = 20
export const NO_BASKET = 2n ** 256n - 1n
export const ZERO_LEAF = BigInt(keccak256(toBytes('hagi.vault.empty'))) % FIELD

/** The message a wallet signs to derive its Hagi account. Changing it changes every account. */
export const SIGN_MESSAGE = 'Create my Hagi account.\n\nSigning this message is free and does not move any funds. The same wallet always recovers the same Hagi account.\n\nOnly sign this on the Hagi site.'

export const randomField = () => BigInt(bytesToHex(crypto.getRandomValues(new Uint8Array(31))))
const b32 = (n: bigint) => pad(toHex(n), { size: 32 })

// ---------- keys and addresses ----------

export type Keys = { privateKey: bigint; publicKey: bigint; encSecret: Uint8Array; encPublic: Uint8Array }

/** Derives the vault keys from one wallet signature, so the same wallet always recovers the same account. */
export function deriveKeys(signature: Hex): Keys {
  const privateKey = BigInt(keccak256(concat([signature, toHex('hagi.spend')]))) % FIELD
  const enc = nacl.box.keyPair.fromSecretKey(hexToBytes(keccak256(concat([signature, toHex('hagi.view')]))))
  return { privateKey, publicKey: poseidon1([privateKey]), encSecret: enc.secretKey, encPublic: enc.publicKey }
}

/** hagi1 + spending public key (32 bytes) + encryption public key (32 bytes), in hex. */
export const toAddress = (k: Pick<Keys, 'publicKey' | 'encPublic'>) => 'hagi1' + b32(k.publicKey).slice(2) + bytesToHex(k.encPublic).slice(2)
export function parseAddress(addr: string): { publicKey: bigint; encPublic: Uint8Array } | null {
  const m = /^hagi1([0-9a-f]{64})([0-9a-f]{64})$/.exec(addr.trim().toLowerCase())
  if (!m) return null
  const publicKey = BigInt('0x' + m[1])
  return publicKey < FIELD ? { publicKey, encPublic: hexToBytes(('0x' + m[2]) as Hex) } : null
}

// ---------- notes ----------

export type Note = { amount: bigint; token: bigint; blinding: bigint; publicKey: bigint; index?: number }

export const tokenField = (address: string) => BigInt(address)
export const partialCommitment = (publicKey: bigint, blinding: bigint) => poseidon2([publicKey, blinding])
export const commitment = (n: Note) => poseidon3([n.amount, n.token, partialCommitment(n.publicKey, n.blinding)])
export function nullifier(n: Note, privateKey: bigint) {
  const c = commitment(n)
  const index = BigInt(n.index ?? 0)
  return poseidon3([c, index, poseidon3([privateKey, c, index])])
}

// ---------- Ghost Addresses ----------
// A Ghost Address is a plain 0x address that only one Hagi account can claim from. It is the CREATE2
// address of a tiny wallet contract, salted with a partial commitment Poseidon(publicKey, blinding).
// The blinding comes from the spending key and an index, so any device with the account can find
// every Ghost Address it ever made, and the funds claimed from one land in a note only this key can spend.

const GHOST_TAG = BigInt(keccak256(toBytes('hagi.ghost'))) % FIELD

export const ghostBlinding = (k: Pick<Keys, 'privateKey'>, i: number) => poseidon3([k.privateKey, GHOST_TAG, BigInt(i)])
export const ghostPartial = (k: Pick<Keys, 'privateKey' | 'publicKey'>, i: number) => partialCommitment(k.publicKey, ghostBlinding(k, i))

/** The 0x address for a partial commitment, exactly as HagiGhost.ghostAddress computes it. */
export const ghostAddress = (factory: Hex, walletCodeHash: Hex, partial: bigint): Hex =>
  getAddress(('0x' + keccak256(concat(['0xff', factory, b32(partial), walletCodeHash])).slice(26)) as Hex)

/** Recognises a note claimed from one of this account's Ghost Addresses, even when its encrypted copy is missing or bad.
 *  Claims always publish the token and amount, so the commitment can be rebuilt from the known blindings. */
export function matchGhost(c: bigint, token: bigint, amount: bigint, ghosts: { blinding: bigint; partial: bigint }[]): bigint | null {
  if (amount === 0n || token === 0n) return null
  for (const g of ghosts) if (poseidon3([amount, token, g.partial]) === c) return g.blinding
  return null
}

// ---------- note encryption ----------
// Layout: ephemeral public key (32) | nonce (24) | box(amount (32) | token (20) | blinding (32))

export function encryptNote(n: Pick<Note, 'amount' | 'token' | 'blinding'>, to: Uint8Array): Hex {
  const eph = nacl.box.keyPair()
  const nonce = crypto.getRandomValues(new Uint8Array(24))
  const plain = hexToBytes(concat([b32(n.amount), pad(toHex(n.token), { size: 20 }), b32(n.blinding)]))
  return bytesToHex(new Uint8Array([...eph.publicKey, ...nonce, ...nacl.box(plain, nonce, to, eph.secretKey)]))
}

export function decryptNote(data: Hex, keys: Keys): Pick<Note, 'amount' | 'token' | 'blinding'> | null {
  const raw = hexToBytes(data)
  if (raw.length !== 32 + 24 + 84 + 16) return null
  const plain = nacl.box.open(raw.slice(56), raw.slice(32, 56), raw.slice(0, 32), keys.encSecret)
  if (!plain) return null
  const h = bytesToHex(plain).slice(2)
  return { amount: BigInt('0x' + h.slice(0, 64)), token: BigInt('0x' + h.slice(64, 104)), blinding: BigInt('0x' + h.slice(104, 168)) }
}

// ---------- Merkle tree ----------

export class MerkleTree {
  zeros: bigint[] = []
  layers: bigint[][] = []
  constructor(leaves: bigint[] = []) {
    let z = ZERO_LEAF
    for (let i = 0; i < LEVELS; i++) { this.zeros.push(z); z = poseidon2([z, z]) }
    this.zeros.push(z)
    this.layers = Array.from({ length: LEVELS + 1 }, () => [])
    for (const l of leaves) this.insert(l)
  }
  get size() { return this.layers[0].length }
  get root() { return this.layers[LEVELS][0] ?? this.zeros[LEVELS] }
  insert(leaf: bigint) {
    let index = this.layers[0].length
    this.layers[0].push(leaf)
    for (let level = 0; level < LEVELS; level++) {
      const left = index % 2 === 0 ? this.layers[level][index] : this.layers[level][index - 1]
      const right = index % 2 === 0 ? this.layers[level][index + 1] ?? this.zeros[level] : this.layers[level][index]
      index = Math.floor(index / 2)
      this.layers[level + 1][index] = poseidon2([left, right])
    }
  }
  path(index: number): bigint[] {
    const out: bigint[] = []
    for (let level = 0; level < LEVELS; level++) {
      out.push(this.layers[level][index ^ 1] ?? this.zeros[level])
      index = Math.floor(index / 2)
    }
    return out
  }
}

// ---------- external data ----------

export type SwapLeg = { tokenOut: Hex; amountIn: bigint; minOut: bigint; partialCommitment: bigint; encryptedNote: Hex }
export type ExtData = {
  recipient: Hex; token: Hex; amount: bigint; relayer: Hex; fee: bigint
  encryptedOutput1: Hex; encryptedOutput2: Hex; legs: SwapLeg[]; basketId: bigint
}

export const EXT_DATA_ABI = [{
  type: 'tuple', name: 'ext', components: [
    { name: 'recipient', type: 'address' }, { name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' },
    { name: 'relayer', type: 'address' }, { name: 'fee', type: 'uint256' },
    { name: 'encryptedOutput1', type: 'bytes' }, { name: 'encryptedOutput2', type: 'bytes' },
    { name: 'legs', type: 'tuple[]', components: [
      { name: 'tokenOut', type: 'address' }, { name: 'amountIn', type: 'uint256' }, { name: 'minOut', type: 'uint256' },
      { name: 'partialCommitment', type: 'uint256' }, { name: 'encryptedNote', type: 'bytes' },
    ] },
    { name: 'basketId', type: 'uint256' },
  ],
}] as const

export const hashExtData = (ext: ExtData) => BigInt(keccak256(encodeAbiParameters(EXT_DATA_ABI, [ext]))) % FIELD
