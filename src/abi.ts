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

export const ghostAbi = parseAbi([
  'function ghostAddress(uint256 partialCommitment) view returns (address)',
  'function walletCodeHash() view returns (bytes32)',
  'function feeBps() view returns (uint256)',
  'function netOf(uint256 amount) view returns (uint256)',
  'function claim(uint256 partialCommitment, address token, uint256 amount, bytes encryptedNote) returns (uint256)',
])

// Uniswap v3 QuoterV2. Not a view function: it is called with eth_call and returns the quote.
export const quoterAbi = parseAbi([
  'struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }',
  'function quoteExactInputSingle(QuoteExactInputSingleParams params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)',
])

// The beta guards on the mainnet vault.
export const guardAbi = parseAbi([
  'function paused() view returns (bool)',
  'function shieldLimit(address token) view returns (uint128 perAddress, uint128 total)',
  'function shieldedBy(address token, address from) view returns (uint256)',
  'function netShielded(address token) view returns (uint256)',
])

export const slot0Abi = parseAbi(['function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'])
