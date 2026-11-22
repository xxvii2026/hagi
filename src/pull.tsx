// Pull to refresh on phones: drag down from the top of the page to re-read balances.
import { useEffect, useRef, useState } from 'react'

const TRIGGER = 60

export function PullToRefresh({ enabled, onRefresh }: { enabled: boolean; onRefresh: () => Promise<void> }) {
  const [d, setD] = useState(0)
  const [busy, setBusy] = useState(false)
  const start = useRef<number | null>(null)
  useEffect(() => {
    if (!enabled) return
    const down = (e: TouchEvent) => { start.current = scrollY <= 0 && !document.querySelector('.overlay') ? e.touches[0].clientY : null }
    const move = (e: TouchEvent) => {
      if (start.current === null || busy) return
      const dy = e.touches[0].clientY - start.current
      setD(dy > 0 ? Math.min(120, dy * 0.5) : 0)
    }
    const up = async () => {
      if (start.current === null) return
      start.current = null
      if (d >= TRIGGER) {
        setBusy(true); setD(56)
        try { await onRefresh() } finally { setBusy(false); setD(0) }
      } else setD(0)
    }
    addEventListener('touchstart', down, { passive: true }); addEventListener('touchmove', move, { passive: true }); addEventListener('touchend', up)
    return () => { removeEventListener('touchstart', down); removeEventListener('touchmove', move); removeEventListener('touchend', up) }
  }, [enabled, onRefresh, d, busy])
  if (!enabled || (d === 0 && !busy)) return null
  const ready = d >= TRIGGER
  return (
    <div className="ptr" style={{ transform: `translate(-50%, ${d}px)`, opacity: Math.min(1, d / 40) }} aria-hidden>
      <span className={'ptr-ring' + (busy ? ' spin' : '')} style={busy ? undefined : { transform: `rotate(${d * 4}deg)`, borderTopColor: ready ? '#566eba' : undefined }} />
    </div>
  )
}
