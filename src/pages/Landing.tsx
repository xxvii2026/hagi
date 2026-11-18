import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FAUCET_URL } from '../chain'
import { TOKENS, fmt, token, type Basket } from '../data'
import { go } from '../nav'
import { useStore } from '../store'
import { Censor, Icon, Mark, TokenIcon, type IconName } from '../ui'
import { BasketBuilder, Lens, SwapStory, WalletCheck } from './LandingParts'

/** A value that shows plainly to its owner and as a pixel censor to everyone else. */
function Peek({ text, seed, cols = 7, cell = 9, onDark = false }: { text: string; seed: string; cols?: number; cell?: number; onDark?: boolean }) {
  return <span className="pk"><span className="pk-c"><Censor seed={seed} cols={cols} cell={cell} onDark={onDark} /></span><span className="pk-n">{text}</span></span>
}
const starter = (id: number, name: string, mix: [string, number][]): Basket => ({ id, name, creator: 'Hagi', buyers: 0, created: 0, items: mix.map(([symbol, weight]) => ({ symbol, weight, bps: weight * 100 })) })
const STARTERS = [
  starter(-1, 'All five', [['TSLA', 20], ['AMD', 20], ['AMZN', 20], ['NFLX', 20], ['PLTR', 20]]),
  starter(-2, 'Chips and data', [['AMD', 60], ['PLTR', 40]]),
  starter(-3, 'Screens and carts', [['NFLX', 50], ['AMZN', 50]]),
]
/** Sections fade up a little the first time they scroll into view. */
function useReveal() {
  useEffect(() => {
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const els = [...document.querySelectorAll<HTMLElement>('.land2 .strip, .land2 .lsec, .land2 .lend, .land2 .bigfoot')]
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }), { rootMargin: '0px 0px -12% 0px' })
    els.forEach(el => { el.classList.add('rv'); io.observe(el) })
    return () => { io.disconnect(); els.forEach(el => el.classList.remove('rv', 'in')) }
  }, [])
}
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

// Example figures for the preview only.
const DEMO = [['USDG', 4210, 1], ['TSLA', 12.4, 314.93], ['AMD', 18, 145.1], ['AMZN', 7.25, 241.85]] as const
// What the owner sees, and whether the chain shows it to everyone else.
const FEED: { icon: IconName; title: string; when: string; amount: string; pub: boolean; note: string }[] = [
  { icon: 'right', title: 'Sent AMD', when: '1 h ago', amount: '2.0000 AMD', pub: false, note: 'Amount and recipient hidden' },
  { icon: 'swap', title: 'Swapped USDG for TSLA', when: '3 h ago', amount: '3.1753 TSLA', pub: true, note: 'Swap size is public' },
  { icon: 'basket', title: 'Bought basket: All five', when: 'Yesterday', amount: '900.00 USDG', pub: true, note: 'Basket and size are public' },
  { icon: 'down', title: 'Shielded USDG', when: '2 days ago', amount: '4,000.00 USDG', pub: true, note: 'Deposits are public' },
]
const FAQ: [string, string][] = [
  ['Is this real money?', 'No. Hagi runs on Robinhood Chain Testnet. The tokens are free test tokens with no value.'],
  ['Has Hagi been audited?', 'No. It is an early testnet build. Do not treat it as safe for real funds until an independent audit is published.'],
  ['Who can move my funds?', 'By design, only a proof made with your own key. The vault is a smart contract with no admin withdrawal.'],
  ['Do I need a new wallet or a seed phrase?', 'No. Your Hagi account is derived from a signature by your existing wallet, so there is nothing new to write down.'],
  ['Can anyone make a basket?', 'Yes. Pick two to eight listed stocks and set the weights. A basket cannot be changed after it is created.'],
]

export function Landing() {
  const { s } = useStore()
  const [me, setMe] = useState(true) // true = viewing as you, so amounts are readable
  // On a phone the preview flips between the two views by itself until the visitor takes over.
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (touched || !matchMedia('(max-width: 700px)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setMe(v => !v), 2800)
    return () => clearInterval(t)
  }, [touched])
  const pick = (v: boolean) => { setTouched(true); setMe(v) }
  // A floating button on phones, shown between the hero and the closing block.
  const [cta, setCta] = useState(false)
  useEffect(() => {
    const f = () => {
      const end = document.querySelector('.lend')?.getBoundingClientRect().top ?? Infinity
      // Step aside while the basket painter is on screen, so it doesn't cover the painter's own button.
      const bb = document.querySelector('.bb')?.getBoundingClientRect()
      const painting = !!bb && bb.top < innerHeight && bb.bottom > 0
      setCta(scrollY > 620 && end > innerHeight * 0.85 && !painting)
    }
    f(); addEventListener('scroll', f, { passive: true }); return () => removeEventListener('scroll', f)
  }, [])
  const open = () => go('portfolio')
  const navy = true // the landing page is navy; the app itself stays light
  useEffect(() => { document.body.classList.toggle('navy-page', navy); return () => document.body.classList.remove('navy-page') }, [navy])
  const primary = navy ? 'btn light' : 'btn'
  const secondary = navy ? 'btn ghost' : 'btn o'
  const MIXC = navy ? ['#ffffff', '#8696cf', '#566eba', '#b0a7b8', '#c9d1ee', '#3a4a8a', '#7f86ad', '#d9def0'] : ['#1b2140', '#566eba', '#8696cf', '#b0a7b8', '#3a4a8a', '#c9d1ee', '#7f86ad', '#d9def0']
  // The live list comes from the chain. Until it loads, or if the chain can't be reached, show the three starter baskets.
  const live = s.baskets.length > 0
  const popular = live ? [...s.baskets].sort((a, b) => b.buyers - a.buyers).slice(0, 4) : STARTERS
  useReveal()
  const Toggle = () => (
    <div className="viewer" role="group" aria-label="Choose whose view to show">
      <span>Viewing as</span>
      <button className={me ? 'on' : ''} onClick={() => pick(true)}>You</button>
      <button className={!me ? 'on' : ''} onClick={() => pick(false)}>Anyone else</button>
    </div>
  )
  // The preview's contents. Rendered twice: once as is, and once inside the lens, always readable.
  const body = (
          <div className="mockbody">
            <div className="col">
              <div className="card hero">
                <div className="ghost"><Mark size={300} leaf="#252d5a" block="#313c74" /></div>
                <div className="lab"><span>Your private balance</span><span className="addr">hagi1f629…71d0</span></div>
                <div className="big"><Peek text="$12,480.34" seed="hero" cols={12} cell={20} onDark /></div>
                <div className="qas">{(['Swap', 'Send'] as const).map((t, i) => <span key={t} className="qa"><i><Icon name={(['swap', 'right'] as const)[i]} /></i>{t}</span>)}</div>
              </div>
              <div className="card">
                <div className="ch"><span>Your stocks and cash</span></div>
                {DEMO.map(([k, v, p]) => (
                  <div className="row" key={k}><TokenIcon symbol={k} /><div className="g"><b>{token(k).name}</b><span>{k}</span></div>
                    <div className="r"><b><Peek text={'$' + fmt(v * p)} seed={k + 'lv'} /></b><span><Peek text={fmt(v, k === 'USDG' ? 2 : 4) + ' ' + k} seed={k + 'lq'} cell={6} /></span></div></div>
                ))}
              </div>
            </div>
            <div className="col">
              <div className="card">
                <div className="ch"><span>Recent activity</span></div>
                {FEED.map(f => (
                  <div className="row" key={f.title}><span className="ai"><Icon name={f.icon} /></span><div className="g"><b>{f.title}</b><span>{f.when}</span></div>
                    <div className="r"><b>{f.pub ? f.amount : <Peek text={f.amount} seed={f.title} cell={7} />}</b></div></div>
                ))}
              </div>
              <div className="card note2"><span className="tagl"><i className={me ? 'b' : 'a'} />{me ? 'Your view' : 'The public view'}</span><p>{me ? 'This is what you see when you open Hagi. Every number is readable, because your key decrypts it.' : 'This is what the same account looks like to anyone else. Balances, holdings and sends are unreadable.'}</p></div>
            </div>
          </div>
  )
  return (
    <div className={'land2' + (navy ? ' navy' : '')}>
      <section className="h2hero">
        <h1><span>Stocks,</span> off the record.</h1>
        <p>Hold, swap and send stock tokens without putting your portfolio on display. Your balance sits in a shared vault that only you can read.</p>
        <div className="lcta2"><button className={primary} onClick={open}>Open the app</button><button className={secondary} onClick={() => jump('private')}>See what stays private</button></div>

        <div className={'mock ' + (me ? 'peek' : '')}>
          <div className="mockbar"><Toggle /></div>
          <Lens active={!me} reveal={body}>{body}</Lens>
        </div>
      </section>

      <section className="strip">
        <span>Stock tokens and USDG on testnet</span>
        <div>{TOKENS.map(t => <span className="chip" key={t.symbol}><TokenIcon symbol={t.symbol} size={26} />{t.symbol}</span>)}</div>
      </section>

      <WalletCheck />

      <SwapStory />

      <section className="lsec" id="private">
        <h2><span>One account,</span> two views.</h2>
        <p className="lsub">Flip the switch in the preview to see both. This is the short version.</p>
        <div className="facts">
          <div><i><Icon name="lock" size={20} /></i><b>Always private</b><span>Your balance, which stocks you hold, and who you send to and how much.</span></div>
          <div><i><Icon name="eye" size={20} /></i><b>Always public</b><span>Money going into the vault, money coming out, and the size of a swap.</span></div>
          <div><i><Icon name="shield" size={20} /></i><b>Never possible</b><span>Anyone but you moving your funds. The vault has no admin withdrawal.</span></div>
        </div>
      </section>

      <section className="lsec" id="baskets">
        <div className="bhd"><div><h2><span>Baskets,</span> in one go.</h2><p>Buy a ready-made mix of stocks in a single transaction. Anyone can make one, and nobody can change it afterwards.</p></div><button className={secondary} onClick={() => go('baskets')}>See all baskets</button></div>
        <BasketBuilder />
        <div className="grid four">{popular.map(b => (
          <div className="card bk" key={b.id}>
            <div className="st">{b.items.slice(0, 4).map(it => <TokenIcon key={it.symbol} symbol={it.symbol} size={34} />)}{b.items.length > 4 && <span className="ti more">+{b.items.length - 4}</span>}</div>
            <div className="bn">{b.name}</div><div className="bm">{b.items.length} stocks{live ? ' · ' + b.buyers + ' buyers' : ''}</div>
            <div className="mixbar sm">{b.items.map((it, i) => <i key={it.symbol} style={{ width: it.weight + '%', background: MIXC[i % 8] }} />)}</div>
            <div className="bf"><span>{live ? 'by ' + b.creator : 'Starter basket'}</span><button className="chip strong" onClick={() => go(live ? 'baskets?buy=' + b.id : 'baskets')}>Buy</button></div>
          </div>
        ))}</div>
      </section>

      <section className="lsec faqsec" id="faq">
        <h2><span>Questions,</span> answered plainly.</h2>
        <div className="faq">{FAQ.map(([q, a], i) => <details key={q} open={i === 0}><summary>{q}<i><Icon name="chevron" size={16} /></i></summary><p>{a}</p></details>)}</div>
      </section>

      <section className="lend">
        <Mark size={40} leaf="#ffffff" block="#566eba" />
        <h2><span>Nothing to sign up for.</span><br />Bring a wallet.</h2>
        <p>Try it with test money. No email, no waitlist.</p>
        <div className="lcta2"><button className="btn light" onClick={open}>Open the app</button><a className="btn ghost" href={FAUCET_URL} target="_blank" rel="noopener noreferrer">Get test funds</a></div>
        <small>Testnet only. Not audited. Nothing on this page is financial advice, and stock tokens are not shares.</small>
      </section>

      {/* Rendered on the body so it stays pinned to the screen, whatever the page around it is doing. */}
      {createPortal(<div className={'mcta' + (cta ? ' on' : '')} aria-hidden={!cta}><button className="btn light" tabIndex={cta ? 0 : -1} onClick={open}>Open the app</button></div>, document.body)}

      <footer className="bigfoot">
        <div className="bf1"><span className="fm"><Mark size={22} leaf={navy ? '#ffffff' : undefined} /><b>hagi</b></span><p>Stocks, off the record.</p></div>
        <div><b>Product</b><a href="#/portfolio">Portfolio</a><a href="#/swap">Swap</a><a href="#/baskets">Baskets</a><a href="#/send">Send</a></div>
        <div><b>Learn</b><a href="#/docs">Docs</a><button onClick={() => jump('private')}>What’s private</button><button onClick={() => jump('faq')}>Questions</button></div>
        <div><b>More</b><a href="https://github.com/xxvii2026/hagi" target="_blank" rel="noopener noreferrer">GitHub</a><a href={FAUCET_URL} target="_blank" rel="noopener noreferrer">Faucet</a><a href="https://explorer.testnet.chain.robinhood.com" target="_blank" rel="noopener noreferrer">Explorer</a></div>
      </footer>
    </div>
  )
}
