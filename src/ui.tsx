import { useEffect, useState, type ReactNode, type Ref } from 'react'
import { token, fmt, withCommas } from './data'
import { useStore } from './store'

export function Mark({ size = 24, leaf = '#1b2140', block = '#566eba' }: { size?: number; leaf?: string; block?: string }) {
  const p = 'M0 23A23 23 0 0 1 23 0A23 23 0 0 1 46 23V46H23A23 23 0 0 1 0 23Z'
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <path d={p} fill={leaf} /><path d={p} fill={leaf} transform="translate(100,0) scale(-1,1)" /><path d={p} fill={leaf} transform="translate(0,100) scale(1,-1)" />
      <rect x="54" y="54" width="42" height="42" fill={block} />
    </svg>
  )
}

// Placeholder icons stay inside the brand palette until a token has a real logo.
const TINTS = [['#e8ebf7', '#1b2140'], ['#e3e8f9', '#4a61ab'], ['#efecf2', '#6b6177'], ['#1b2140', '#ffffff'], ['#566eba', '#ffffff'], ['#d9def0', '#3a4a8a']]
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/** Shows the token's logo when the token list provides one, otherwise a coloured initial. */
export function TokenIcon({ symbol, size = 40 }: { symbol: string; size?: number }) {
  const t = token(symbol)
  const [bg, fg] = TINTS[hash(symbol) % TINTS.length]
  if (t.logoURI) return <img className="ti" src={t.logoURI} alt={symbol} width={size} height={size} />
  const full = size >= 34
  return <span className="ti" style={{ width: size, height: size, background: bg, color: fg, fontSize: full ? size * 0.25 : size * 0.4, letterSpacing: full ? '-0.02em' : 0 }}>{full ? symbol.slice(0, 4) : symbol[0]}</span>
}

const ICONS = {
  down: 'M10 4v12M5 11l5 5 5-5', up: 'M10 16V4M5 9l5-5 5 5', swap: 'M4 7h11M12 4l3 3-3 3M16 13H5M8 10l-3 3 3 3',
  right: 'M4 10h12M11 5l5 5-5 5', left: 'M16 10H4M9 5l-5 5 5 5', basket: 'M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z',
  copy: 'M7 7h9v9H7zM4 13V4h9', alert: 'M10 5v6M10 14.4v.2', close: 'M5 5l10 10M15 5L5 15', check: 'M4 10.5l4 4 8-9',
} as const
export type IconName = keyof typeof ICONS
/** One drawn icon set with a single line weight, so icons look the same on every device. */
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return <svg className="ic" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICONS[name]} /></svg>
}

/** Pixel censor. Replaces a number with a mosaic when amounts are hidden. */
export function Censor({ seed, cols = 7, cell = 9, onDark = false }: { seed: string; cols?: number; cell?: number; onDark?: boolean }) {
  const pal = onDark ? ['#ffffff', '#566eba', '#8696cf', '#b0a7b8', '#c9d1ee', '#3a4a8a'] : ['#1b2140', '#566eba', '#8696cf', '#b0a7b8', '#d9def0', '#3a4a8a']
  let h = hash(seed)
  const cells = Array.from({ length: cols * 2 }, () => { h = (h * 1103515245 + 12345) >>> 0; return pal[(h >>> 8) % pal.length] })
  return <span className="censor" style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridAutoRows: cell }} aria-label="Hidden">{cells.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
}
export function Amount({ value, seed, prefix = '', digits = 2, cell }: { value: number; seed: string; prefix?: string; digits?: number; cell?: number }) {
  const { s } = useStore()
  return s.hidden ? <Censor seed={seed} cell={cell} /> : <>{prefix}{fmt(value, digits)}</>
}

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={'card ' + className}>{title && <div className="ch"><span>{title}</span>{action}</div>}{children}</section>
}

export function TokenPicker({ value, onChange, options }: { value: string; onChange: (s: string) => void; options: string[] }) {
  return (
    <label className="tp">
      <TokenIcon symbol={value} size={26} />
      <select value={value} onChange={e => onChange(e.target.value)} aria-label="Token">{options.map(o => <option key={o}>{o}</option>)}</select>
    </label>
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
/** Steps shown while a private action is prepared, signed and confirmed. */
const STEPS = ['Preparing your private transaction', 'Confirm in your wallet', 'Waiting for the network']
export function Progress({ title, onDone, doneText }: { title: string; onDone: () => void; doneText?: string }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (step >= STEPS.length) { const t = setTimeout(onDone, 1400); return () => clearTimeout(t) }
    const t = setTimeout(() => setStep(step + 1), step === 0 ? 2200 : 1300)
    return () => clearTimeout(t)
  }, [step, onDone])
  const done = step >= STEPS.length
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className={'loader ' + (done ? 'ok' : '')}>
          <svg width="56" height="56" viewBox="0 0 100 100" aria-hidden>
            <path className="l1" d={LEAF} fill="#1b2140" /><path className="l2" d={LEAF} fill="#1b2140" transform="translate(100,0) scale(-1,1)" /><path className="l3" d={LEAF} fill="#1b2140" transform="translate(0,100) scale(1,-1)" />
            <rect className="lb" x="54" y="54" width="42" height="42" fill="#566eba" />
          </svg>
        </div>
        <h3>{done ? (doneText ?? 'Done.') : title}</h3>
        <p className="muted">{done ? 'Your balance has been updated.' : 'This takes a few seconds. Please keep this tab open.'}</p>
        <ol className="steps">{STEPS.map((t, i) => <li key={t} className={i < step ? 'd' : i === step ? 'a' : ''}><i />{t}</li>)}</ol>
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
