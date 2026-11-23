import type { Basket } from './data'
import { token } from './data'

/** A basket you bought, remembered privately on this device: which basket, how much of each stock it gave you, and what you paid. */
export type Position = { id: number; name: string; items: Basket['items']; units: Record<string, number>; cost: number; costs?: Record<string, number>; at: number }

const key = (owner: string) => 'hagi-baskets-' + owner.slice(0, 24)
export function loadPositions(owner: string | null): Position[] {
  if (!owner) return []
  try { return JSON.parse(localStorage.getItem(key(owner)) ?? '[]') } catch { return [] }
}
function save(owner: string, list: Position[]) { try { localStorage.setItem(key(owner), JSON.stringify(list)) } catch { /* storage full or blocked */ } }

export function addPosition(owner: string, b: Basket, received: Record<string, number>, cost: number) {
  const list = loadPositions(owner)
  const p = list.find(x => x.id === b.id)
  const legCost = Object.fromEntries(b.items.map(it => [it.symbol, cost * it.weight / 100]))
  if (p) { for (const [k, v] of Object.entries(received)) { p.units[k] = (p.units[k] ?? 0) + v; p.costs = { ...costsOf(p), [k]: (costsOf(p)[k] ?? 0) + legCost[k] } } p.cost += cost }
  else list.unshift({ id: b.id, name: b.name, items: b.items, units: { ...received }, cost, costs: legCost, at: Date.now() })
  save(owner, list)
}
export function updatePosition(owner: string, id: number, units: Record<string, number>, costs: Record<string, number>) {
  const list = loadPositions(owner), p = list.find(x => x.id === id)
  if (!p) return
  p.units = units; p.costs = costs; p.cost = Object.values(costs).reduce((t, v) => t + v, 0)
  const left = Object.values(units).some(v => v > 1e-9)
  save(owner, left ? list : list.filter(x => x.id !== id))
}

/** What the position still holds: never more than you actually have of each stock, in case some was sold on its own. */
export function held(p: Position, shielded: Record<string, number>) {
  const u: Record<string, number> = {}
  for (const it of p.items) u[it.symbol] = Math.max(0, Math.min(p.units[it.symbol] ?? 0, shielded[it.symbol] ?? 0))
  return u
}
export const valueOf = (u: Record<string, number>) => Object.entries(u).reduce((t, [k, v]) => t + v * token(k).price, 0)
/** How far the current mix has drifted from the basket's weights, in percentage points (largest single gap). */
export function drift(p: Position, u: Record<string, number>) {
  const v = valueOf(u); if (v <= 0) return 0
  return Math.max(...p.items.map(it => Math.abs((u[it.symbol] * token(it.symbol).price / v) * 100 - it.weight)))
}

/** What you paid for each stock in the basket. Older saves only kept the total, so it is split by the weights. */
export const costsOf = (p: Position) => p.costs ?? Object.fromEntries(p.items.map(it => [it.symbol, p.cost * it.weight / 100]))
/** What you paid for the part you still hold, so selling a stock on its own doesn't show up as a loss here. */
export function basis(p: Position, u: Record<string, number>) {
  const c = costsOf(p)
  return p.items.reduce((t, it) => { const all = p.units[it.symbol] ?? 0; return t + (all > 0 ? (c[it.symbol] ?? 0) * (u[it.symbol] ?? 0) / all : 0) }, 0)
}
