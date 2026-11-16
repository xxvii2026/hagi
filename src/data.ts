export type Token = { symbol: string; name: string; price: number; address?: string; logoURI?: string }

// Demo prices. `address` and `logoURI` get filled from the chain's token list
// when the app goes live. With a logoURI set, the real logo shows automatically.
export const TOKENS: Token[] = [
  { symbol: 'USDG', name: 'Global Dollar', price: 1 },
  { symbol: 'TSLA', name: 'Tesla', price: 314.93 },
  { symbol: 'NVDA', name: 'Nvidia', price: 145.1 },
  { symbol: 'AAPL', name: 'Apple', price: 241.85 },
  { symbol: 'MSFT', name: 'Microsoft', price: 428.4 },
  { symbol: 'AMZN', name: 'Amazon', price: 212.3 },
  { symbol: 'GOOG', name: 'Alphabet', price: 181.6 },
  { symbol: 'META', name: 'Meta', price: 598.2 },
  { symbol: 'AMD', name: 'AMD', price: 157.9 },
  { symbol: 'TSM', name: 'TSMC', price: 194.5 },
  { symbol: 'NFLX', name: 'Netflix', price: 912.0 },
  { symbol: 'JPM', name: 'JPMorgan', price: 248.7 },
]
export const token = (s: string) => TOKENS.find(t => t.symbol === s) ?? { symbol: s, name: s, price: 0 }

export type Basket = { id: number; name: string; creator: string; items: { symbol: string; weight: number }[]; buyers: number; created: number }
export const MAX_BASKET = 8

export const SEED_BASKETS: Basket[] = [
  { id: 1, name: 'Chip makers', creator: '0x91b2…04fa', items: [{ symbol: 'NVDA', weight: 40 }, { symbol: 'AMD', weight: 30 }, { symbol: 'TSM', weight: 30 }], buyers: 312, created: 1 },
  { id: 2, name: 'Big seven', creator: '0x3c07…a9d1', items: ['AAPL', 'MSFT', 'NVDA', 'GOOG', 'AMZN', 'META', 'TSLA'].map((s, i) => ({ symbol: s, weight: i < 2 ? 15 : 14 })), buyers: 287, created: 2 },
  { id: 3, name: 'Cloud giants', creator: '0x77c1…e210', items: [{ symbol: 'MSFT', weight: 40 }, { symbol: 'AMZN', weight: 35 }, { symbol: 'GOOG', weight: 25 }], buyers: 96, created: 3 },
  { id: 4, name: 'Screens and streams', creator: '0x08aa…1f3e', items: [{ symbol: 'NFLX', weight: 50 }, { symbol: 'AAPL', weight: 25 }, { symbol: 'GOOG', weight: 25 }], buyers: 31, created: 4 },
]

export const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
export const usd = (n: number) => '$' + fmt(n)
export const short = (a: string) => (a.length > 12 ? a.slice(0, 6) + '…' + a.slice(-4) : a)
