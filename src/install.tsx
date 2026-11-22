// Installing Hagi to the home screen: detection, the browser's install prompt, and a small card that explains it.
import { useEffect, useState } from 'react'
import { Icon } from './ui'

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: Prompt | null = null
const listeners = new Set<() => void>()

/** Call once at start-up: Chrome fires its install event early, before React is ready. */
export function listenForInstall() {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as Prompt; listeners.forEach(f => f()) })
  addEventListener('appinstalled', () => { deferred = null; listeners.forEach(f => f()) })
}

export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const KEY = 'hagi-install-dismissed'

/** Shown on phones that aren't running Hagi as an installed app yet. */
export function InstallCard() {
  const [, bump] = useState(0)
  const [hidden, setHidden] = useState(() => { try { return !!localStorage.getItem(KEY) } catch { return false } })
  const [phone, setPhone] = useState(() => matchMedia('(max-width: 700px)').matches)
  const [steps, setSteps] = useState(false)
  useEffect(() => {
    const f = () => bump(n => n + 1); listeners.add(f)
    const m = matchMedia('(max-width: 700px)'), g = () => setPhone(m.matches); m.addEventListener('change', g)
    return () => { listeners.delete(f); m.removeEventListener('change', g) }
  }, [])
  if (hidden || !phone || isStandalone()) return null
  const dismiss = () => { setHidden(true); try { localStorage.setItem(KEY, '1') } catch { /* fine */ } }
  const install = async () => {
    if (deferred) { await deferred.prompt(); const r = await deferred.userChoice; if (r.outcome === 'accepted') dismiss(); deferred = null; bump(n => n + 1) }
    else setSteps(true)
  }
  return (
    <div className="inst">
      <span className="inst-ic"><svg viewBox="0 0 100 100" width="26" height="26" aria-hidden><rect width="100" height="100" rx="24" fill="#1b2140" /><g transform="translate(50,50) scale(.56) translate(-50,-50)" fill="#fff"><path d="M0 23A23 23 0 0 1 23 0A23 23 0 0 1 46 23V46H23A23 23 0 0 1 0 23Z" /><path d="M100 23A23 23 0 0 0 77 0A23 23 0 0 0 54 23V46H77A23 23 0 0 0 100 23Z" /><path d="M0 77A23 23 0 0 0 23 100A23 23 0 0 0 46 77V54H23A23 23 0 0 0 0 77Z" /><rect x="54" y="54" width="42" height="42" fill="#566eba" /></g></svg></span>
      {steps ? (
        <span className="inst-t">{isIOS()
          ? <>Tap <b className="inst-k"><Icon name="share" size={14} /> Share</b> in Safari's bar, then <b>Add to Home Screen</b>.</>
          : <>Open your browser's menu <b>⋮</b> and choose <b>Install app</b> or <b>Add to Home screen</b>.</>}</span>
      ) : (
        <span className="inst-t"><b>Get the Hagi app</b><br />Add it to your home screen</span>
      )}
      {!steps && <button className="inst-b" onClick={install}>{deferred ? 'Install' : 'How'}</button>}
      <button className="inst-x" onClick={dismiss} aria-label="Hide this"><Icon name="close" size={14} /></button>
    </div>
  )
}
