import { formatUnits, type Hex } from 'viem'
import { CFG } from './chain'

/** `logoFill` is for round coin images that should fill the frame. Other logos sit inside it with room to spare.
 *  `logoDark` gives a dark disc to marks that are drawn in white and would vanish on a white one. */
export type Token = { symbol: string; name: string; decimals: number; address: Hex; price: number; logoURI?: string; logoFill?: boolean; logoDark?: boolean }

// `price` is refreshed from the pools on chain. With a logoURI set, the real logo shows automatically.
// Stock logos load at runtime from an open-source icon set served by jsDelivr. Nothing is copied into this repo.
// If a logo fails to load, the app falls back to the ticker badge.
const logo = (ticker: string) => `https://cdn.jsdelivr.net/gh/nvstly/icons@main/ticker_icons/${ticker}.png`

const USDG_LOGO = 'https://coin-images.coingecko.com/coins/images/51281/large/GDN_USDG_Token_200x200.png'
const DARK = new Set(['AMZN', 'PLTR']) // marks drawn in white
const NAMES: Record<string, string> = { TSLA: 'Tesla', AMD: 'AMD', AMZN: 'Amazon', NFLX: 'Netflix', PLTR: 'Palantir' }
const ORDER = ['TSLA', 'AMD', 'AMZN', 'NFLX', 'PLTR']
// Robinhood's names end in "Stock Token" or similar. The app shows just the company.
const tidy = (n: string) => n.split('•')[0].replace(/,?\s+(PBC|Inc\.?|Corp(oration)?\.?|Ltd\.?|plc|N\.V\.)(?=\s|$)/gi, '').replace(/\s+Class [A-Z]\b.*$/i, '').replace(/\s+Common Stock$/i, '').replace(/^Space Exploration Technologies$/, 'SpaceX').trim()

export const TOKENS: Token[] = [
  // On testnet Hagi's test dollar stands in for USDG (Global Dollar), so it wears that logo.
  { symbol: 'USDG', name: CFG.mainnet ? 'USDG' : 'Test USDG', decimals: 6, address: CFG.contracts.usdg, price: 1, logoURI: USDG_LOGO, logoFill: true },
  ...Object.keys(CFG.tokens).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99)).map(s => ({
    symbol: s, name: NAMES[s] ?? (CFG.names?.[s] ? tidy(CFG.names[s]) || s : s), decimals: 18, address: CFG.tokens[s], price: 0, logoURI: logo(s), ...(DARK.has(s) ? { logoDark: true } : {}),
  })),
]
export const STOCKS = TOKENS.filter(t => t.symbol !== 'USDG')
export const token = (s: string): Token => TOKENS.find(t => t.symbol === s) ?? { symbol: s, name: s, decimals: 18, address: '0x0000000000000000000000000000000000000000', price: 0 }
export const tokenByAddress = (a: string | bigint) => { const x = BigInt(a); return TOKENS.find(t => BigInt(t.address) === x) }

/** Whole units as shown in the app -> smallest units on chain. Inputs carry at most 6 decimals. */
export const toUnits = (n: number, decimals: number) => BigInt(Math.round(n * 1e6)) * 10n ** BigInt(decimals - 6)
export const fromUnits = (b: bigint, decimals: number) => Number(formatUnits(b, decimals))

export type Basket = { id: number; name: string; creator: string; items: { symbol: string; weight: number; bps: number }[]; buyers: number; created: number }
export const MAX_BASKET = 8

export const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
/** Adds thousands separators to a typed amount without changing what was typed. */
export const withCommas = (v: string) => { const [i, f] = v.split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f !== undefined ? '.' + f : '') }
/** A balance as an input value: at most 6 decimals, rounded down so it never exceeds the balance. */
export const asInput = (n: number) => String(Math.floor(n * 1e6) / 1e6)
export const usd = (n: number) => '$' + fmt(n)
export const short = (a: string) => (a.length > 12 ? a.slice(0, 6) + '…' + a.slice(-4) : a)
