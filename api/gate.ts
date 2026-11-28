// Beta sign-in. A wallet on the whitelist (BETA_WHITELIST, plus the admin wallets) signs a short message
// and gets a pass that opens the mainnet beta. Nothing is sent on chain.
import { verifyMessage, isAddress, type Hex } from 'viem'
import { gateOpen, issuePass, passValid, whitelist } from './_gate'

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
