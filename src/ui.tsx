import { useEffect, useState, type ReactNode, type Ref } from 'react'
import { token, fmt } from './data'
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

const TINTS = [['#e3f1ea', '#2f7a55'], ['#fbe6e6', '#b33a3a'], ['#e8f3dc', '#4c7a1c'], ['#ececf0', '#33364a'], ['#e6ecfb', '#3a55b3'], ['#fdebe0', '#b3562a'], ['#e2f0fa', '#256a9c'], ['#fdf3d9', '#96700f']]
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/** Shows the token's logo when the token list provides one, otherwise a coloured initial. */
export function TokenIcon({ symbol, size = 40 }: { symbol: string; size?: number }) {
  const t = token(symbol)
  const [bg, fg] = TINTS[hash(symbol) % TINTS.length]
  if (t.logoURI) return <img className="ti" src={t.logoURI} alt={symbol} width={size} height={size} />
  return <span className="ti" style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.36 }}>{symbol[0]}</span>
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
        <input ref={inputRef} className="num" inputMode="decimal" placeholder="0" value={value} readOnly={readOnly} onChange={e => onChange?.(e.target.value.replace(/[^0-9.]/g, ''))} aria-label={label} />
        {right}
      </div>
      <div className="hint"><span>{hint}</span>{onMax && <button className="tag" onClick={onMax}>Max</button>}</div>
    </div>
  )
}

/** Steps shown while a private action is prepared, signed and confirmed. */
const STEPS = ['Preparing your private transaction', 'Confirm in your wallet', 'Waiting for the network']
export function Progress({ title, onDone }: { title: string; onDone: () => void }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (step >= STEPS.length) { const t = setTimeout(onDone, 900); return () => clearTimeout(t) }
    const t = setTimeout(() => setStep(step + 1), step === 0 ? 2200 : 1300)
    return () => clearTimeout(t)
  }, [step, onDone])
  const done = step >= STEPS.length
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className={'spin ' + (done ? 'ok' : '')}><Mark size={34} /></div>
        <h3>{done ? 'Done' : title}</h3>
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
