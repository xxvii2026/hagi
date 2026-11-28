import { defineChain, type Hex } from 'viem'
import LIST from './mainnet-tokens.json'

export type Config = {
  chainId: number
  name: string
  rpc: string
  explorer: string
  relayerUrl: string
  deployBlock: number // the block the vault was deployed in; note scanning starts here
  // `ghost` is the Ghost Address factory. Without it the app hides Ghost Addresses.
  contracts: { usdg: Hex; swap: Hex; basketRegistry: Hex; vault: Hex; ghost?: Hex; ghostSwap?: Hex; names?: Hex }
  tokens: Record<string, Hex>
  /** Mainnet only: real money, so the app shows the beta limits and the risk notice. */
  mainnet?: boolean
  /** Swaps go through Uniswap v3: the quoter to price them, and each stock's USDG pool fee tier. */
  uni?: { quoter: Hex; fees: Record<string, number>; pools: Record<string, Hex> }
  /** Display names for tokens that are not in the built-in list. */
  names?: Record<string, string>
  /** Where the proving files live. Mainnet has its own keys. */
  zk?: string
  /** Beta deposit limits in USDG, shown in the app. The vault enforces the real ones. */
  limits?: { perAddress: number; total: number }
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
    ghostSwap: '0xEF419424Cd5f73612FbF0212799529052813ec05',
    names: '0x3cF6213fa37D19c1Db4492B942A8B53Fc8F3e193',
  },
  tokens: {
    TSLA: '0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E',
    AMD: '0x71178BAc73cBeb415514eB542a8995b82669778d',
    AMZN: '0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02',
    NFLX: '0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93',
    PLTR: '0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0',
  },
}

// Robinhood Chain mainnet, for the beta. Core only: shield USDG, swap, send, unshield.
const ZERO = '0x0000000000000000000000000000000000000000' as Hex
const MAINNET: Config = {
  chainId: 4663,
  name: 'Robinhood Chain',
  rpc: 'https://rpc.mainnet.chain.robinhood.com',
  explorer: 'https://robin.etherscan.io',
  relayerUrl: '/api/relay?net=main',
  deployBlock: 125182688,
  mainnet: true,
  // Recorded in contracts/deployments/mainnet.json. `swap` holds the Uniswap adapter the vault trades through.
  contracts: { usdg: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', swap: '0x0196081E89D79279b0Eb2fd1f13f029f5049Fb72', basketRegistry: ZERO, vault: '0x4450EFCd81DC7d3DfE54f27b351E1FF498437787' },
  uni: { quoter: '0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7', fees: Object.fromEntries(LIST.map(t => [t.symbol, t.fee])), pools: Object.fromEntries(LIST.map(t => [t.symbol, t.pool as Hex])) },
  limits: { perAddress: 100, total: 10_000 },
  // Every stock token with a deep enough Uniswap pool against USDG. The list is built by contracts/script/discover.mjs.
  tokens: Object.fromEntries(LIST.map(t => [t.symbol, t.address as Hex])),
  names: Object.fromEntries(LIST.map(t => [t.symbol, t.name])),
  zk: 'zk/main/',
}

// The beta lives on its own address (beta.hagitrade.xyz). Everything else stays on testnet.
// `localStorage['hagi-net'] = 'main'` turns it on anywhere, for previews.
const wantsMainnet = (() => { try { return location.hostname.startsWith('beta.') || localStorage.getItem('hagi-net') === 'main' } catch { return false } })()
const BASE = wantsMainnet ? MAINNET : TESTNET
export const IS_MAINNET = !!BASE.mainnet
/** False while the mainnet contracts are not deployed yet. */
export const LIVE = BASE.contracts.vault !== ZERO

// A build can point the app at another chain (used by the local end-to-end test).
const override = import.meta.env.VITE_HAGI_CONFIG as string | undefined
export const CFG: Config = override ? { ...TESTNET, ...JSON.parse(override) } : BASE

export const chain = defineChain({
  id: CFG.chainId,
  name: CFG.name,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [CFG.rpc] } },
  blockExplorers: { default: { name: 'Explorer', url: CFG.explorer } },
  testnet: !CFG.mainnet,
})

export const FAUCET_URL = 'https://faucet.testnet.chain.robinhood.com'
