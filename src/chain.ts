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
  basketRegistry: '0xE35149B5A4708d59D5FcF641C1D3D16780bc2a05',
  // Not deployed yet
  pool: '',
  swapAdapter: '',
}
export const DEMO_MODE = !CONTRACTS.pool
