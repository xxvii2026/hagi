import { useEffect, useState, type ReactNode } from 'react'
import { CFG, FAUCET_URL } from '../chain'
import { Icon } from '../ui'

/* ---------- small building blocks ---------- */

const H = ({ children }: { children: ReactNode }) => <h3>{children}</h3>
const P = ({ children }: { children: ReactNode }) => <p>{children}</p>
const Note = ({ kind = 'info', title, children }: { kind?: 'info' | 'warn'; title: string; children: ReactNode }) => (
  <div className={'dnote ' + kind}><b>{title}</b><span>{children}</span></div>
)
const Steps = ({ items }: { items: ReactNode[] }) => <ol className="dsteps">{items.map((it, i) => <li key={i}><i>{i + 1}</i><span>{it}</span></li>)}</ol>
const List = ({ items }: { items: ReactNode[] }) => <ul className="dlist">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
const To = ({ slug, children }: { slug: string; children: ReactNode }) => <a className="dlink" href={'#/docs/' + slug}>{children}</a>
const Out = ({ href, children }: { href: string; children: ReactNode }) => <a className="dlink" href={href} target="_blank" rel="noopener noreferrer">{children}</a>

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className={'dtable' + (head.length > 2 ? ' three' : '')}><table>
      <thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table></div>
  )
}

/** An address or value with a copy button and, for addresses, a link to the explorer. */
function Addr({ value, link = true }: { value: string; link?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1400) } catch { /* clipboard blocked */ } }
  return (
    <span className="daddr">
      <code>{value}</code>
      <button onClick={copy} aria-label="Copy">{copied ? <Icon name="check" size={14} /> : <Icon name="copy" size={14} />}</button>
      {link && <a href={CFG.explorer + '/address/' + value} target="_blank" rel="noopener noreferrer" aria-label="Open in explorer"><Icon name="right" size={14} /></a>}
    </span>
  )
}

/** How funds move: wallet, vault, pools, with the relayer carrying private transactions. */
function Flow() {
  return (
    <div className="dflow" role="img" aria-label="Your wallet shields funds into the Hagi vault. Swaps happen between the vault and the pools. A relayer sends private transactions to the chain.">
      <div className="fbox"><b>Your wallet</b><span>Public, like any wallet</span></div>
      <div className="farr"><span>Shield</span><i /><span>Unshield</span></div>
      <div className="fbox main"><b>Hagi vault</b><span>Everyone’s funds as encrypted receipts</span><em>Private swaps and sends happen in here</em></div>
      <div className="farr"><span>Swap</span><i /></div>
      <div className="fbox"><b>Pools</b><span>Stock tokens against USDG</span></div>
      <div className="frel"><b>Relayer</b><span>Sends your private transactions, so your wallet is not on them</span></div>
    </div>
  )
}

/* ---------- the pages ---------- */

type Page = { slug: string; group: string; title: string; lede: string; body: ReactNode }

// Kept next to the contracts so the two never drift: contracts/deployments/testnet.json
const DEPLOYED = {
  verifier: '0x75bfE257C0880Aa64C61Cc3DD7B083d7a65606a9',
  adapter: '0x1eA488F23337D63EFF469Ea6230eEA4d39Dbb1a6',
  deployer: '0xd16863014B75dfA19149E8db6078B17525021594',
  relayer: '0x56077D89f3179f061C9F436d2dF7623625898891',
}

const PAGES: Page[] = [
  {
    slug: 'overview', group: 'Start here', title: 'What Hagi is',
    lede: 'Hagi lets you hold, swap and send stock tokens on Robinhood Chain without putting your portfolio on display.',
    body: <>
      <P>On a public chain, anyone who knows your wallet can see what you hold, what you bought and when. Hagi fixes that for stock tokens. You move your tokens into a shared vault, and from then on your balance is something only you can read.</P>
      <H>What you can do</H>
      <List items={[
        <><b>Shield.</b> Move USDG or stock tokens from your wallet into the vault.</>,
        <><b>Swap privately.</b> Trade one token for another without leaving the vault.</>,
        <><b>Send privately.</b> Pay another Hagi user. The chain shows neither the amount nor who got it.</>,
        <><b>Buy a basket.</b> Get a ready-made mix of stocks in one transaction.</>,
        <><b>Unshield.</b> Take funds out of the vault, back to your wallet.</>,
      ]} />
      <H>How the pieces fit</H>
      <Flow />
      <Note title="This is a testnet build">Hagi runs on Robinhood Chain Testnet. The tokens are free test tokens with no value, and the code has not been audited. Read <To slug="risks">Risks and status</To> before you rely on it for anything.</Note>
      <H>Where to go next</H>
      <List items={[
        <>New here? Start with <To slug="setup">Get set up</To>.</>,
        <>Want the honest version of what is hidden? See <To slug="private">What’s private and what isn’t</To>.</>,
        <>Curious how it works? See <To slug="how">How it works</To>.</>,
      ]} />
    </>,
  },
  {
    slug: 'private', group: 'Start here', title: 'What’s private and what isn’t',
    lede: 'Hagi is private in specific ways. This page lists them, action by action, so there are no surprises.',
    body: <>
      <H>The short version</H>
      <List items={[
        <><b>Always private:</b> your balance, which stocks you hold, and who you send to and how much.</>,
        <><b>Always public:</b> money going into the vault, money coming out, and the size of a swap.</>,
        <><b>Never possible:</b> anyone but you moving your funds.</>,
      ]} />
      <H>Action by action</H>
      <Table head={['Action', 'Others can see', 'Stays private']} rows={[
        ['Shield', 'Your wallet, the token and the amount', 'Everything you do with it afterwards'],
        ['Unshield', 'The receiving wallet, the token and the amount', 'What is left in your balance'],
        ['Private swap', 'That a swap happened, which two tokens, and the amounts', 'Who made the swap'],
        ['Private send', 'That a private transaction happened', 'The sender, the recipient, the token and the amount'],
        ['Buy a basket', 'Which basket was bought and how much USDG went in', 'Who bought it'],
        ['Create a basket', 'Your wallet and the basket’s recipe', 'Nothing. Creating a basket is a normal public transaction'],
        ['Claim test USDG', 'Your wallet and the amount', 'Nothing. The faucet is a normal public transaction'],
      ]} />
      <H>Why swaps and sends don’t show your wallet</H>
      <P>Private swaps, sends, basket buys and unshields are sent to the chain by a relayer, with a proof that the action is valid. Your wallet does not sign the transaction, so it does not appear on it. More on this in <To slug="how">How it works</To>.</P>
      <H>Ways privacy can still leak</H>
      <P>The vault hides the link between a deposit and what happens later. That link can still be guessed if you make it easy.</P>
      <List items={[
        <><b>Odd amounts.</b> If you shield 1,234.56 USDG and the same odd amount is unshielded a minute later, people can connect the two. Round amounts blend in better.</>,
        <><b>Timing.</b> Shielding and unshielding back to back is easier to link than leaving funds in the vault for a while.</>,
        <><b>A small crowd.</b> The fewer people using the vault, the easier it is to tell them apart. Privacy gets stronger as more people use it.</>,
        <><b>The relayer being down.</b> If the relayer can’t be reached, Hagi asks before sending from your own wallet. If you choose that, your address shows on that transaction.</>,
      ]} />
      <Note kind="warn" title="We don’t call Hagi anonymous">Hagi keeps your balance and your counterparties private. It does not make you untraceable, and it should not be used as if it does.</Note>
    </>,
  },
  {
    slug: 'setup', group: 'Start here', title: 'Get set up',
    lede: 'Sign in with a passkey or a wallet, claim some test USDG, and make it private. It takes about a minute.',
    body: <>
      <H>With a passkey (the easy way)</H>
      <Steps items={[
        <><b>Open Hagi.</b> On a phone, add it to your home screen when Hagi offers, so it opens full screen like an app.</>,
        <><b>Create your account.</b> Tap Sign in, then Create my Hagi account, and confirm with Face ID, your fingerprint or your screen lock. No wallet, email or seed phrase.</>,
        <><b>Get test USDG.</b> Choose “Claim test USDG” to get 5,000. Each account can claim once, and Hagi sends a little testnet ETH for the gas.</>,
        <><b>Make it private.</b> Tap Make private. Your private balance appears a few seconds later.</>,
      ]} />
      <H>With a wallet</H>
      <Steps items={[
        <><b>Connect it.</b> Any browser wallet such as MetaMask works. Choose Connect a wallet instead in the sign-in window. Hagi adds Robinhood Chain Testnet to your wallet if it isn’t there yet.</>,
        <><b>Sign in.</b> You sign one message. It is free and moves no funds, and your private Hagi account is worked out from that signature.</>,
        <><b>Get gas and test USDG.</b> Claim testnet ETH from the <Out href={FAUCET_URL}>Robinhood Chain faucet</Out>, then claim test USDG on the Portfolio page.</>,
      ]} />
      <H>About your Hagi account</H>
      <List items={[
        <>There is no new seed phrase. The same passkey, or the same wallet, always opens the same Hagi account.</>,
        <>Passkeys sync through your phone’s password manager (iCloud Keychain or Google Password Manager), so a new phone with the same account gets you back in.</>,
        <>Your Hagi address starts with <code>hagi1</code>. It is what you share to get paid privately, and it is not your wallet address. Find it on the Receive tab.</>,
        <>The account stays unlocked for the browser tab or app session you are in. Sends and withdrawals ask for your passkey again.</>,
      ]} />
      <Note kind="warn" title="Only sign in on the Hagi site">If you use a wallet, the sign-in signature is the key to your private balance. A fake site that gets you to sign the same message could read and move your shielded funds. Check the address bar before you sign.</Note>
    </>,
  },
  {
    slug: 'shield', group: 'Guides', title: 'Shield and unshield',
    lede: 'Shielding moves tokens from your wallet into the vault. Unshielding brings them back out.',
    body: <>
      <H>Shield</H>
      <Steps items={[
        <>Open <b>Portfolio</b> and make sure the <b>Shield</b> tab is selected in the box on the right.</>,
        <>Pick the token. USDG and every listed stock can be shielded.</>,
        <>Type an amount, or choose Max, then confirm in your wallet.</>,
      ]} />
      <P>The first time you shield a token, your wallet asks for two confirmations. The first lets the vault take that token, and the second is the deposit itself.</P>
      <P>A shield is a public transaction from your wallet. People can see that you deposited, and how much. What they can’t see is anything you do with it afterwards.</P>
      <H>Unshield</H>
      <Steps items={[
        <>On <b>Portfolio</b>, switch the box to the <b>Unshield</b> tab.</>,
        <>Pick the token and the amount.</>,
        <>Confirm. Your browser builds a proof, the relayer sends it, and the tokens arrive in your wallet.</>,
      ]} />
      <P>An unshield is public too: the receiving wallet and the amount are visible. Your remaining balance is not.</P>
      <Note title="Tip">Round amounts and a gap in time between shielding and unshielding make the two much harder to connect. See <To slug="private">What’s private and what isn’t</To>.</Note>
    </>,
  },
  {
    slug: 'swap', group: 'Guides', title: 'Swap privately',
    lede: 'A private swap trades one token for another straight out of your private balance, and puts the result straight back in.',
    body: <>
      <Steps items={[
        <>Open <b>Swap</b>.</>,
        <>Choose what you pay with and what you want. You can swap USDG for a stock, a stock for USDG, or one stock for another.</>,
        <>Type an amount. Hagi shows what you will get and the current price.</>,
        <>Choose <b>Swap</b>. A progress window shows each step, and it closes by itself when the swap is done.</>,
      ]} />
      <H>What happens during those few seconds</H>
      <List items={[
        <><b>Building your private proof.</b> Your browser proves you own enough funds, without showing which funds are yours. This is the slow step.</>,
        <><b>Sending through the relayer.</b> The relayer submits the transaction so your wallet is not on it.</>,
        <><b>Waiting for the network.</b> The vault checks the proof, makes the trade in the pool and writes you a new receipt.</>,
      ]} />
      <H>Price, fees and limits</H>
      <Table head={['Item', 'On testnet']} rows={[
        ['Pool fee', '0.3% of each swap, kept by the pool'],
        ['Relayer fee', 'None'],
        ['Gas', 'Paid by the relayer. You need no ETH for a private swap'],
        ['Slippage limit', '0.5%. If the price moves more than that before your swap lands, it is cancelled and nothing is spent'],
        ['Where the price comes from', 'Hagi’s own test pools, seeded at rough prices. They are not live market prices'],
      ]} />
      <H>What others can see</H>
      <P>That someone swapped these two tokens, and how much. They can’t see who made the swap, your balance or your other holdings.</P>
    </>,
  },
  {
    slug: 'send', group: 'Guides', title: 'Send and receive',
    lede: 'Send from your private balance to another Hagi user, fully private, or to any 0x wallet without revealing yours.',
    body: <>
      <H>Send to a Hagi address</H>
      <Steps items={[
        <>Open <b>Send</b>.</>,
        <>Paste the recipient’s Hagi address. It starts with <code>hagi1</code>.</>,
        <>Pick the token and amount, then confirm.</>,
      ]} />
      <P>The chain shows only that a private transaction happened. The sender, the recipient, the token and the amount all stay private. The recipient does not need to be online. The funds are waiting for them the next time they open Hagi.</P>
      <H>Send to any wallet</H>
      <P>Paste a normal <code>0x</code> address instead. Hagi takes the amount out of your private balance and the relayer sends it straight to that wallet.</P>
      <List items={[
        <>Public: the receiving wallet, the token and the amount, like any withdrawal. It shows as coming from the Hagi vault.</>,
        <>Hidden: who sent it. Your wallet is not on the transaction.</>,
        <>Tip: sending the exact amount you just shielded, right after shielding it, makes it easier to guess it was you.</>,
      ]} />
      <H>Receive</H>
      <Steps items={[
        <>Tap <b>Receive</b> (or open Send and pick the Receive tab) and choose <b>Copy address</b>.</>,
        <>Share that address with whoever is paying you.</>,
        <>Open Hagi. Incoming funds show up in your balance and in Activity as “Received”.</>,
      ]} />
      <Note kind="warn" title="A Hagi address is not a wallet address">Never send tokens to a hagi1 address from a normal wallet or an exchange. It only works inside Hagi. To get paid from outside Hagi, use a <To slug="ghost">Ghost Address</To>.</Note>
    </>,
  },
  {
    slug: 'ghost', group: 'Guides', title: 'Ghost Addresses',
    lede: 'A normal 0x address that any wallet or exchange can pay, and that only your Hagi account can claim from, straight into your private balance.',
    body: <>
      <P>Your Hagi address only works inside Hagi. A Ghost Address works everywhere: it looks like any other <code>0x</code> address, so you can withdraw to it from an exchange, give it to a friend, or pay it from any wallet. Nothing on chain ties it to you or to your wallet.</P>
      <H>Get paid to a Ghost Address</H>
      <Steps items={[
        <>Open <b>Receive</b> and pick <b>Ghost Address</b>.</>,
        <>Copy the address or show the QR code. Send USDG or any listed stock to it on Robinhood Chain.</>,
        <>When it arrives, tap <b>Claim</b>. The relayer sends the claim and pays the gas, so you don’t need a wallet or ETH.</>,
      ]} />
      <P>Claiming takes a 0.5% fee. The rest lands in your private balance as a new receipt that only your keys can spend.</P>
      <H>What others can see</H>
      <List items={[
        <>Public: that the Ghost Address received the tokens, and that they were claimed into the vault. Like any transfer.</>,
        <>Hidden: who owns the Ghost Address, and everything you do with the funds after the claim.</>,
        <>Tip: every deposit to the same Ghost Address can be tied to the others. Tap <b>New address</b> to get a fresh one for each sender. Old addresses keep working and Hagi keeps watching them.</>,
      ]} />
      <H>How it works</H>
      <P>A Ghost Address is the CREATE2 address of a tiny wallet contract, salted with a partial receipt that only your keys can make. Funds can be sent to it before anything is deployed. A claim deploys the wallet if needed and shields what it holds into a receipt completed from that same partial receipt, so whoever sends the claim can only ever put the money into your balance. Your addresses are numbered from your spending key, so any device you sign in on finds them again.</P>
      <Note kind="warn" title="Only listed tokens">Send only USDG, TSLA, AMD, AMZN, NFLX or PLTR on Robinhood Chain. Anything else, including ETH, can’t be claimed and stays stuck at the address.</Note>
      <H>Ghost Swaps: arrive as a stock</H>
      <P>Under <b>Arrives as</b>, pick a stock. You get a different address, a Ghost Swap address, tied to that stock. Whatever is sent there turns into that stock when you claim, so USDG withdrawn from an exchange can land in your private balance as AMZN in one step.</P>
      <List items={[
        <>The swap runs through Hagi’s pools at the price when you claim, with the same 0.5% fee. Each stock has its own address, so nobody can change what your money turns into.</>,
        <>Only the Hagi relayer can make the swap, so a stranger can’t claim it at a bad price. If the relayer is ever down, anyone can still bring the deposit in as the token that was sent, so it can’t get stuck.</>,
      ]} />
    </>,
  },
  {
    slug: 'drops', group: 'Guides', title: 'Hagi Drops',
    lede: 'Split a pot of stocks into random slices behind one link. Whoever opens it first takes a slice, straight into their private balance.',
    body: <>
      <H>Make a drop</H>
      <Steps items={[
        <>Open <b>Send</b> and pick <b>Drop</b>.</>,
        <>Choose the token, the total, and how many people can grab a slice (up to 10). Add a message if you like.</>,
        <>Confirm, then copy the link or post it on X. Each slice is a random size.</>,
      ]} />
      <H>Grab a slice</H>
      <P>Open the link and tap <b>Grab my slice</b>. You need a Hagi account, but no wallet and no gas: the relayer sends it. Each device can grab one slice from a drop.</P>
      <H>What others can see</H>
      <List items={[
        <>Hidden: who made the drop, who grabbed from it, and how much each slice was. On chain it looks like ordinary private sends.</>,
        <>The link is the key. Anyone who has it can grab a slice, so only share it where you mean to. Bots can grab from links posted in public.</>,
        <>Slices nobody takes stay in the drop. Open <b>Your drops</b> on the Drop tab and tap <b>Take back</b> to bring them home.</>,
      ]} />
      <Note kind="info" title="How it works">The link holds a secret that becomes a throwaway Hagi key. Making a drop sends a private receipt for each slice to that key. Grabbing proves you know the key and moves one receipt into your own balance. The vault’s nullifiers stop two people taking the same slice.</Note>
    </>,
  },
  {
    slug: 'baskets', group: 'Guides', title: 'Baskets',
    lede: 'A basket is a fixed mix of stocks you can buy in one transaction, straight into your private balance.',
    body: <>
      <H>Buy a basket</H>
      <Steps items={[
        <>Open <b>Baskets</b> and pick one. Each card shows the stocks in it and their weights.</>,
        <>Type how much USDG to spend from your private balance.</>,
        <>Confirm. Hagi splits your USDG across the stocks by weight and buys them all at once.</>,
      ]} />
      <P>What you end up with is the stocks themselves, sitting in your private balance. You can swap, send or unshield each one on its own afterwards.</P>
      <H>Make a basket</H>
      <Steps items={[
        <>On <b>Baskets</b>, choose to create one.</>,
        <>Give it a name and pick two to eight listed stocks.</>,
        <>Set the weights so they add up to 100%, then confirm in your wallet.</>,
      ]} />
      <H>The rules</H>
      <List items={[
        <>Anyone can make a basket.</>,
        <>Only listed stocks can go in one. A basket holds two to eight of them.</>,
        <>A basket can’t be changed or deleted after it is made. What you buy today is the same recipe tomorrow.</>,
        <>Names don’t have to be unique. Each basket has its own ID, and that is what Hagi uses.</>,
      ]} />
      <H>What others can see</H>
      <P>Buying a basket shows which basket was bought and how much USDG went in, but not who bought it. Creating a basket is a normal public transaction from your wallet, so your wallet and the recipe are visible.</P>
    </>,
  },
  {
    slug: 'how', group: 'Under the hood', title: 'How it works',
    lede: 'The ideas behind Hagi in plain words: a shared vault, private receipts, proofs and a relayer.',
    body: <>
      <Flow />
      <H>The vault</H>
      <P>The vault is one smart contract that holds everyone’s shielded funds together. Anyone can see how much is in the vault in total. Nobody can see how it is split between people.</P>
      <H>Receipts</H>
      <P>When you shield, the vault doesn’t record “this wallet owns 500 USDG”. It records a receipt: a scrambled value that stands for an amount, a token and an owner. Only your key can read your receipts, and your balance is simply the sum of the ones you haven’t spent.</P>
      <P>Receipts are stored in a tree with room for about a million of them.</P>
      <H>Spending without pointing</H>
      <P>To swap, send or unshield, you have to show the vault you own enough funds. Pointing at your receipts would give you away. So your browser builds a zero-knowledge proof. It shows three things and nothing else:</P>
      <List items={[
        <>the receipts you are spending exist in the vault,</>,
        <>you hold the key to them,</>,
        <>what goes in equals what comes out.</>,
      ]} />
      <P>Each spent receipt also leaves a one-time marker, so it can never be spent twice. The marker can’t be traced back to the receipt it came from.</P>
      <H>The relayer</H>
      <P>If your wallet sent the transaction, your wallet would be on it. So a relayer sends it for you. The relayer can’t change anything about your action, because the proof is tied to the exact details. It can’t take your funds either. The worst it can do is refuse to send, and then Hagi asks whether you want to send from your own wallet.</P>
      <H>Private swaps</H>
      <P>For a swap, the vault takes the tokens you are paying with, trades them in the pool, and writes you a new receipt for what came back. All of that happens in one transaction. The pool sees the vault as the trader, never you.</P>
      <H>Your key</H>
      <P>Your Hagi key is worked out from one signature by your wallet. Proofs are built in your browser, and the key never leaves your device.</P>
    </>,
  },
  {
    slug: 'contracts', group: 'Under the hood', title: 'Contracts and network',
    lede: 'Every address Hagi uses on Robinhood Chain Testnet.',
    body: <>
      <H>Network</H>
      <Table head={['Setting', 'Value']} rows={[
        ['Network', CFG.name],
        ['Chain ID', <Addr value={String(CFG.chainId)} link={false} />],
        ['RPC', <Addr value={CFG.rpc} link={false} />],
        ['Explorer', <Out href={CFG.explorer}>{CFG.explorer.replace('https://', '')}</Out>],
        ['Faucet', <Out href={FAUCET_URL}>{FAUCET_URL.replace('https://', '')}</Out>],
      ]} />
      <H>Hagi contracts</H>
      <Table head={['Contract', 'What it does', 'Address']} rows={[
        ['HagiVault', 'Holds shielded funds and checks proofs', <Addr value={CFG.contracts.vault} />],
        ['Groth16Verifier', 'Verifies the zero-knowledge proofs', <Addr value={DEPLOYED.verifier} />],
        ['HagiSwapAdapter', 'Lets the vault trade in the pools', <Addr value={DEPLOYED.adapter} />],
        ['HagiSwap', 'The test pools, one per stock against USDG', <Addr value={CFG.contracts.swap} />],
        ['BasketRegistry', 'Stores baskets and their recipes', <Addr value={CFG.contracts.basketRegistry} />],
        ['TestUSDG', 'The test dollar token, with a faucet', <Addr value={CFG.contracts.usdg} />],
        ...(CFG.contracts.ghost ? [['HagiGhost', 'Makes Ghost Addresses and claims them into the vault', <Addr value={CFG.contracts.ghost} />]] : []),
        ...(CFG.contracts.ghostSwap ? [['HagiGhostSwap', 'Ghost Swap addresses: swaps a deposit into a stock on the way in', <Addr value={CFG.contracts.ghostSwap} />]] : []),
      ]} />
      <H>Stock tokens</H>
      <Table head={['Token', 'Address']} rows={Object.entries(CFG.tokens).map(([k, v]) => [k, <Addr value={v} />])} />
      <H>What the owner can and can’t do</H>
      <P>The deployer wallet owns the contracts. It is worth knowing exactly what that allows.</P>
      <List items={[
        <><b>Can’t</b> withdraw or move anyone’s shielded funds. The vault has no admin withdrawal.</>,
        <><b>Can</b> change which tokens the vault accepts.</>,
        <><b>Can</b> change the swap adapter the vault trades through. A bad adapter could mishandle the funds in a swap while it is happening, so this is a real point of trust.</>,
        <><b>Can</b> add and remove liquidity in the test pools, and mint test USDG.</>,
      ]} />
    </>,
  },
  {
    slug: 'risks', group: 'Under the hood', title: 'Risks and status',
    lede: 'Where Hagi stands today, said plainly.',
    body: <>
      <Note kind="warn" title="Testnet only">Hagi is an early build on Robinhood Chain Testnet. Do not use it with real funds, and do not treat it as safe until the points below have changed.</Note>
      <H>What isn’t done yet</H>
      <List items={[
        <><b>No audit.</b> Nobody independent has reviewed the contracts or the circuit.</>,
        <><b>Test proving keys.</b> The keys that proofs are checked against were made by one party, us. Whoever makes such keys could forge proofs. A real launch needs a public ceremony with many people taking part.</>,
        <><b>One owner wallet.</b> A single wallet owns the contracts. See <To slug="contracts">what the owner can and can’t do</To>.</>,
        <><b>One relayer.</b> If it is down, private actions wait, or go out from your own wallet if you choose that.</>,
        <><b>Test pools.</b> Prices come from small pools we seeded ourselves. They are not market prices.</>,
        <><b>A small crowd.</b> Privacy depends on how many people share the vault. On a quiet testnet that number is small.</>,
      ]} />
      <H>About the tokens</H>
      <List items={[
        <>The stock tokens here are test tokens with no value.</>,
        <>A stock token is not a share. It gives you no vote, no dividend and no claim on the company.</>,
        <>Nothing on this site is financial advice.</>,
      ]} />
      <H>If something goes wrong</H>
      <P>Funds in the vault can only be moved by a proof made with your key. If the Hagi site went away, your funds would still be in the contract, and only your key could move them. Your activity list is only kept on your device, so export it from the wallet menu if you want a copy.</P>
    </>,
  },
  {
    slug: 'help', group: 'Help', title: 'Troubleshooting',
    lede: 'The things that most often go wrong, and what to do about them.',
    body: <>
      <H>“Private sending is unavailable”</H>
      <P>The relayer couldn’t be reached. Nothing has been sent. Choose <b>Stop, keep it private</b> and try again in a minute. Only choose <b>Send from my wallet</b> if you are fine with your address showing on that transaction.</P>
      <H>The proof is taking a long time</H>
      <P>Building a proof usually takes a few seconds on a laptop and longer on a phone. Keep the tab open and in front until the window closes.</P>
      <H>My balance didn’t change after I shielded</H>
      <P>Give it a few seconds, then reload the page. Hagi reads the vault’s history to find your receipts, and a slow connection can delay that.</P>
      <H>“Can’t reach the chain”</H>
      <P>The testnet’s public connection is busy or down. Your funds are not affected. Wait a little and reload.</P>
      <H>My wallet says I don’t have enough ETH</H>
      <P>Shielding, claiming test USDG and creating a basket are sent from your wallet and need a little gas. Get free testnet ETH from the <Out href={FAUCET_URL}>faucet</Out>.</P>
      <H>The faucet won’t give me more USDG</H>
      <P>The app lets each account claim test USDG once.</P>
      <H>“Not enough” of a token</H>
      <P>Swap, Send and Baskets spend from your private balance, not your wallet. Shield the token first.</P>
      <H>I sent funds but the other person can’t see them</H>
      <P>They need to open Hagi and unlock their account with the same wallet their Hagi address came from. Check that the address you used starts with <code>hagi1</code> and was copied in full.</P>
      <H>I’m on a new device and my activity is empty</H>
      <P>Your balance follows your wallet, so it is all still there. The activity list is kept on each device and doesn’t travel.</P>
      <H>Something else</H>
      <P>Tell us what you did and what you saw. On testnet, finding problems is the point.</P>
    </>,
  },
]

const GROUPS = [...new Set(PAGES.map(p => p.group))]
const slugNow = () => { const s = location.hash.replace('#/', '').split('?')[0].split('/')[1]; return PAGES.some(p => p.slug === s) ? s : PAGES[0].slug }

export function Docs() {
  const slug = slugNow()
  const i = PAGES.findIndex(p => p.slug === slug)
  const page = PAGES[i]
  const prev = PAGES[i - 1], next = PAGES[i + 1]
  useEffect(() => { window.scrollTo(0, 0); document.title = page.title + ' · Hagi docs'; return () => { document.title = 'Hagi · Stocks, off the record' } }, [page.title])
  return (
    <div className="docs">
      <aside className="dside">
        {GROUPS.map(g => (
          <div key={g}><span>{g}</span>
            {PAGES.filter(p => p.group === g).map(p => <a key={p.slug} href={'#/docs/' + p.slug} className={p.slug === slug ? 'on' : ''}>{p.title}</a>)}
          </div>
        ))}
      </aside>
      <article className="dmain" key={slug}>
        <h1>{page.title}</h1>
        <p className="dlede">{page.lede}</p>
        {page.body}
        <nav className="dnext">
          {prev ? <a href={'#/docs/' + prev.slug}><span>Previous</span><b>{prev.title}</b></a> : <span />}
          {next ? <a className="r" href={'#/docs/' + next.slug}><span>Next</span><b>{next.title}</b></a> : <span />}
        </nav>
      </article>
    </div>
  )
}
