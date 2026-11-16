import { useState } from 'react'
import { useStore, type Activity as A } from '../store'
import { Card, Censor, Icon, type IconName } from '../ui'

const GLYPH: Record<A['kind'], IconName> = { shield: 'down', unshield: 'up', swap: 'swap', send: 'right', basket: 'basket', receive: 'left' }
const ago = (t: number) => { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago` }

export function ActivityList({ limit }: { limit?: number }) {
  const { s } = useStore()
  const items = limit ? s.activity.slice(0, limit) : s.activity
  // Private items stay pixelated until tapped, so the censor shows what is private at a glance.
  const [open, setOpen] = useState<Record<number, boolean>>({})
  if (!items.length) return <div className="empty sm"><p>Nothing on the record yet.</p></div>
  return <>{items.map(a => (
    <div className="row" key={a.id}>
      <span className="ai"><Icon name={GLYPH[a.kind]} /></span>
      <div className="g"><b>{a.title}</b><span>{ago(a.time)}{a.isPrivate ? ' · Private' : ''}</span></div>
      <div className="r"><b>{a.isPrivate && !open[a.id] ? <button className="reveal" onClick={() => setOpen({ ...open, [a.id]: true })} title="Private. Tap to reveal" aria-label="Private amount. Tap to reveal"><Censor seed={String(a.id)} cell={7} /></button>
        : a.isPrivate ? <button className="reveal" onClick={() => setOpen({ ...open, [a.id]: false })} title="Tap to hide">{a.detail}</button> : a.detail}</b></div>
    </div>
  ))}</>
}

export function Activity() {
  const { s, api } = useStore()
  return (
    <div className="wrap one">
      <div className="bhd">
        <div><h2><span>Activity,</span> for your eyes only.</h2><p>This list is kept on this device. Private items stay pixelated until you tap them.</p></div>
      </div>
      <Card><ActivityList /></Card>
    </div>
  )
}
