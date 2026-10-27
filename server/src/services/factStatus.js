import { isExpired } from '../utils/dates.js'

/**
 * Fact status is DERIVED from expiresOn at read time — mock parity with
 * refreshFactStatus(): expired when expiresOn < today; an 'expired' fact whose
 * expiry was cleared/extended becomes 'active' again.
 */
export function derivedStatus(fact) {
  if (fact.expiresOn && isExpired(fact.expiresOn)) return 'expired'
  return fact.status === 'expired' ? 'active' : fact.status
}
