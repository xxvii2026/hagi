import { useState } from 'react'
import { fmt, token } from '../data'
import { go } from '../nav'
import { useStore } from '../store'
import { Censor, Icon, Mark, TokenIcon, type IconName } from '../ui'

/** A number that sits behind the pixel censor and clears when the card is peeked at. */
function Peek({ text, seed, cols = 7, cell = 9, onDark = false }: { text: string; seed: string; cols?: number; cell?: number; onDark?: boolean }) {
  return <span className="pk"><span className="pk-c"><Censor seed={seed} cols={cols} cell={cell} onDark={onDark} /></span><span className="pk-n">{text}</span></span>
}

const DEMO = [['USDG', 4210], ['TSLA', 12.4], ['NVDA', 18], ['AAPL', 7.25]] as const
const FEATURES: [IconName, string, string][] = [
  ['down', 'Shield', 'Move stock tokens and USDG from your wallet into a shared vault. From then on your balance is yours to know.'],
  ['swap', 'Swap', 'Trade straight out of the vault through Uniswap and back in, without your holdings ever sitting in a public wallet.'],
  ['basket', 'Baskets', 'Buy a ready-made mix of stocks in one transaction, or build your own and share it.'],
  ['right', 'Send', 'Pay another Hagi address. The amount and the recipient stay between the two of you.'],
]
const PRIVATE = ['How much you hold', 'Which stocks you hold', 'Who you send to, and how much', 'Which vault receipt paid for a swap']
const VISIBLE = ['Deposits going into the vault', 'Withdrawals coming out', 'The size of a swap on Uniswap', 'The wallet that pays the gas']

export function Landing() {
  const { s } = useStore()
  const [peek, setPeek] = useState(false)
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches
  const open = () => go('portfolio')
  const popular = [...s.baskets].sort((a, b) => b.buyers - a.buyers).slice(0, 4)
  return (
    <div className="land">
      <section className="lhero">
        <div className="lghost"><Mark size={760} leaf="#222950" block="#2d3769" /></div>
        <div className="lin">
          <div className="lcopy">
            <span className="eyebrow"><i />Live on Robinhood Chain Testnet</span>
            <h1><span>Stocks,</span><br />off the record.</h1>
            <p>Hold, swap and send stock tokens without putting your portfolio on display. Your balance stays in the vault, where only you can read it.</p>
            <div className="lcta"><button className="btn light" onClick={open}>Open the app</button><a className="btn ghost" href="#see">See what stays private</a></div>
          </div>
          <div className={'lcard ' + (peek ? 'peek' : '')} onMouseEnter={() => !touch && setPeek(true)} onMouseLeave={() => !touch && setPeek(false)} onClick={() => touch && setPeek(p => !p)} role="button" tabIndex={0} onFocus={() => !touch && setPeek(true)} onBlur={() => !touch && setPeek(false)} aria-label="Example portfolio. Hover or tap to reveal the amounts" onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPeek(p => !p) } }}>
            <div className="lc-top"><span>Your private balance</span><span className="lc-hint">{peek ? 'Only you see this' : touch ? 'Tap to peek' : 'Hover to peek'}</span></div>
            <div className="lc-big"><Peek text="$12,480.34" seed="hero" cols={12} cell={20} /></div>
            {DEMO.map(([k, v]) => (
              <div className="row" key={k}>
                <TokenIcon symbol={k} />
                <div className="g"><b>{token(k).name}</b><span>{k}</span></div>
                <div className="r"><b><Peek text={'$' + fmt(v * token(k).price)} seed={k + 'lv'} /></b><span><Peek text={fmt(v, k === 'USDG' ? 2 : 4) + ' ' + k} seed={k + 'lq'} cell={6} /></span></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lsec">
        <h2><span>Four things,</span> done quietly.</h2>
        <div className="lfeat">{FEATURES.map(([ic, t, p]) => <div className="card" key={t}><span className="ai"><Icon name={ic} size={18} /></span><b>{t}</b><p>{p}</p></div>)}</div>
      </section>

      <section className="lsec" id="see">
        <h2><span>What the chain sees,</span> and what it doesn’t.</h2>
        <p className="lsub">Privacy claims are cheap, so here is the exact line.</p>
        <div className="lsee">
          <div className="card dark"><span className="tagl"><i className="b" />Stays in the vault</span>{PRIVATE.map(t => <div className="li2" key={t}><Censor seed={t} cols={4} cell={7} onDark />{t}</div>)}</div>
          <div className="card"><span className="tagl"><i className="a" />Visible on chain</span>{VISIBLE.map(t => <div className="li2" key={t}><i className="dot" />{t}</div>)}</div>
        </div>
      </section>

      <section className="lsec">
        <div className="bhd"><div><h2><span>Baskets,</span> in one go.</h2><p>Anyone can make one. These are the most bought right now.</p></div><button className="btn o" onClick={() => go('baskets')}>See all baskets</button></div>
        <div className="grid four">{popular.map(b => (
          <div className="card bk" key={b.id}>
            <div className="st">{b.items.slice(0, 4).map(it => <TokenIcon key={it.symbol} symbol={it.symbol} size={34} />)}{b.items.length > 4 && <span className="ti more">+{b.items.length - 4}</span>}</div>
            <div className="bn">{b.name}</div><div className="bm">{b.items.length} stocks · {b.buyers} buyers</div>
            <div className="bf"><span>by {b.creator}</span><button className="chip strong" onClick={() => go('baskets?buy=' + b.id)}>Buy</button></div>
          </div>
        ))}</div>
      </section>

      <section className="lend">
        <Mark size={40} leaf="#ffffff" block="#566eba" />
        <h2><span>Nothing to sign up for.</span><br />Bring a wallet.</h2>
        <p>Hagi is on testnet, so the funds are free and nothing here is real money yet.</p>
        <button className="btn light" onClick={open}>Open the app</button>
      </section>
    </div>
  )
}
