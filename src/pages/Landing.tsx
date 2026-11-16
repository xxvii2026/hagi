import { useEffect, useState } from 'react'
import { FAUCET_URL } from '../chain'
import { TOKENS, fmt, token } from '../data'
import { go, hashParam } from '../nav'
import { useStore } from '../store'
import { Censor, Icon, Mark, TokenIcon, type IconName } from '../ui'

/** A value that shows plainly to its owner and as a pixel censor to everyone else. */
function Peek({ text, seed, cols = 7, cell = 9, onDark = false }: { text: string; seed: string; cols?: number; cell?: number; onDark?: boolean }) {
  return <span className="pk"><span className="pk-c"><Censor seed={seed} cols={cols} cell={cell} onDark={onDark} /></span><span className="pk-n">{text}</span></span>
}
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

const DEMO = [['USDG', 4210], ['TSLA', 12.4], ['NVDA', 18], ['AAPL', 7.25]] as const
// What the owner sees, and whether the chain shows it to everyone else.
const FEED: { icon: IconName; title: string; when: string; amount: string; pub: boolean; note: string }[] = [
  { icon: 'right', title: 'Sent NVDA', when: '1 h ago', amount: '2.0000 NVDA', pub: false, note: 'Amount and recipient hidden' },
  { icon: 'swap', title: 'Swapped USDG for TSLA', when: '3 h ago', amount: '3.1753 TSLA', pub: true, note: 'Swap size is public' },
  { icon: 'basket', title: 'Bought basket: Chip makers', when: 'Yesterday', amount: '900.00 USDG', pub: true, note: 'Basket and size are public' },
  { icon: 'down', title: 'Shielded USDG', when: '2 days ago', amount: '4,000.00 USDG', pub: true, note: 'Deposits are public' },
]
const STEPS: [string, string][] = [
  ['Connect', 'Use the wallet you already have. Sign one free message and your Hagi account exists. The same wallet always recovers it.'],
  ['Shield', 'Move USDG or stock tokens into the vault. This deposit is the last thing the public sees of that money.'],
  ['Trade', 'Swap through Uniswap or buy a whole basket in one transaction, straight out of the vault and back in.'],
  ['Send or leave', 'Pay another Hagi address privately, or unshield to any wallet whenever you want out.'],
]
const FAQ: [string, string][] = [
  ['Is this real money?', 'No. Hagi runs on Robinhood Chain Testnet. The tokens are free test tokens with no value, and right now the app is in demo mode while the contracts are being built.'],
  ['What stays private?', 'Your balance, which stocks you hold, and who you send to and how much. Inside the vault your funds are encrypted receipts that only your key can read.'],
  ['What can other people see?', 'Money going into the vault, money coming out, the size of a swap on Uniswap, and the wallet that pays the gas for a transaction.'],
  ['Has Hagi been audited?', 'No. It is an early testnet build. Do not treat it as safe for real funds until an independent audit is published.'],
  ['Who can move my funds?', 'By design, only a proof made with your own key. The vault is a smart contract with no admin withdrawal.'],
  ['Do I need a new wallet or a seed phrase?', 'No. Your Hagi account is derived from a signature by your existing wallet, so there is nothing new to write down.'],
  ['Can anyone make a basket?', 'Yes. Pick two to eight listed stocks and set the weights. A basket cannot be changed after it is created.'],
]

export function Landing() {
  const { s } = useStore()
  const [me, setMe] = useState(false) // false = viewing as anyone else, so amounts are pixelated
  const open = () => go('portfolio')
  // Navy is the default look. Add ?theme=light to the address to see the light version.
  const navy = hashParam('theme') !== 'light'
  useEffect(() => { document.body.classList.toggle('navy-page', navy); return () => document.body.classList.remove('navy-page') }, [navy])
  const primary = navy ? 'btn light' : 'btn'
  const secondary = navy ? 'btn ghost' : 'btn o'
  const MIXC = navy ? ['#ffffff', '#8696cf', '#566eba', '#b0a7b8', '#c9d1ee', '#3a4a8a', '#7f86ad', '#d9def0'] : ['#1b2140', '#566eba', '#8696cf', '#b0a7b8', '#3a4a8a', '#c9d1ee', '#7f86ad', '#d9def0']
  const popular = [...s.baskets].sort((a, b) => b.buyers - a.buyers).slice(0, 4)
  const Toggle = () => (
    <div className="viewer" role="group" aria-label="Choose whose view to show">
      <span>Viewing as</span>
      <button className={me ? 'on' : ''} onClick={() => setMe(true)}>You</button>
      <button className={!me ? 'on' : ''} onClick={() => setMe(false)}>Anyone else</button>
    </div>
  )
  return (
    <div className={'land2' + (navy ? ' navy' : '')}>
      <section className="h2hero">
        <span className="eyebrow2"><i />Testnet preview on Robinhood Chain</span>
        <h1><span>Stocks,</span> off the record.</h1>
        <p>Hold, swap and send stock tokens without putting your portfolio on display. Your balance sits in a shared vault that only you can read.</p>
        <div className="lcta2"><button className={primary} onClick={open}>Open the app</button><button className={secondary} onClick={() => jump('how')}>How it works</button></div>

        <div className={'mock ' + (me ? 'peek' : '')}>
          <div className="mockbar"><span className="dots"><i /><i /><i /></span><span className="murl">hagi · portfolio</span><Toggle /></div>
          <div className="mockbody">
            <div className="col">
              <div className="card hero">
                <div className="ghost"><Mark size={300} leaf="#252d5a" block="#313c74" /></div>
                <div className="lab"><span>Your private balance</span><span className="addr">hagi1f629…71d0</span></div>
                <div className="big"><Peek text="$12,480.34" seed="hero" cols={12} cell={20} onDark /></div>
                <div className="qas">{(['Shield', 'Unshield', 'Swap', 'Send'] as const).map((t, i) => <span key={t} className={'qa' + (i === 0 ? ' p' : '')}><i><Icon name={(['down', 'up', 'swap', 'right'] as const)[i]} /></i>{t}</span>)}</div>
              </div>
              <div className="card">
                <div className="ch"><span>Your stocks and cash</span></div>
                {DEMO.map(([k, v]) => (
                  <div className="row" key={k}><TokenIcon symbol={k} /><div className="g"><b>{token(k).name}</b><span>{k}</span></div>
                    <div className="r"><b><Peek text={'$' + fmt(v * token(k).price)} seed={k + 'lv'} /></b><span><Peek text={fmt(v, k === 'USDG' ? 2 : 4) + ' ' + k} seed={k + 'lq'} cell={6} /></span></div></div>
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
        </div>
        <span className="demo2">Demo with example data</span>
      </section>

      <section className="strip">
        <span>Stock tokens and USDG on testnet</span>
        <div>{TOKENS.slice(0, 9).map(t => <span className="chip" key={t.symbol}><TokenIcon symbol={t.symbol} size={26} />{t.symbol}</span>)}<span className="chip more2">and more</span></div>
      </section>

      <section className="lsec" id="private">
        <h2><span>One account,</span> two views.</h2>
        <p className="lsub">The same four actions, as you see them and as the chain shows them to everyone else.</p>
        <div className="views">
          <div className="card"><span className="tagl"><i className="b" />What you see</span>
            {FEED.map(f => <div className="row" key={f.title}><span className="ai"><Icon name={f.icon} /></span><div className="g"><b>{f.title}</b><span>{f.when}</span></div><div className="r"><b>{f.amount}</b></div></div>)}
          </div>
          <div className="card dark"><span className="tagl"><i className="a" />What anyone else sees</span>
            {FEED.map(f => <div className="row" key={f.title}><span className="ai"><Icon name={f.icon} /></span><div className="g"><b>{f.pub ? f.title : 'A private transfer'}</b><span>{f.note}</span></div><div className="r"><b>{f.pub ? f.amount : <Censor seed={f.title} cell={7} onDark />}</b></div></div>)}
          </div>
        </div>
        <div className="facts">
          <div><b>Always private</b><span>Your balance, your holdings, your sends</span></div>
          <div><b>Always public</b><span>Deposits, withdrawals, swap sizes, the wallet paying gas</span></div>
          <div><b>Never possible</b><span>Anyone but you moving your funds</span></div>
        </div>
      </section>

      <section className="lsec" id="how">
        <h2><span>From wallet to vault,</span> in four steps.</h2>
        <div className="steps4">{STEPS.map(([t, p], i) => <div className="card" key={t}><span className="stepno">{String(i + 1).padStart(2, '0')}</span><b>{t}</b><p>{p}</p></div>)}</div>
      </section>

      <section className="lsec" id="baskets">
        <div className="bhd"><div><h2><span>Baskets,</span> in one go.</h2><p>Buy a ready-made mix of stocks in a single transaction. Anyone can make one, and nobody can change it afterwards.</p></div><button className={secondary} onClick={() => go('baskets')}>See all baskets</button></div>
        <div className="grid four">{popular.map(b => (
          <div className="card bk" key={b.id}>
            <div className="st">{b.items.slice(0, 4).map(it => <TokenIcon key={it.symbol} symbol={it.symbol} size={34} />)}{b.items.length > 4 && <span className="ti more">+{b.items.length - 4}</span>}</div>
            <div className="bn">{b.name}</div><div className="bm">{b.items.length} stocks · {b.buyers} buyers</div>
            <div className="mixbar sm">{b.items.map((it, i) => <i key={it.symbol} style={{ width: it.weight + '%', background: MIXC[i % 8] }} />)}</div>
            <div className="bf"><span>by {b.creator}</span><button className="chip strong" onClick={() => go('baskets?buy=' + b.id)}>Buy</button></div>
          </div>
        ))}</div>
      </section>

      <section className="lsec">
        <h2><span>Don’t trust us,</span> check it yourself.</h2>
        <div className="checks">
          <a className="card" href="https://github.com/xxvii2026/hagi" target="_blank" rel="noopener noreferrer"><b>Read the code</b><p>Everything is open source, from the app to the contracts as they land.</p><span className="tag">GitHub</span></a>
          <a className="card" href="https://explorer.testnet.chain.robinhood.com" target="_blank" rel="noopener noreferrer"><b>Watch the chain</b><p>Every deposit, swap and withdrawal can be looked up on the public explorer.</p><span className="tag">Explorer</span></a>
          <button className="card" onClick={() => jump('faq')}><b>Read the risks</b><p>Testnet only and not audited. The plain answers are in the questions below.</p><span className="tag">Questions</span></button>
          <a className="card" href={FAUCET_URL} target="_blank" rel="noopener noreferrer"><b>Try it for free</b><p>Get test funds from the faucet and use the whole app without spending anything.</p><span className="tag">Faucet</span></a>
        </div>
      </section>

      <section className="lsec faqsec" id="faq">
        <h2><span>Questions,</span> answered plainly.</h2>
        <div className="faq">{FAQ.map(([q, a], i) => <details key={q} open={i === 0}><summary>{q}<i><Icon name="down" size={16} /></i></summary><p>{a}</p></details>)}</div>
      </section>

      <section className="lend">
        <Mark size={40} leaf="#ffffff" block="#566eba" />
        <h2><span>Nothing to sign up for.</span><br />Bring a wallet.</h2>
        <p>Try it with test money. No email, no waitlist.</p>
        <div className="lcta2"><button className="btn light" onClick={open}>Open the app</button><a className="btn ghost" href={FAUCET_URL} target="_blank" rel="noopener noreferrer">Get test funds</a></div>
        <small>Testnet only. Not audited. Nothing on this page is financial advice, and stock tokens are not shares.</small>
      </section>

      <footer className="bigfoot">
        <div className="bf1"><span className="fm"><Mark size={22} leaf={navy ? '#ffffff' : undefined} /><b>hagi</b></span><p>Stocks, off the record.</p></div>
        <div><b>Product</b><a href="#/portfolio">Portfolio</a><a href="#/swap">Swap</a><a href="#/baskets">Baskets</a><a href="#/send">Send</a></div>
        <div><b>Learn</b><button onClick={() => jump('how')}>How it works</button><button onClick={() => jump('private')}>What’s private</button><button onClick={() => jump('faq')}>Questions</button></div>
        <div><b>More</b><a href="https://github.com/xxvii2026/hagi" target="_blank" rel="noopener noreferrer">GitHub</a><a href={FAUCET_URL} target="_blank" rel="noopener noreferrer">Faucet</a><a href="https://explorer.testnet.chain.robinhood.com" target="_blank" rel="noopener noreferrer">Explorer</a></div>
      </footer>
    </div>
  )
}
