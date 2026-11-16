import { formatUnits, type Hex } from 'viem'
import { CFG } from './chain'

export type Token = { symbol: string; name: string; decimals: number; address: Hex; price: number; logoURI?: string }

// `price` is refreshed from the pools on chain. With a logoURI set, the real logo shows automatically.
export const TOKENS: Token[] = [
  { symbol: 'USDG', name: 'Test USDG', decimals: 6, address: CFG.contracts.usdg, price: 1 },
  { symbol: 'TSLA', name: 'Tesla', decimals: 18, address: CFG.tokens.TSLA, price: 0 },
  { symbol: 'AMD', name: 'AMD', decimals: 18, address: CFG.tokens.AMD, price: 0 },
  { symbol: 'AMZN', name: 'Amazon', decimals: 18, address: CFG.tokens.AMZN, price: 0 },
  { symbol: 'NFLX', name: 'Netflix', decimals: 18, address: CFG.tokens.NFLX, price: 0 },
  { symbol: 'PLTR', name: 'Palantir', decimals: 18, address: CFG.tokens.PLTR, price: 0 },
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
