import { parseAbi } from 'viem'

const STRUCTS = [
  'struct Proof { uint256[2] a; uint256[2][2] b; uint256[2] c; uint256 root; uint256[2] nullifiers; uint256[2] commitments; }',
  'struct SwapLeg { address tokenOut; uint256 amountIn; uint256 minOut; uint256 partialCommitment; bytes encryptedNote; }',
  'struct ExtData { address recipient; address token; uint256 amount; address relayer; uint256 fee; bytes encryptedOutput1; bytes encryptedOutput2; SwapLeg[] legs; uint256 basketId; }',
] as const

export const vaultAbi = parseAbi([
  ...STRUCTS,
  'function shield(address token, uint256 amount, uint256 partialCommitment, bytes encryptedNote)',
  'function transact(Proof p, ExtData ext)',
  'function nullifierSpent(uint256 nullifier) view returns (bool)',
  'function latestRoot() view returns (uint256)',
  'event NewCommitment(uint256 indexed commitment, uint256 index, address token, uint256 amount, bytes encryptedNote)',
  'error TokenNotAllowed(address token)',
  'error BadAmount()',
  'error BadFieldElement()',
  'error BadTransfer()',
  'error UnknownRoot()',
  'error NullifierSpent(uint256 nullifier)',
  'error InvalidProof()',
  'error BadExtData()',
  'error TreeFull()',
  'error SwapOutputTooLow(uint256 got, uint256 minOut)',
  'error BasketMismatch()',
])

export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function faucet()',
  'function lastClaim(address) view returns (uint256)',
  'error FaucetCooldown(uint256 availableAt)',
])

export const swapAbi = parseAbi([
  'function pools(address token) view returns (uint128 reserveToken, uint128 reserveQuote)',
  'function quoteExactIn(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256)',
])

export const registryAbi = parseAbi([
  'struct Basket { address creator; uint64 createdAt; uint64 buyers; string name; address[] tokens; uint16[] weights; }',
  'function getBaskets(uint256 start, uint256 limit) view returns (Basket[])',
  'function createBasket(string name, address[] tokens, uint16[] weights) returns (uint256)',
  'error BadName()',
  'error BadLength()',
  'error TokenNotListed(address token)',
  'error DuplicateToken(address token)',
  'error ZeroWeight()',
  'error WeightsMustTotal10000(uint256 total)',
])
