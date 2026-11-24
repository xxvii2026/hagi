// Gate in front of the admin dashboard. The dashboard's code only loads after an admin wallet signs in.
import { Suspense, lazy, useState } from 'react'
import { createWalletClient, custom } from 'viem'

const Admin = lazy(() => import('./Admin'))
const SLOT = 'hagi-admin-until'
type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }

export default function AdminGate() {
  const [open, setOpen] = useState(() => Number(sessionStorage.getItem(SLOT) || 0) > Date.now())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (open) return <Suspense fallback={null}><Admin /></Suspense>

  const signIn = async () => {
    setErr('')
    const eth = (window as unknown as { ethereum?: Eth }).ethereum
    if (!eth) return setErr('No wallet found in this browser.')
    setBusy(true)
    try {
      const wal = createWalletClient({ transport: custom(eth) })
      const [address] = await wal.requestAddresses()
      const message = `Hagi admin sign-in\nAddress: ${address}\nTime: ${Date.now()}`
      const signature = await wal.signMessage({ account: address, message })
      const r = await fetch('/api/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, message, signature }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.error || 'Sign-in failed')
      sessionStorage.setItem(SLOT, String(j.until))
      setOpen(true)
    } catch (e) {
      setErr((e as Error).message?.split('\n')[0] || 'Sign-in failed')
    } finally { setBusy(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f6f7fb', fontFamily: 'Inter Variable, Inter, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '36px 40px', width: 360, textAlign: 'center', boxShadow: '0 10px 40px rgba(27,33,64,.08)' }}>
        <h1 style={{ fontSize: 22, margin: '0 0 8px', color: '#1b2140' }}>Admin</h1>
        <p style={{ margin: '0 0 24px', color: '#6b7192', fontSize: 14 }}>Sign in with an admin wallet to continue.</p>
        <button className="btn" disabled={busy} onClick={signIn} style={{ width: '100%' }}>{busy ? 'Check your wallet…' : 'Sign in with wallet'}</button>
        {err && <p style={{ margin: '16px 0 0', color: '#c0392b', fontSize: 13 }}>{err}</p>}
      </div>
    </div>
  )
}
