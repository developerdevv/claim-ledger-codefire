/**
 * Response serializers. Input: lean() plain objects.
 * Only `revisions` is contractually hidden (internal snapshots);
 * other extras (brand, seq, version…) are ignored by the frontend.
 */

export function serializeDraft(draft) {
  if (!draft) return null
  const { revisions, ...rest } = draft
  return rest
}

export function serializeFact(fact) {
  return fact ?? null
}

export function serializeClaim(claim) {
  return claim ?? null
}
