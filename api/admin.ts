// Admin sign-in. The admin dashboard only opens for wallets listed in the ADMIN_WALLETS env var
// (comma separated addresses). The wallet signs a short message, nothing is sent on chain.
import { verifyMessage, isAddress, type Hex } from 'viem'

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
  if (req.method !== 'POST') return reply(405, { error: 'POST only' })
  const allowed = (process.env.ADMIN_WALLETS || '').split(',').map(s => s.trim().toLowerCase()).filter(isAddress)
  if (!allowed.length) return reply(503, { error: 'ADMIN_WALLETS is not set for this deployment' })
  try {
    const { address, message, signature } = await readBody(req)
    if (!isAddress(address) || typeof message !== 'string' || typeof signature !== 'string') return reply(400, { error: 'bad request' })
    const m = /^Hagi admin sign-in\nAddress: (0x[0-9a-fA-F]{40})\nTime: (\d+)$/.exec(message)
    if (!m || m[1].toLowerCase() !== address.toLowerCase()) return reply(400, { error: 'bad message' })
    if (Math.abs(Date.now() - Number(m[2])) > 5 * 60_000) return reply(401, { error: 'Sign-in expired, try again' })
    const ok = await verifyMessage({ address: address as Hex, message, signature: signature as Hex })
    if (!ok || !allowed.includes(address.toLowerCase())) return reply(403, { error: 'This wallet is not an admin' })
    return reply(200, { ok: true, until: Date.now() + 12 * 3600_000 })
  } catch {
    return reply(400, { error: 'bad request' })
  }
}
