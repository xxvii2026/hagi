# Security

Hagi is a testnet build. The contracts and circuit have not been audited, and the proving key comes from a single-party setup. Please don't use it with real funds.

## Reporting a vulnerability

Please report security issues privately, not in a public issue:

**[Report a vulnerability](https://github.com/xxvii2026/hagi/security/advisories/new)** (GitHub private vulnerability reporting)

Include what you found, how to reproduce it, and what an attacker could do with it. We'll reply as soon as we can and credit you when it's fixed, unless you'd rather stay anonymous.

## Scope

- Contracts in `contracts/src`
- The circuit in `circuits/transaction.circom`
- The relayer in `api/relay.ts`
- The web app in `src/`, especially anything that leaks keys, notes or a link between a wallet and its private activity

## Never

Hagi will never DM you first, ask for your seed phrase or private keys, or ask you to send funds anywhere. The only official site is [hagitrade.xyz](https://hagitrade.xyz).
