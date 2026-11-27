import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Hex } from 'viem'
import * as engine from '../engine'
import { STOCKS, asInput, fmt } from '../data'
import { confirmSpend } from '../confirm'
import { hashParam } from '../nav'
import { useStore } from '../store'
import { AmountField, Card, Censor, Icon, NeedAccount, TokenIcon, TokenPicker, useCountUp, type Run } from '../ui'

const amt = (sym: string, n: number) => fmt(n, sym === 'USDG' ? 2 : 4) + ' ' + sym
const tweet = (link: string) => 'https://x.com/intent/post?text=' + encodeURIComponent('I just dropped some stocks on Hagi. First come, first served.\n\n' + link)

/** The Drop mode of Send: split a pot into random slices behind one link. */
export function DropMaker({ run }: { run: Run }) {
  const { s, api } = useStore()
  // Drops are stocks only. Start on the stock you hold the most of.
  const options = STOCKS.map(t => t.symbol)
  const [sym, setSym] = useState(() => options.slice().sort((a, b) => (s.shielded[b] ?? 0) - (s.shielded[a] ?? 0))[0])
  const [amtS, setAmt] = useState('')
  const [count, setCount] = useState(5)
  const [msg, setMsg] = useState('')
  const [made, setMade] = useState<{ link: string; drop: engine.Drop } | null>(null)
  const [mine, setMine] = useState<engine.Drop[]>([])
  const n = parseFloat(amtS) || 0
  const have = s.shielded[sym] ?? 0
  const ready = !!(s.wallet && s.hagiAddress)
  useEffect(() => { if (ready) setMine(engine.myDrops()) }, [ready, made])

  if (made) return <DropMade link={made.link} drop={made.drop} onAgain={() => { setMade(null); setAmt(''); setMsg('') }} />
  return <>
    <AmountField label="Total in the drop" value={amtS} onChange={setAmt} hint={<>You have {fmt(have, sym === 'USDG' ? 2 : 4)} {sym}</>} onMax={() => setAmt(asInput(have))}
      right={<TokenPicker value={sym} onChange={setSym} options={options} balances={s.shielded} />} />
    <div className="fld"><span className="fl">How many people can grab a slice</span>
      <div className="dcount">
        <button className="chip line" disabled={count <= 2} onClick={() => setCount(c => Math.max(2, c - 1))} aria-label="Fewer">−</button>
        <b>{count}</b>
        <button className="chip line" disabled={count >= engine.DROP_MAX} onClick={() => setCount(c => Math.min(engine.DROP_MAX, c + 1))} aria-label="More">+</button>
        <span className="muted">Slices are random sizes. Up to {engine.DROP_MAX}.</span>
      </div></div>
    <div className="fld"><span className="fl">Message (optional)</span><input className="txt" maxLength={80} placeholder="gm. first come, first served" value={msg} onChange={e => setMsg(e.target.value)} aria-label="Message" /></div>
    {!ready ? <NeedAccount /> : <button className="btn" disabled={n <= 0 || n > have} onClick={() => run('Making your drop', async step => {
      await confirmSpend(step)
      const r = await engine.createDrop(sym, n, count, msg, step)
      api.log({ kind: 'send', title: `Made a drop · ${count} slices`, detail: amt(sym, n), isPrivate: true })
      setMade(r); await api.refresh()
    }, 'Your drop is ready. Share the link.')}>{n <= 0 ? 'Enter an amount' : n > have ? 'Not enough ' + sym : `Make a drop of ${fmt(n, sym === 'USDG' ? 2 : 4)} ${sym}`}</button>}
    {mine.length > 0 && <div className="dmine">
      <span className="fl">Your drops</span>
      {mine.slice(0, 6).map(d => <MyDrop key={d.secret} d={d} run={run} />)}
    </div>}
  </>
}

function MyDrop({ d, run }: { d: engine.Drop; run: Run }) {
  const { api } = useStore()
  const [st, setSt] = useState<engine.DropState | null>(null)
  const [copied, setCopied] = useState(false)
  const load = () => engine.readDrop(d.secret).then(setSt).catch(() => {})
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const copy = async () => { try { await navigator.clipboard.writeText(engine.dropLink(d)); setCopied(true); setTimeout(() => setCopied(false), 1400) } catch { /* blocked */ } }
  return <div className="drow">
    <TokenIcon symbol={d.symbol} size={34} />
    <div className="g"><b>{amt(d.symbol, d.total)}</b><span>{st ? (st.left ? `${st.left} of ${st.slices} slices left` : st.slices ? 'All taken' : 'Being made') : 'Checking…'}</span></div>
    <button className="chip line" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
    {st && st.left > 0 && <button className="chip line" onClick={() => run('Taking back what’s left', async step => {
      const got = await engine.reclaimDrop(d.secret, step)
      api.log({ kind: 'receive', title: 'Took back a drop', detail: amt(d.symbol, got), isPrivate: true })
      await api.refresh(); await load()
    }, 'Back in your private balance.')}>Take back</button>}
  </div>
}

function DropMade({ link, drop, onAgain }: { link: string; drop: engine.Drop; onAgain: () => void }) {
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => { QRCode.toDataURL(link, { margin: 1, width: 440, color: { dark: '#1b2140', light: '#ffffff' } }).then(setQr) }, [link])
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* blocked */ } }
  return <div className="recv dmade">
    {qr && <img src={qr} alt="QR code of your drop link" width={200} height={200} />}
    <span className="fl">{drop.count} random slices of {amt(drop.symbol, drop.total)}. Whoever opens the link first gets one.</span>
    <div className="rcv-acts"><button className="btn" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Copied' : 'Copy link'}</button><a className="btn o" href={tweet(link)} target="_blank" rel="noopener noreferrer">Post on X</a></div>
    <p className="gnote">Anyone with the link can grab a slice, so share it where you want. Slices nobody takes can be taken back from Your drops.</p>
    <button className="link center" onClick={onAgain}>Make another drop</button>
  </div>
}

/** #/drop/<secret>: the page someone lands on from a drop link. */
export function DropPage({ run }: { run: Run }) {
  const { s, api } = useStore()
  const secret = ('0x' + (location.hash.split('?')[0].split('/')[2] ?? '')) as Hex
  const valid = /^0x[0-9a-f]{64}$/i.test(secret)
  const msg = hashParam('m')
  const [st, setSt] = useState<engine.DropState | null>(null)
  const [got, setGot] = useState<{ symbol: string; amount: number } | null>(null)
  const ready = !!(s.wallet && s.hagiAddress)
  useEffect(() => { if (valid && ready) { setGot(engine.claimedFromDrop(secret)); void engine.readDrop(secret).then(setSt).catch(() => {}) } }, [valid, ready, secret])
  const shown = useCountUp(got?.amount ?? 0, 1100)
  if (!valid) return <div className="wrap c"><Card><div className="empty"><b>This drop link is broken</b><p>Ask whoever shared it for the full link.</p></div></Card></div>

  return <div className="wrap c dpage">
    <Card className="dcard">
      <div className="dhero"><Icon name="gift" size={34} /></div>
      <h2 className="dtitle">{got ? 'You got a slice' : 'Someone dropped you stocks'}</h2>
      {msg && <p className="dmsg">“{msg}”</p>}
      {got ? <div className="dgot"><TokenIcon symbol={got.symbol} size={64} /><b>{fmt(shown, got.symbol === 'USDG' ? 2 : 4)} {got.symbol}</b><span>It’s in your private balance. Nobody can see who sent it or who took it.</span></div>
        : <div className="dgot">{st?.symbol && <TokenIcon symbol={st.symbol} size={56} />}<Censor seed={secret} cols={9} cell={14} /><span>{!ready ? 'Sign in to grab your slice. It takes a few seconds.' : !st ? 'Checking the drop…' : st.left ? `${st.left} of ${st.slices} slices of ${st.symbol} left. Each one is a random size.` : st.slices ? 'Every slice has been taken.' : 'This drop is still being made, or it doesn’t exist.'}</span></div>}
      {got ? <a className="btn" href="#/portfolio">See my balance</a>
        : !ready ? <NeedAccount />
        : <button className="btn" disabled={!st?.left} onClick={() => run('Grabbing your slice', async step => {
          const r = await engine.claimDrop(secret, step)
          api.log({ kind: 'receive', title: 'Grabbed a drop', detail: amt(r.symbol, r.amount), isPrivate: true })
          setGot(r); await api.refresh()
        }, 'Got it. It’s in your private balance.')}>{st && !st.left ? 'All gone' : 'Grab my slice'}</button>}
    </Card>
  </div>
}
