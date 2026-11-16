# Hagi

Stocks, off the record. A shielded pool for stock tokens on Robinhood Chain.

This repo currently holds the web app. It runs in **demo mode**: balances and transactions are simulated in the browser until the contracts are deployed.

## Run it

```bash
npm install
npm run dev      # local development
npm run build    # type-check and build to dist/
```

Works in GitHub Codespaces as is. `dist/` is a static site and can be hosted anywhere.

## What's in the app

| Page | What it does |
|---|---|
| Welcome | Connect wallet, sign one message to create a Hagi account, get test funds |
| Portfolio | Private balance, holdings, Shield and Unshield, recent activity, hide amounts |
| Swap | Trade from the private balance |
| Baskets | Browse, buy, create and share baskets of up to 8 stocks |
| Send | Private send to a `hagi1…` address, and Receive with a QR code |
| Activity | Full history, hide amounts, export as JSON |

## Layout

```
src/chain.ts      Robinhood Chain Testnet config (chain ID 46630) and contract addresses
src/data.ts       Token list, seed baskets, formatting helpers
src/store.tsx     App state. This is the demo engine that the contract calls will replace
src/wallet.ts     Wallet connect and Hagi account creation
src/ui.tsx        Shared components: logo mark, token icon, pixel censor, progress modal
src/pages/        One file per page
```

## Going live

1. Deploy the contracts and put their addresses in `CONTRACTS` in `src/chain.ts`. Demo mode turns off when `pool` is set.
2. Replace the reducer actions in `src/store.tsx` with contract calls and proof generation.
3. Add `address` and `logoURI` to each token in `src/data.ts`. A token with a `logoURI` shows its logo in place of the coloured initial.

## Architecture decisions

- Shielded pool with shield, private send, unshield, and unshield-swap-reshield through Uniswap.
- The user's wallet sends every transaction and pays gas. Swaps and basket buys are therefore public (wallet, tokens, amounts). Balances and sends are private. Contracts keep a fee and submitter field so a relayer can be added later.
- Baskets: open creation, allowlisted tokens only, immutable after creation, identified by ID with creator and buyer count shown.
- Testnet only until the contracts are audited.
