import { keccak256, toHex } from 'viem'
import { robinhoodTestnet } from './chain'

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
const eth = (): Eth | undefined => (window as unknown as { ethereum?: Eth }).ethereum
export const hasWallet = () => !!eth()

const CHAIN_HEX = '0x' + robinhoodTestnet.id.toString(16)

/** Connects the browser wallet and moves it to Robinhood Chain Testnet. Without a wallet, returns a demo address. */
export async function connectWallet(): Promise<string> {
  const e = eth()
  if (!e) return '0x7a3f' + Math.random().toString(16).slice(2, 10).padEnd(8, '0') + '0000000000000000000000c21e'
  const [account] = (await e.request({ method: 'eth_requestAccounts' })) as string[]
  try {
    await e.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] })
  } catch {
    await e.request({
      method: 'wallet_addEthereumChain',
      params: [{ chainId: CHAIN_HEX, chainName: robinhoodTestnet.name, nativeCurrency: robinhoodTestnet.nativeCurrency, rpcUrls: robinhoodTestnet.rpcUrls.default.http, blockExplorerUrls: [robinhoodTestnet.blockExplorers.default.url] }],
    })
  }
  return account
}

const MESSAGE = 'Create my Hagi account.\n\nSigning this message is free and does not move any funds. The same wallet always recovers the same Hagi account.'

/**
 * Derives the Hagi account from one wallet signature, so the same wallet always gets the same account.
 * Demo derivation only: the real spending and viewing keys are derived from this signature when the circuits land.
 */
export async function createHagiAccount(wallet: string): Promise<string> {
  const e = eth()
  const seed = e ? ((await e.request({ method: 'personal_sign', params: [toHex(MESSAGE), wallet] })) as `0x${string}`) : toHex('demo:' + wallet)
  return 'hagi1' + keccak256(seed).slice(2, 42)
}
