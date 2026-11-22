// Money leaving a passkey account is confirmed with Face ID, fingerprint or the screen lock first.
import * as engine from './engine'
import { usePasskey } from './passkey'
import type { Step } from './ui'

export async function confirmSpend(step: Step) {
  if (!engine.isPasskey()) return
  step('Confirm with Face ID')
  const secret = await usePasskey()
  if (!engine.matchesPasskey(secret)) throw new Error('That passkey belongs to a different Hagi account.')
}
