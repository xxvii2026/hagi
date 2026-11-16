import { defineChain } from 'viem'

// Robinhood Chain Testnet. Values from docs.robinhood.com/chain/connecting
export const robinhoodTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Explorer', url: 'https://explorer.testnet.chain.robinhood.com' } },
  testnet: true,
})

export const FAUCET_URL = 'https://faucet.testnet.chain.robinhood.com'

// Filled in once the contracts are deployed. While empty, the app runs in demo mode.
export const CONTRACTS = { pool: '', swapAdapter: '', basketRegistry: '' }
export const DEMO_MODE = !CONTRACTS.pool
