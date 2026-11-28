// Beta sign-in. A wallet on the whitelist (BETA_WHITELIST, plus the admin wallets) signs a short message
// and gets a pass that opens the mainnet beta. Nothing is sent on chain.
import { verifyMessage, isAddress, type Hex } from 'viem'
import { createHmac, timingSafeEqual } from 'node:crypto'

// ---------- beta pass ----------
// Kept in this file on purpose: these functions run as separate ES modules on Vercel, and a shared local
// import failed to load there. The same helpers are in api/gate.ts and must stay identical.
/** BETA_OPEN=1 turns the gate off for everyone. */
const gateOpen = () => process.env.BETA_OPEN === '1'
// The signing secret is derived from the mainnet relayer key, so there is nothing extra to set up.
const secret = () => { const k = process.env.MAINNET_RELAYER_PRIVATE_KEY || ''; return k ? createHmac('sha256', 'hagi-beta-gate').update(k.trim()).digest() : null }
const mac = (body: string, s: Buffer) => createHmac('sha256', s).update(body).digest('hex')

function issuePass(address: string, days = 30): string | null {
  const s = secret(); if (!s) return null
  const body = address.toLowerCase() + '.' + (Date.now() + days * 86_400_000)
  return body + '.' + mac(body, s)
}

function passValid(pass: unknown): boolean {
  if (gateOpen()) return true
  const s = secret(); if (!s || typeof pass !== 'string') return false
  const m = /^(0x[0-9a-f]{40})\.(\d+)\.([0-9a-f]{64})$/.exec(pass)
  if (!m || Number(m[2]) < Date.now()) return false
  const want = Buffer.from(mac(m[1] + '.' + m[2], s)), got = Buffer.from(m[3])
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false
  // A wallet taken off the list loses access straight away, even with an unexpired pass.
  return whitelist().includes(m[1])
}

const whitelist = () => [process.env.BETA_WHITELIST, process.env.ADMIN_WALLETS].join(',').split(',').map(x => x.trim().toLowerCase()).filter(x => /^0x[0-9a-f]{40}$/.test(x))

async function readBody(req: any) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

export default async function handler(req: any, res: any) {
  const reply = (status: number, data: unknown) => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(data))
  }
  // GET says whether the beta is open to everyone, and whether a saved pass still works.
  if (req.method === 'GET') return reply(200, { open: gateOpen(), ok: passValid(req.headers?.['x-hagi-pass']) })
  if (req.method !== 'POST') return reply(405, { error: 'POST only' })
  const allowed = whitelist()
  if (!allowed.length) return reply(503, { error: 'The whitelist is not set up yet' })
  try {
    const { address, message, signature } = await readBody(req)
    if (!isAddress(address) || typeof message !== 'string' || typeof signature !== 'string') return reply(400, { error: 'bad request' })
    const m = /^Hagi beta sign-in\nAddress: (0x[0-9a-fA-F]{40})\nTime: (\d+)$/.exec(message)
    if (!m || m[1].toLowerCase() !== address.toLowerCase()) return reply(400, { error: 'bad message' })
    if (Math.abs(Date.now() - Number(m[2])) > 5 * 60_000) return reply(401, { error: 'Sign-in expired, try again' })
    const ok = await verifyMessage({ address: address as Hex, message, signature: signature as Hex })
    if (!ok) return reply(401, { error: 'That signature does not match the wallet' })
    if (!allowed.includes(address.toLowerCase())) return reply(403, { error: 'This wallet is not on the whitelist yet' })
    const pass = issuePass(address)
    if (!pass) return reply(503, { error: 'The beta is not set up yet' })
    return reply(200, { pass })
  } catch {
    return reply(400, { error: 'bad request' })
  }
}
