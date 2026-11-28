// The beta pass. While the mainnet beta is invite-only, a whitelisted wallet signs in once and gets a pass,
// and the mainnet relayer only serves requests that carry a valid one. Files starting with _ are not routes.
import { createHmac, timingSafeEqual } from 'node:crypto'

/** BETA_OPEN=1 turns the gate off for everyone. */
export const gateOpen = () => process.env.BETA_OPEN === '1'
// The signing secret is derived from the mainnet relayer key, so there is nothing extra to set up.
const secret = () => { const k = process.env.MAINNET_RELAYER_PRIVATE_KEY || ''; return k ? createHmac('sha256', 'hagi-beta-gate').update(k.trim()).digest() : null }
const mac = (body: string, s: Buffer) => createHmac('sha256', s).update(body).digest('hex')

export function issuePass(address: string, days = 30): string | null {
  const s = secret(); if (!s) return null
  const body = address.toLowerCase() + '.' + (Date.now() + days * 86_400_000)
  return body + '.' + mac(body, s)
}

export function passValid(pass: unknown): boolean {
  if (gateOpen()) return true
  const s = secret(); if (!s || typeof pass !== 'string') return false
  const m = /^(0x[0-9a-f]{40})\.(\d+)\.([0-9a-f]{64})$/.exec(pass)
  if (!m || Number(m[2]) < Date.now()) return false
  const want = Buffer.from(mac(m[1] + '.' + m[2], s)), got = Buffer.from(m[3])
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false
  // A wallet taken off the list loses access straight away, even with an unexpired pass.
  return whitelist().includes(m[1])
}

export const whitelist = () => [process.env.BETA_WHITELIST, process.env.ADMIN_WALLETS].join(',').split(',').map(x => x.trim().toLowerCase()).filter(x => /^0x[0-9a-f]{40}$/.test(x))
