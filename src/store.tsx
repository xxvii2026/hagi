import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { token, type Basket } from './data'
import * as engine from './engine'

export type Activity = { id: number; kind: 'shield' | 'unshield' | 'swap' | 'send' | 'basket' | 'receive'; title: string; detail: string; time: number; isPrivate?: boolean }
export type State = {
  wallet: string | null
  hagiAddress: string | null   // set once the vault keys are unlocked
  walletBal: Record<string, number>
  eth: number
  shielded: Record<string, number>
  activity: Activity[]
  baskets: Basket[]
  hidden: boolean
  syncing: boolean
  offline: boolean             // the chain could not be read
}
const initial: State = { wallet: null, hagiAddress: null, walletBal: {}, eth: 0, shielded: {}, activity: [], baskets: [], hidden: false, syncing: false, offline: false }

type Api = {
  connect: () => Promise<void>
  unlock: () => Promise<void>
  disconnect: () => void
  refresh: () => Promise<void>
  toggleHidden: () => void
  log: (a: Omit<Activity, 'id' | 'time'>) => void
}
const Ctx = createContext<{ s: State; api: Api }>({ s: initial, api: {} as Api })

const PREFS = 'hagi-prefs-v2'
const activityKey = (w: string) => 'hagi-activity-' + w.toLowerCase()
const load = <T,>(k: string, d: T): T => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d } catch { return d } }
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage unavailable */ } }

export function Store({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(() => ({ ...initial, hidden: load(PREFS, { hidden: false }).hidden }))
  const patch = useCallback((p: Partial<State>) => setS(x => ({ ...x, ...p })), [])
  const busy = useRef(false)

  const refresh = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    patch({ syncing: true })
    try {
      const [baskets] = await Promise.all([engine.readBaskets(), engine.readPools()])
      const w = await engine.readWallet()
      const shielded = await engine.sync()
      patch({ baskets, walletBal: w.balances, eth: w.eth, shielded, offline: false })
    } catch (e) {
      console.warn('Hagi could not read the chain', e)
      patch({ offline: true })
    } finally {
      busy.current = false
      patch({ syncing: false })
    }
  }, [patch])

  // Public data (pools and baskets) loads without a wallet, for the landing page.
  useEffect(() => { void refresh() }, [refresh])

  const api = useMemo<Api>(() => ({
    connect: async () => {
      const wallet = await engine.connect()
      patch({ wallet, activity: load(activityKey(wallet), []) })
      await refresh()
    },
    unlock: async () => {
      const hagiAddress = await engine.unlock()
      patch({ hagiAddress })
      await refresh()
    },
    disconnect: () => { engine.lock(); setS(x => ({ ...initial, hidden: x.hidden, baskets: x.baskets })) },
    refresh,
    toggleHidden: () => setS(x => { save(PREFS, { hidden: !x.hidden }); return { ...x, hidden: !x.hidden } }),
    log: a => setS(x => {
      const activity = [{ ...a, id: Date.now(), time: Date.now() }, ...x.activity].slice(0, 200)
      if (x.wallet) save(activityKey(x.wallet), activity)
      return { ...x, activity }
    }),
  }), [patch, refresh])

  return <Ctx.Provider value={{ s, api }}>{children}</Ctx.Provider>
}
export const useStore = () => useContext(Ctx)
export const total = (m: Record<string, number>) => Object.entries(m).reduce((t, [k, v]) => t + v * token(k).price, 0)
