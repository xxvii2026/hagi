import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { token, type Basket } from './data'
import * as engine from './engine'
import { createPasskey, usePasskey } from './passkey'
import { shownBalance } from './roll'

export type Activity = { id: number; kind: 'shield' | 'unshield' | 'swap' | 'send' | 'basket' | 'receive'; title: string; detail: string; time: number; isPrivate?: boolean; hash?: string }
export type State = {
  wallet: string | null
  hagiAddress: string | null   // set once the vault keys are unlocked
  walletBal: Record<string, number>
  eth: number
  shielded: Record<string, number>
  activity: Activity[]
  baskets: Basket[]
  syncing: boolean
  offline: boolean             // the chain could not be read
  loaded: boolean              // the signed-in account's balances have been read at least once
}
const initial: State = { wallet: null, hagiAddress: null, walletBal: {}, eth: 0, shielded: {}, activity: [], baskets: [], syncing: false, offline: false, loaded: false }

type Api = {
  connect: () => Promise<void>
  unlock: () => Promise<void>
  passkey: (create: boolean) => Promise<void>
  disconnect: () => void
  refresh: (quiet?: boolean) => Promise<void>
  log: (a: Omit<Activity, 'id' | 'time'>) => void
}
const Ctx = createContext<{ s: State; api: Api }>({ s: initial, api: {} as Api })

const activityKey = (w: string) => 'hagi-activity-' + w.toLowerCase()
const load = <T,>(k: string, d: T): T => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d } catch { return d } }
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage unavailable */ } }

export function Store({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(initial)
  const patch = useCallback((p: Partial<State>) => setS(x => ({ ...x, ...p })), [])
  const busy = useRef(false)
  const polls = useRef(0)
  const misses = useRef(0)
  const logRef = useRef<Api['log']>(() => {})

  // A quiet refresh is the background check for new funds: it doesn't flash "Syncing" in the top bar.
  const refresh = useCallback(async (quiet = false) => {
    if (busy.current) return
    busy.current = true
    if (!quiet) patch({ syncing: true })
    try {
      // Background checks look at balances every time, and at baskets and prices every fifth time.
      const full = !quiet || polls.current++ % 5 === 0
      const baskets = full ? (await Promise.all([engine.readBaskets(), engine.readPools()]))[0] : null
      const w = await engine.readWallet()
      const shielded = await engine.sync()
      patch({ ...(baskets ? { baskets } : {}), walletBal: w.balances, eth: w.eth, shielded, offline: false, ...(engine.session.address ? { loaded: true } : {}) })
      misses.current = 0
      for (const r of engine.takeReceived()) {
        const detail = r.amount.toLocaleString('en-US', { maximumFractionDigits: r.symbol === 'USDG' ? 2 : 4 }) + ' ' + r.symbol
        logRef.current({ kind: 'receive', title: 'Received ' + r.symbol, detail, isPrivate: true })
        dispatchEvent(new CustomEvent('hagi-toast', { detail: { title: 'You received ' + detail, sub: 'It’s in your private balance.' } }))
      }
    } catch (e) {
      console.warn('Hagi could not read the chain', e)
      // One missed background check is usually the RPC's rate limit. Only say the chain is unreachable
      // when a check the user asked for fails, or two background checks in a row do.
      if (!quiet || ++misses.current >= 2) patch({ offline: true })
    } finally {
      busy.current = false
      if (!quiet) patch({ syncing: false })
    }
  }, [patch])

  // On load, pick the wallet back up if it is still connected, then read the chain.
  // Public data (pools and baskets) loads even without a wallet, for the landing page.
  useEffect(() => {
    engine.watchWallet()
    void engine.resume().then(r => {
      if (r) patch({ wallet: r.wallet, hagiAddress: r.address, activity: load(activityKey(r.wallet), []) })
      return refresh()
    })
  }, [patch, refresh])

  // While signed in, check for new funds every 12 seconds, and straight away when the tab comes back into view.
  // Skipped while a transaction is in progress, since that refreshes by itself when it finishes.
  const signedIn = !!s.hagiAddress
  useEffect(() => {
    if (!signedIn) return
    const tick = () => { if (document.visibilityState === 'visible' && !document.body.classList.contains('busy')) void refresh(true) }
    const t = setInterval(tick, 12000)
    const back = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', back); addEventListener('focus', back)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', back); removeEventListener('focus', back) }
  }, [signedIn, refresh])

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
    passkey: async create => {
      const secret = create ? await createPasskey() : await usePasskey()
      const r = engine.passkeyIn(secret)
      try { localStorage.setItem('hagi-has-passkey', '1') } catch { /* fine */ }
      patch({ wallet: r.wallet, hagiAddress: r.address, activity: load(activityKey(r.wallet), []) })
      await refresh()
    },
    disconnect: () => { engine.lock(); shownBalance.last = 0; setS(x => ({ ...initial, baskets: x.baskets })) },
    refresh,
    log: a => {
      // Read the hash once, outside the state update, so it is never consumed twice.
      const hash = a.kind === 'receive' ? undefined : engine.takeHash() ?? undefined
      setS(x => {
        const activity = [{ hash, ...a, id: Date.now(), time: Date.now() }, ...x.activity].slice(0, 200)
        if (x.wallet) save(activityKey(x.wallet), activity)
        return { ...x, activity }
      })
    },
  }), [patch, refresh])

  logRef.current = api.log
  return <Ctx.Provider value={{ s, api }}>{children}</Ctx.Provider>
}
export const useStore = () => useContext(Ctx)
export const total = (m: Record<string, number>) => Object.entries(m).reduce((t, [k, v]) => t + v * token(k).price, 0)
