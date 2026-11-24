// Starts a complete local Hagi: chain, contracts and relayer. Prints the app config and stays running.
// Run from the repo root:  npx tsx contracts/e2e/local-stack.ts
// Then build the app against it:  VITE_HAGI_CONFIG='<printed json>' npm run build
import { execSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
import { privateKeyToAccount } from 'viem/accounts'

const PORT = 8546, RELAY_PORT = 8788
const RPC = `http://127.0.0.1:${PORT}`
const K0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' // deployer
const K1 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' // test user
const K2 = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' // relayer
const user = privateKeyToAccount(K1).address

function forge(script: string, env: Record<string, string>) {
  const out = execSync(`forge script script/${script} --rpc-url ${RPC} --broadcast --slow`, { cwd: 'contracts', env: { ...process.env, DEPLOYER_PRIVATE_KEY: K0, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return Object.fromEntries([...out.matchAll(/DEPLOYED (\w+) (0x[0-9a-fA-F]{40})/g)].map(m => [m[1], m[2]]))
}

async function main() {
  const anvil = spawn('anvil', ['--port', String(PORT), '--silent'], { stdio: 'ignore' })
  process.on('exit', () => anvil.kill())
  await new Promise(r => setTimeout(r, 1500))
  const base = forge('LocalSetup.s.sol:LocalSetup', { TEST_USER: user })
  const symbols = ['TSLA', 'AMD', 'AMZN', 'NFLX', 'PLTR']
  const v = forge('DeployVault.s.sol:DeployVault', { HAGI_USDG: base.usdg, HAGI_SWAP: base.swap, HAGI_TOKENS: symbols.map(s => base[s]).join(',') })

  const g = forge('DeployGhost.s.sol:DeployGhost', { HAGI_VAULT: v.vault })

  Object.assign(process.env, { VAULT_ADDRESS: v.vault, GHOST_ADDRESS: g.ghost, RPC_URL: RPC, CHAIN_ID: '31337', RELAYER_PRIVATE_KEY: K2 })
  const { default: relay } = await import('../../api/relay')
  const { default: drip } = await import('../../api/drip')
  const { default: ghost } = await import('../../api/ghost')
  createServer((req, res) => { void (req.url?.startsWith('/api/drip') ? drip : req.url?.startsWith('/api/ghost') ? ghost : relay)(req, res) }).listen(RELAY_PORT)

  const config = {
    chainId: 31337, name: 'Local', rpc: RPC, explorer: 'http://localhost', relayerUrl: `http://127.0.0.1:${RELAY_PORT}/api/relay`, deployBlock: 0,
    contracts: { usdg: base.usdg, swap: base.swap, basketRegistry: v.registry, vault: v.vault, ghost: g.ghost },
    tokens: Object.fromEntries(symbols.map(s => [s, base[s]])),
  }
  writeFileSync('/tmp/hagi-local.json', JSON.stringify({ config, user, userKey: K1 }))
  console.log('READY ' + JSON.stringify(config))
}
main().catch(e => { console.error(e); process.exit(1) })
