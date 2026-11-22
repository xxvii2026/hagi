import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CFG } from '../chain'
import { useStore, type Activity as A } from '../store'
import { Card, Censor, Icon, type IconName } from '../ui'

const GLYPH: Record<A['kind'], IconName> = { shield: 'down', unshield: 'up', swap: 'swap', send: 'right', basket: 'basket', receive: 'left' }
const ago = (t: number) => { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago` }

export function ActivityList({ limit }: { limit?: number }) {
  const { s } = useStore()
  const items = limit ? s.activity.slice(0, limit) : s.activity
  // Private items stay pixelated until tapped, so the censor shows what is private at a glance.
  const [open, setOpen] = useState<Record<number, boolean>>({})
  const [receipt, setReceipt] = useState<A | null>(null)
  if (!items.length) return <div className="empty sm"><p>Nothing on the record yet.</p></div>
  return <>{items.map(a => (
    <div className="row act" key={a.id} role="button" tabIndex={0} onClick={() => setReceipt(a)} onKeyDown={e => { if (e.key === 'Enter') setReceipt(a) }}>
      <span className="ai"><Icon name={GLYPH[a.kind]} /></span>
      <div className="g"><b>{a.title}</b><span>{ago(a.time)}{a.isPrivate ? ' · Private' : ''}</span></div>
      <div className="r"><b>{a.isPrivate && !open[a.id] ? <button className="reveal" onClick={e => { e.stopPropagation(); setOpen({ ...open, [a.id]: true }) }} title="Private. Tap to reveal" aria-label="Private amount. Tap to reveal"><Censor seed={String(a.id)} cell={7} /></button>
        : a.isPrivate ? <button className="reveal" onClick={e => { e.stopPropagation(); setOpen({ ...open, [a.id]: false }) }} title="Tap to hide">{a.detail}</button> : a.detail}</b></div>
    </div>
  ))}{receipt && <Receipt a={receipt} onClose={() => setReceipt(null)} />}</>
}

/** One activity entry, up close: amount, time, what was public, and a link to the transaction. */
function Receipt({ a, onClose }: { a: A; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => { try { await navigator.clipboard.writeText(a.hash ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1400) } catch { /* blocked */ } }
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal receipt" onClick={e => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        <span className="rc-ic"><Icon name={GLYPH[a.kind]} size={24} /></span>
        <div className="rc-title">{a.title}</div>
        <div className="rc-amt">{a.detail}</div>
        <span className="rc-ok"><Icon name="check" size={14} />Confirmed{a.isPrivate ? ' · Private' : ''}</span>
        <dl className="ts-facts">
          <div><dt>When</dt><dd>{new Date(a.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</dd></div>
          {a.hash && <div><dt>Transaction</dt><dd><button className="rc-copy" onClick={copy}>{copied ? 'Copied' : a.hash.slice(0, 8) + '…' + a.hash.slice(-6)}<Icon name="copy" size={13} /></button></dd></div>}
          <div><dt>Network</dt><dd>{CFG.name}</dd></div>
        </dl>
        {a.hash && <a className="btn o rc-link" href={`${CFG.explorer}/tx/${a.hash}`} target="_blank" rel="noopener noreferrer">View on the explorer</a>}
      </div>
    </div>, document.body,
  )
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
