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
export const CONTRACTS = {
  // Live on Robinhood Chain Testnet since 2026-11-16. See contracts/deployments/testnet.json
  usdg: '0x48fdc557DE6Fe7efD3341e6c28A626Be021d117a',
  swap: '0xA81738A148743645EB46Ff579CE6E81c63896BE6',
  basketRegistry: '0x66D458817B7bCA5655ffB32d5d51770F2C964738',
  vault: '0x0C3C8c6929851818d6a15A4c57D68F9342B81798',
  swapAdapter: '0x1eA488F23337D63EFF469Ea6230eEA4d39Dbb1a6',
}
// The app still runs on simulated data until it is connected to the vault.
export const APP_CONNECTED = false
export const DEMO_MODE = !APP_CONNECTED
