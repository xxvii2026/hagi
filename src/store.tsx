import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'
import { SEED_BASKETS, token, type Basket } from './data'

export type Activity = { id: number; kind: 'shield' | 'unshield' | 'swap' | 'send' | 'basket' | 'receive'; title: string; detail: string; time: number; isPrivate?: boolean }
export type State = {
  wallet: string | null          // connected wallet address
  hagiAddress: string | null     // set once the user has created their Hagi account
  walletBal: Record<string, number>
  shielded: Record<string, number>
  activity: Activity[]
  baskets: Basket[]
  hidden: boolean
}
const initial: State = { wallet: null, hagiAddress: null, walletBal: {}, shielded: {}, activity: [], baskets: SEED_BASKETS, hidden: false }

type Action =
  | { type: 'connect'; wallet: string } | { type: 'disconnect' }
  | { type: 'createAccount'; hagiAddress: string }
  | { type: 'faucet' } | { type: 'toggleHidden' }
  | { type: 'shield' | 'unshield'; symbol: string; amount: number }
  | { type: 'swap'; from: string; to: string; amount: number }
  | { type: 'send'; symbol: string; amount: number; to: string }
  | { type: 'buyBasket'; id: number; amount: number }
  | { type: 'createBasket'; name: string; items: { symbol: string; weight: number }[] }

const add = (m: Record<string, number>, s: string, d: number) => {
  const v = Math.max(0, (m[s] ?? 0) + d)
  const out = { ...m, [s]: v }
  if (v < 1e-9) delete out[s]
  return out
}
const log = (s: State, a: Omit<Activity, 'id' | 'time'>): Activity[] => [{ ...a, id: Date.now(), time: Date.now() }, ...s.activity]
const n = (x: number, d = 2) => x.toLocaleString('en-US', { maximumFractionDigits: d })

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'connect': return { ...s, wallet: a.wallet }
    case 'disconnect': return { ...initial, baskets: s.baskets }
    case 'createAccount': return { ...s, hagiAddress: a.hagiAddress }
    case 'faucet': return { ...s, walletBal: add(s.walletBal, 'USDG', 5000) }
    case 'toggleHidden': return { ...s, hidden: !s.hidden }
    case 'shield': return { ...s, walletBal: add(s.walletBal, a.symbol, -a.amount), shielded: add(s.shielded, a.symbol, a.amount), activity: log(s, { kind: 'shield', title: `Shielded ${a.symbol}`, detail: `${n(a.amount)} ${a.symbol}` }) }
    case 'unshield': return { ...s, walletBal: add(s.walletBal, a.symbol, a.amount), shielded: add(s.shielded, a.symbol, -a.amount), activity: log(s, { kind: 'unshield', title: `Unshielded ${a.symbol}`, detail: `${n(a.amount)} ${a.symbol}` }) }
    case 'swap': {
      const out = (a.amount * token(a.from).price) / token(a.to).price
      return { ...s, shielded: add(add(s.shielded, a.from, -a.amount), a.to, out), activity: log(s, { kind: 'swap', title: `Swapped ${a.from} for ${a.to}`, detail: `${n(out, 4)} ${a.to}` }) }
    }
    case 'send': return { ...s, shielded: add(s.shielded, a.symbol, -a.amount), activity: log(s, { kind: 'send', title: `Sent ${a.symbol}`, detail: `${n(a.amount, 4)} ${a.symbol}`, isPrivate: true }) }
    case 'buyBasket': {
      const b = s.baskets.find(x => x.id === a.id)!
      let sh = add(s.shielded, 'USDG', -a.amount)
      for (const it of b.items) sh = add(sh, it.symbol, (a.amount * it.weight) / 100 / token(it.symbol).price)
      return { ...s, shielded: sh, baskets: s.baskets.map(x => (x.id === a.id ? { ...x, buyers: x.buyers + 1 } : x)), activity: log(s, { kind: 'basket', title: `Bought basket: ${b.name}`, detail: `${n(a.amount)} USDG` }) }
    }
    case 'createBasket': {
      const b: Basket = { id: Date.now(), name: a.name, creator: s.wallet ? s.wallet.slice(0, 6) + '…' + s.wallet.slice(-4) : 'you', items: a.items, buyers: 0, created: Date.now() }
      return { ...s, baskets: [...s.baskets, b] }
    }
  }
}

const Ctx = createContext<{ s: State; d: (a: Action) => void }>({ s: initial, d: () => {} })
const KEY = 'hagi-demo-v1'
export function Store({ children }: { children: ReactNode }) {
  const [s, d] = useReducer(reducer, initial, i => {
    try { const raw = localStorage.getItem(KEY); return raw ? { ...i, ...JSON.parse(raw) } : i } catch { return i }
  })
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage unavailable */ } }, [s])
  return <Ctx.Provider value={{ s, d }}>{children}</Ctx.Provider>
}
export const useStore = () => useContext(Ctx)
export const total = (m: Record<string, number>) => Object.entries(m).reduce((t, [k, v]) => t + v * token(k).price, 0)
