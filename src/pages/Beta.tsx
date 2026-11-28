// Mainnet beta pieces: the deposit limits, the risk notice shown before a first deposit, and the banner.
import { useEffect, useState } from 'react'
import { CFG } from '../chain'
import * as engine from '../engine'
import { fmt } from '../data'

type Limits = NonNullable<Awaited<ReturnType<typeof engine.readLimits>>>

/** Reads the vault's deposit limits. Re-reads when the wallet or the private balance changes. */
export function useLimits(wallet: string | null, dep: unknown): Limits | null {
  const [l, setL] = useState<Limits | null>(null)
  useEffect(() => {
    if (!CFG.mainnet) return
    let on = true
    engine.readLimits().then(x => { if (on && x) setL(x) }).catch(() => { /* shown as unknown */ })
    return () => { on = false }
  }, [wallet, dep])
  return l
}

const KEY = 'hagi-beta-ok-v1'
export const betaOk = () => { try { return !!localStorage.getItem(KEY) } catch { return false } }

/** What a person agrees to before putting real money into the beta. Shown once per device. */
export function BetaNotice({ onAccept, onClose }: { onAccept: () => void; onClose: () => void }) {
  const [ok, setOk] = useState(false)
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide risk" onClick={e => e.stopPropagation()}>
        <h3>Before you deposit</h3>
        <p className="muted">This is the Hagi mainnet beta. It uses real money.</p>
        <ul>
          <li>The contracts have not been audited. A bug could lose everything you put in.</li>
          <li>Deposits are capped at ${fmt(CFG.limits?.perAddress ?? 100, 0)} per wallet for that reason. Only put in what you can afford to lose.</li>
          <li>USDG and the stock tokens are issued by other companies. If an issuer freezes them, Hagi cannot get them out.</li>
          <li>Privacy depends on how many people use the vault. With few users, your activity is easier to trace.</li>
          <li>Stock tokens are not available to people in some countries, including the United States. Check that you are allowed to hold them.</li>
        </ul>
        <label><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /><span>I have read this and I accept the risk.</span></label>
        <button className="btn" disabled={!ok} onClick={() => { try { localStorage.setItem(KEY, String(Date.now())) } catch { /* asked again next time */ } onAccept() }}>Continue</button>
        <button className="link center" onClick={onClose}>Not now</button>
      </div>
    </div>
  )
}

export function BetaBar() {
  return <div className="betabar"><b>Mainnet beta.</b> Real money, unaudited contracts. Deposits are capped at ${fmt(CFG.limits?.perAddress ?? 100, 0)} per wallet.</div>
}

/** Shown on the beta address until the mainnet contracts are deployed. */
export function ComingSoon() {
  return <div className="soon"><h2>The mainnet beta is almost here.</h2><p>We are finishing the last checks before it opens. Until then, you can try everything on testnet at hagitrade.xyz.</p></div>
}
