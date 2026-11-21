# Contributing

Thanks for taking a look at Hagi. Issues and pull requests are welcome.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Security issues go through [SECURITY.md](SECURITY.md), not public issues.

## Working on the code

```bash
npm install
npm run dev                 # the app, against testnet
npm run build               # type-check and build

cd contracts && forge test  # contract tests
npx tsx contracts/e2e/local-stack.ts   # full local chain, contracts and relayer
```

See the [README](README.md#run-it-locally) for the local stack and circuit build.

## Pull requests

- Keep each pull request to one change, with a short description of what and why.
- Run `npm run build` and `forge test` before opening it.
- Changes to the circuit or the vault need tests, and a note on what they change about privacy.
- Write UI copy in plain words. Never claim Hagi hides something it doesn't (deposits, withdrawals and swap sizes are public).
