import { defineChain, type Hex } from 'viem'

export type Config = {
  chainId: number
  name: string
  rpc: string
  explorer: string
  relayerUrl: string
  deployBlock: number // the block the vault was deployed in; note scanning starts here
  // `ghost` is the Ghost Address factory. Without it the app hides Ghost Addresses.
  contracts: { usdg: Hex; swap: Hex; basketRegistry: Hex; vault: Hex; ghost?: Hex }
  tokens: Record<string, Hex>
}

// Robinhood Chain Testnet. Addresses are recorded in contracts/deployments/testnet.json
const TESTNET: Config = {
  chainId: 46630,
  name: 'Robinhood Chain Testnet',
  rpc: 'https://rpc.testnet.chain.robinhood.com',
  explorer: 'https://explorer.testnet.chain.robinhood.com',
  relayerUrl: '/api/relay',
  deployBlock: 154069900,
  contracts: {
    usdg: '0x48fdc557DE6Fe7efD3341e6c28A626Be021d117a',
    swap: '0xA81738A148743645EB46Ff579CE6E81c63896BE6',
    basketRegistry: '0x66D458817B7bCA5655ffB32d5d51770F2C964738',
    vault: '0x0C3C8c6929851818d6a15A4c57D68F9342B81798',
    ghost: '0x722445E4a5582FF615aE7f72fc928f62C87d75EF',
  },
  tokens: {
    TSLA: '0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E',
    AMD: '0x71178BAc73cBeb415514eB542a8995b82669778d',
    AMZN: '0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02',
    NFLX: '0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93',
    PLTR: '0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0',
  },
}

// A build can point the app at another chain (used by the local end-to-end test).
const override = import.meta.env.VITE_HAGI_CONFIG as string | undefined
export const CFG: Config = override ? { ...TESTNET, ...JSON.parse(override) } : TESTNET

export const chain = defineChain({
  id: CFG.chainId,
  name: CFG.name,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [CFG.rpc] } },
  blockExplorers: { default: { name: 'Explorer', url: CFG.explorer } },
  testnet: true,
})

export const FAUCET_URL = 'https://faucet.testnet.chain.robinhood.com'
