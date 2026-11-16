import { useStore, type Activity as A } from '../store'
import { Card, Censor } from '../ui'

const GLYPH: Record<A['kind'], string> = { shield: '↓', unshield: '↑', swap: '⇄', send: '→', basket: '◫', receive: '←' }
const ago = (t: number) => { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago` }

export function ActivityList({ limit }: { limit?: number }) {
  const { s } = useStore()
  const items = limit ? s.activity.slice(0, limit) : s.activity
  if (!items.length) return <div className="empty sm"><p>Your activity will show up here.</p></div>
  return <>{items.map(a => (
    <div className="row" key={a.id}>
      <span className="ai">{GLYPH[a.kind]}</span>
      <div className="g"><b>{a.title}</b><span>{ago(a.time)}{a.isPrivate ? ' · Private' : ''}</span></div>
      <div className="r"><b>{s.hidden ? <Censor seed={String(a.id)} cell={7} /> : a.detail}</b></div>
    </div>
  ))}</>
}

export function Activity() {
  const { s, d } = useStore()
  const exportHistory = () => {
    const blob = new Blob([JSON.stringify({ account: s.hagiAddress, exportedAt: new Date().toISOString(), activity: s.activity }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hagi-history.json'; a.click(); URL.revokeObjectURL(a.href)
  }
  return (
    <div className="wrap one">
      <div className="bhd">
        <div><h2>Activity</h2><p>Only you can see this list. It is kept on this device.</p></div>
        <div className="acts"><button className="btn o" onClick={() => d({ type: 'toggleHidden' })}>{s.hidden ? 'Show amounts' : 'Hide amounts'}</button><button className="btn o" onClick={exportHistory} disabled={!s.activity.length}>Export my history</button></div>
      </div>
      <Card><ActivityList /></Card>
    </div>
  )
}
