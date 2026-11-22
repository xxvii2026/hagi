import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { token, fmt, withCommas } from './data'
import { friendly, onRelayerDown } from './engine'
import { useStore } from './store'
import { shownBalance } from './roll'

/** The Hagi mark. With `secret`, hovering it lets the hidden fourth leaf show for a moment. */
export function Mark({ size = 24, leaf = '#1b2140', block = '#566eba', secret = false }: { size?: number; leaf?: string; block?: string; secret?: boolean }) {
  const p = 'M0 23A23 23 0 0 1 23 0A23 23 0 0 1 46 23V46H23A23 23 0 0 1 0 23Z'
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className={secret ? 'mk-secret' : undefined}>
      <path d={p} fill={leaf} /><path d={p} fill={leaf} transform="translate(100,0) scale(-1,1)" /><path d={p} fill={leaf} transform="translate(0,100) scale(1,-1)" />
      <rect className="mk-b" x="54" y="54" width="42" height="42" fill={block} />
      {secret && <path className="mk-4" d={p} fill={block} transform="translate(100,100) scale(-1,-1)" />}
    </svg>
  )
}

// Placeholder icons stay inside the brand palette until a token has a real logo.
const TINTS = [['#e8ebf7', '#1b2140'], ['#e3e8f9', '#4a61ab'], ['#efecf2', '#6b6177'], ['#1b2140', '#ffffff'], ['#566eba', '#ffffff'], ['#d9def0', '#3a4a8a']]
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/** Shows the token's logo when the token list provides one, otherwise a coloured initial. */
export function TokenIcon({ symbol, size = 40 }: { symbol: string; size?: number }) {
  const t = token(symbol)
  const [broken, setBroken] = useState(false)
  const [bg, fg] = TINTS[hash(symbol) % TINTS.length]
  // Company marks are square and reach their edges, so they sit inside the circle with a margin and are never cropped.
  if (t.logoURI && !broken) return <span className={'ti logo ' + (t.logoFill ? 'fill' : 'pad') + (t.logoDark ? ' dark' : '')} style={{ width: size, height: size }} title={t.name}><img src={t.logoURI} alt={t.name} loading="lazy" onError={() => setBroken(true)} /></span>
  const full = size >= 34
  return <span className="ti" style={{ width: size, height: size, background: bg, color: fg, fontSize: full ? size * 0.25 : size * 0.4, letterSpacing: full ? '-0.02em' : 0 }}>{full ? symbol.slice(0, 4) : symbol[0]}</span>
}

const ICONS = {
  down: 'M10 4v12M5 11l5 5 5-5', up: 'M10 16V4M5 9l5-5 5 5', swap: 'M4 7h11M12 4l3 3-3 3M16 13H5M8 10l-3 3 3 3',
  right: 'M4 10h12M11 5l5 5-5 5', left: 'M16 10H4M9 5l-5 5 5 5', basket: 'M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z',
  chevron: 'M5 8l5 5 5-5', copy: 'M7 7h9v9H7zM4 13V4h9', alert: 'M10 5v6M10 14.4v.2', close: 'M5 5l10 10M15 5L5 15', check: 'M4 10.5l4 4 8-9',
  lock: 'M5.5 9h9v7.5h-9zM7.5 9V6.5a2.5 2.5 0 0 1 5 0V9', eye: 'M2.5 10s3-5 7.5-5 7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5zM10 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z', shield: 'M10 3l6 2v5c0 3.5-2.5 6-6 7-3.5-1-6-3.5-6-7V5z',
  wallet: 'M3.5 6.5h13v9.5h-13zM3.5 6.5l1.8-2.8h9.4l1.8 2.8M13 11.2h1.2', clock: 'M10 3.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM10 6.5v3.8l2.6 1.6', send: 'M3.5 10.2 16.5 4l-4.8 12.5-2.4-5.3z', share: 'M10 3.5v9M6.5 7 10 3.5 13.5 7M5 10.5v6h10v-6', plus: 'M10 4v12M4 10h12',
} as const
export type IconName = keyof typeof ICONS
/** One drawn icon set with a single line weight, so icons look the same on every device. */
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return <svg className="ic" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICONS[name]} /></svg>
}

/** Pixel censor. Stands in for a number that is kept private. */
export function Censor({ seed, cols = 7, cell = 9, onDark = false }: { seed: string; cols?: number; cell?: number; onDark?: boolean }) {
  const pal = onDark ? ['#ffffff', '#566eba', '#8696cf', '#b0a7b8', '#c9d1ee', '#3a4a8a'] : ['#1b2140', '#566eba', '#8696cf', '#b0a7b8', '#d9def0', '#3a4a8a']
  let h = hash(seed)
  const cells = Array.from({ length: cols * 2 }, () => { h = (h * 1103515245 + 12345) >>> 0; return pal[(h >>> 8) % pal.length] })
  return <span className="censor" style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridAutoRows: cell }} aria-label="Hidden">{cells.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
}
export function Amount({ value, prefix = '', digits = 2 }: { value: number; seed?: string; prefix?: string; digits?: number; cell?: number }) {
  return <>{prefix}{fmt(value, digits)}</>
}

/** Stands in for an action button until a wallet is connected and the Hagi account is made. */
export function NeedAccount({ className = 'btn' }: { className?: string }) {
  const { s } = useStore()
  return <button className={className} onClick={() => dispatchEvent(new Event('hagi-connect'))}>{s.wallet ? 'Sign in' : 'Connect wallet'}</button>
}

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={'card ' + className}>{title && <div className="ch"><span>{title}</span>{action}</div>}{children}</section>
}

/** A token menu with logos, names and balances, in place of the browser's plain list. */
export function TokenPicker({ value, onChange, options, balances }: { value: string; onChange: (s: string) => void; options: string[]; balances?: Record<string, number> }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div className="tpw" ref={box}>
      <button type="button" className={'tp' + (open ? ' open' : '')} aria-haspopup="listbox" aria-expanded={open} aria-label={'Token: ' + value} onClick={() => setOpen(o => !o)}>
        <TokenIcon symbol={value} size={26} />{value}<Icon name="chevron" size={14} />
      </button>
      {open && (
        <ul className="tpl" role="listbox">
          {options.map(o => (
            <li key={o} role="option" aria-selected={o === value}>
              <button type="button" className={o === value ? 'on' : ''} onClick={() => { onChange(o); setOpen(false) }}>
                <TokenIcon symbol={o} size={34} />
                <span className="g"><b>{token(o).name}</b><span>{o}</span></span>
                {balances && <span className="bal">{fmt(balances[o] ?? 0, o === 'USDG' ? 2 : 4)}</span>}
                {o === value && <Icon name="check" size={15} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AmountField({ label, value, onChange, hint, onMax, right, readOnly, inputRef }: { label: string; value: string; onChange?: (v: string) => void; hint?: ReactNode; onMax?: () => void; right?: ReactNode; readOnly?: boolean; inputRef?: Ref<HTMLInputElement> }) {
  return (
    <div className="fld">
      <span className="fl">{label}</span>
      <div className="fv">
        <input ref={inputRef} className="num" inputMode="decimal" placeholder="0" value={readOnly ? value : withCommas(value)} readOnly={readOnly} onChange={e => onChange?.(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))} aria-label={label} />
        {right}
      </div>
      <div className="hint"><span>{hint}</span>{onMax && <button className="tag" onClick={onMax}>Max</button>}</div>
    </div>
  )
}

const LEAF = 'M0 23A23 23 0 0 1 23 0A23 23 0 0 1 46 23V46H23A23 23 0 0 1 0 23Z'
export type Step = (label: string) => void
export type Run = (title: string, task: (step: Step) => Promise<void>, done?: string) => void

/** Shows the real steps of an action as they happen, then the result or the error. */
/** Rolls a number from its last value to the new one. Starts from zero on first load.
 *  While the progress window is open the roll waits, so it plays where the user can see it. */
export function useCountUp(value: number, ms = 700) {
  const [shown, setShown] = useState(shownBalance.last)
  const from = useRef(shownBalance.last)
  useEffect(() => {
    const start = from.current
    if (start === value) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { from.current = shownBalance.last = value; setShown(value); return }
    let raf = 0
    const roll = () => {
      const t0 = performance.now()
      const tick = (t: number) => {
        const k = Math.max(0, Math.min(1, (t - t0) / ms))
        const v = k === 1 ? value : start + (value - start) * (1 - Math.pow(1 - k, 3))
        from.current = shownBalance.last = v; setShown(v)
        if (k < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    if (document.body.classList.contains('busy')) addEventListener(IDLE, roll, { once: true }); else roll()
    return () => { cancelAnimationFrame(raf); removeEventListener(IDLE, roll) }
  }, [value, ms])
  return shown
}
const IDLE = 'hagi-idle'

export function Progress({ title, task, doneText, onClose }: { title: string; task: (step: Step) => Promise<void>; doneText?: string; onClose: () => void }) {
  const [steps, setSteps] = useState<string[]>([])
  const [state, setState] = useState<'run' | 'done' | 'error'>('run')
  const [error, setError] = useState('')
  const started = useRef(false)
  const [ask, setAsk] = useState<{ why: string; answer: (ok: boolean) => void } | null>(null)
  useEffect(() => {
    onRelayerDown(why => new Promise(resolve => setAsk({ why, answer: ok => { setAsk(null); resolve(ok) } })))
    return () => onRelayerDown(null)
  }, [])
  useEffect(() => {
    document.body.classList.add('busy')
    return () => { document.body.classList.remove('busy'); dispatchEvent(new Event(IDLE)) }
  }, [])
  useEffect(() => {
    if (started.current) return
    started.current = true
    task(l => setSteps(s => (s[s.length - 1] === l ? s : [...s, l]))).then(
      () => { setState('done'); setTimeout(onClose, 1800) },
      e => { setError(friendly(e)); setState('error') },
    )
  }, [task, onClose])
  // On a phone the work runs quietly in a small pill at the top. The full window only appears if something needs the user.
  const [phone] = useState(() => matchMedia('(max-width: 700px)').matches)
  if (phone && !ask && state !== 'error') {
    const last = steps[steps.length - 1]
    return (
      <div className={'bgjob' + (state === 'done' ? ' ok' : '')} role="status" aria-live="polite">
        <span className={'bgjob-dot' + (state === 'done' ? ' ok' : '')}>{state === 'done' ? <Icon name="check" size={14} /> : <i />}</span>
        <span className="bgjob-t"><b>{state === 'done' ? (doneText ?? 'Done.') : title}</b>{state !== 'done' && last && <em>{last}</em>}</span>
      </div>
    )
  }
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className={'loader ' + (state === 'done' ? 'ok' : state === 'error' ? 'still' : '')}>
          <svg width="56" height="56" viewBox="0 0 100 100" aria-hidden>
            <path className="l1" d={LEAF} fill="#1b2140" /><path className="l2" d={LEAF} fill="#1b2140" transform="translate(100,0) scale(-1,1)" /><path className="l3" d={LEAF} fill="#1b2140" transform="translate(0,100) scale(1,-1)" />
            <rect className="lb" x="54" y="54" width="42" height="42" fill={state === 'error' ? '#b0a7b8' : '#566eba'} />
          </svg>
        </div>
        <h3>{ask ? 'Private sending is unavailable' : state === 'done' ? (doneText ?? 'Done.') : state === 'error' ? 'That didn’t go through' : title}</h3>
        <p className="muted">{ask ? 'The relayer that hides your wallet isn’t working right now. You can still send this from your own wallet, but your address will be visible on the transaction.' : state === 'done' ? 'Your balance has been updated.' : state === 'error' ? error : 'Please keep this tab open.'}</p>
        {steps.length > 0 && <ol className="steps">{steps.map((t, i) => <li key={t} className={i < steps.length - 1 || state === 'done' ? 'd' : state === 'error' ? '' : 'a'}><i />{t}</li>)}</ol>}
        {ask && <div className="askrow"><button className="btn" onClick={() => ask.answer(false)}>Stop, keep it private</button><button className="btn o" onClick={() => ask.answer(true)}>Send from my wallet</button></div>}
        {state === 'error' && <button className="btn" onClick={onClose}>Close</button>}
      </div>
    </div>
  )
}

export function Visibility({ pub, priv }: { pub: string; priv?: string }) {
  return (
    <div className="vis">
      <div><i className="a" /><span><b>Others can see</b> {pub}</span></div>
      {priv && <div><i className="b" /><span><b>Stays private</b> {priv}</span></div>}
    </div>
  )
}
