// The front door of the mainnet beta while it is invite-only: a "coming soon" page, with a quiet sign-in
// for whitelisted wallets. A wallet on the list signs one message to prove it, then opens its Hagi account.
import { useEffect, useState } from 'react'
import * as engine from '../engine'
import { useStore } from '../store'
import { Mark } from '../ui'
import './betagate.css'

/** True once this device holds a valid pass, or the beta has been opened to everyone. */
export function useBetaGate(): { passed: boolean; pass: () => void } {
  const [passed, setPassed] = useState(() => !!engine.betaPass())
  useEffect(() => {
    // The server has the last word: it can open the beta for everyone, or reject a pass for a removed wallet.
    const p = engine.betaPass()
    fetch('/api/gate', { headers: p ? { 'x-hagi-pass': p } : {} }).then(r => r.json()).then(j => {
      if (j.open) setPassed(true)
      else if (p && j.ok === false) { engine.saveBetaPass(null); setPassed(false) }
    }).catch(() => { /* offline: keep what this device already has */ })
  }, [])
  return { passed, pass: () => setPassed(true) }
}

export default function BetaGate({ onPass }: { onPass: () => void }) {
  const { api } = useStore()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { document.title = 'Hagi mainnet beta · Coming soon'; document.documentElement.style.zoom = '1'; document.body.style.background = '#f6f7fc'; return () => { document.documentElement.style.zoom = ''; document.body.style.background = '' } }, [])

  const signIn = async () => {
    setErr('')
    try {
      if (!engine.hasWallet()) throw new Error('Open this page in a browser with your wallet, or in your wallet app.')
      setBusy('Connect your wallet')
      await api.connect()
      const address = engine.session.account
      if (!address) throw new Error('No wallet connected.')
      setBusy('Sign the message to prove this wallet is yours')
      const message = `Hagi beta sign-in\nAddress: ${address}\nTime: ${Date.now()}`
      const signature = await engine.signText(message)
      setBusy('Checking the whitelist')
      const r = await fetch('/api/gate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, message, signature }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.pass) { api.disconnect(); throw new Error(j.error || 'Could not check the whitelist. Try again.') }
      engine.saveBetaPass(j.pass)
      // One more signature opens the Hagi account itself, so they land in the dashboard already signed in.
      setBusy('Sign once more to open your Hagi account')
      await api.unlock()
      location.hash = '#/portfolio'
      onPass()
    } catch (e: any) {
      const m = String(e?.shortMessage || e?.message || e)
      setErr(/rejected|denied|cancel/i.test(m) ? 'You cancelled in your wallet.' : m)
      // A wallet that passed the list but stopped at the last step still gets in, and signs in from the app.
      if (engine.betaPass()) { location.hash = '#/portfolio'; onPass() }
    } finally { setBusy('') }
  }

  return (
    <div className="bg8">
      <div className="bg8-glow" />
      <div className="bg8-in">
        <div className="bg8-lg"><Mark leaf="#566eba" block="#a9b6e4" size={34} />hagi</div>
        <h1>Coming soon.</h1>
        <p className="bg8-wl">{busy ? busy + '…' : <>Whitelisted? <button onClick={signIn}>Click here</button></>}</p>
        {err && <p className="bg8-err">{err}</p>}
      </div>
    </div>
  )
}
