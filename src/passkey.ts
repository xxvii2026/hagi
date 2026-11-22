// Passkey sign-in: Face ID, Touch ID, Windows Hello or a phone's screen lock.
// The passkey's PRF extension returns the same 32-byte secret every time for this site, and Hagi derives
// the account's keys from it. Nothing leaves the device, and no email, password or wallet is involved.
import { bytesToHex, type Hex } from 'viem'

const SALT = new TextEncoder().encode('hagi.passkey.v1').buffer as ArrayBuffer
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n))

export const passkeysSupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials

type PrfResult = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } }
const prfOf = (c: Credential | null) => ((c as PublicKeyCredential | null)?.getClientExtensionResults?.() as PrfResult | undefined)?.prf

export class PasskeyError extends Error {}
const UNSUPPORTED = 'This device or browser can’t use passkeys for Hagi yet. Try the latest Chrome or Safari, or connect a wallet instead.'

/** Signs in with an existing passkey and returns its secret. */
export async function usePasskey(): Promise<Hex> {
  if (!passkeysSupported()) throw new PasskeyError(UNSUPPORTED)
  let cred: Credential | null
  try {
    cred = await navigator.credentials.get({
      publicKey: { challenge: rand(32), rpId: location.hostname, userVerification: 'required', extensions: { prf: { eval: { first: SALT } } } as AuthenticationExtensionsClientInputs },
    })
  } catch (e) { throw cancelled(e) }
  const first = prfOf(cred)?.results?.first
  if (!first) throw new PasskeyError(UNSUPPORTED)
  return bytesToHex(new Uint8Array(first))
}

/** Creates a new passkey for Hagi, then reads its secret. */
export async function createPasskey(): Promise<Hex> {
  if (!passkeysSupported()) throw new PasskeyError(UNSUPPORTED)
  let cred: Credential | null
  try {
    cred = await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Hagi', id: location.hostname },
        user: { id: rand(16), name: 'Hagi account', displayName: 'Hagi' },
        challenge: rand(32),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        extensions: { prf: { eval: { first: SALT } } } as AuthenticationExtensionsClientInputs,
      },
    })
  } catch (e) { throw cancelled(e) }
  const prf = prfOf(cred)
  if (prf?.results?.first) return bytesToHex(new Uint8Array(prf.results.first))
  if (prf && prf.enabled === false) throw new PasskeyError(UNSUPPORTED)
  // Most authenticators only hand out the secret on sign-in, so ask once more straight away.
  return usePasskey()
}

function cancelled(e: unknown) {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'AbortError') return new PasskeyError('Passkey cancelled. Try again when you’re ready.')
  if (name === 'InvalidStateError') return new PasskeyError('There’s already a Hagi passkey on this device. Use “I have a passkey” instead.')
  if (name === 'SecurityError') return new PasskeyError('Passkeys only work on hagitrade.xyz over a secure connection.')
  return e instanceof Error ? e : new Error(String(e))
}
