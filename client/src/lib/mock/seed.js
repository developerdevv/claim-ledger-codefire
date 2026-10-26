/**
 * Fictional seed data for MOCK MODE (development aid only).
 *
 * Brand: "Saanjh" — a fictional Indian handloom lifestyle brand.
 * Every person, fact, draft and date here is invented for the demo.
 *
 * Demo storyline:
 *   • F-001 promises free delivery above ₹499. Three drafts cite it.
 *     Editing F-001 to ₹799 must flag every claim + draft that relied on it.
 *   • T-004 is the terminology rule: "free delivery", never "free shipping".
 */

export function createSeed() {
  const facts = [
    {
      _id: 'F-001',
      text: 'Free delivery on all orders above ₹499 within India.',
      owner: 'Priya Nair (Operations)',
      verifiedOn: '2026-09-15',
      expiresOn: '2026-12-31',
      status: 'active',
    },
    {
      _id: 'F-002',
      text: 'Festive Sale 2026 runs from 20 October to 5 November, with up to 40% off on selected styles only.',
      owner: 'Aarav Mehta (Marketing)',
      verifiedOn: '2026-10-01',
      expiresOn: '2026-11-10',
      status: 'active',
    },
    {
      _id: 'F-003',
      text: 'Every piece in the Handloom Edit is woven from 100% organic cotton and is GOTS-certified.',
      owner: 'Sustainability Desk',
      verifiedOn: '2026-08-12',
      expiresOn: '2027-03-01',
      status: 'active',
    },
    {
      _id: 'F-004',
      text: 'Orders placed before 2 PM IST ship the same working day.',
      owner: 'Priya Nair (Operations)',
      verifiedOn: '2026-08-20',
      expiresOn: '2026-11-14',
      status: 'active',
    },
  ]

  const guidelines = [
    {
      _id: 'G-001',
      title: 'No unverified superlatives',
      text: 'Never use superlatives — “best”, “lowest”, “#1”, “most loved” — unless an approved fact in the Brand Vault supports them.',
    },
    {
      _id: 'G-002',
      title: 'Offers must cite the Vault',
      text: 'Every price, discount, offer or delivery promise in customer-facing copy must match an approved fact.',
    },
    {
      _id: 'G-003',
      title: 'Delivery timelines are facts, not flourishes',
      text: 'Do not state dispatch or delivery timelines that no approved fact covers.',
    },
    {
      _id: 'G-004',
      title: 'Numbers need dated sources',
      text: 'Statistics about customers, artisans, or years in business require an approved, dated source in the Brand Vault.',
    },
  ]

  const terminology = [
    {
      _id: 'T-001',
      use: 'Saanjh',
      avoid: 'Saaj, SAANJH Co.',
      note: 'The brand name is always written exactly as “Saanjh”.',
    },
    {
      _id: 'T-002',
      use: 'handloom',
      avoid: 'hand-made loom, handwoven fabric',
      note: 'All woven products are described as “handloom”.',
    },
    {
      _id: 'T-003',
      use: 'kurta',
      avoid: 'kurti (for long-cut styles)',
      note: 'Long-cut styles are “kurtas”; “kurti” is only for short cuts.',
    },
    {
      _id: 'T-004',
      use: 'free delivery',
      avoid: 'free shipping',
      note: 'All customer-facing copy says “free delivery”, never “free shipping”.',
    },
  ]

  const drafts = [
    {
      _id: 'D-1',
      title: 'Festive Sale — Instagram caption',
      contentType: 'Instagram caption',
      status: 'in_review',
      text: [
        'The Saanjh Festive Sale is live — up to 40% off sitewide.',
        'Get free delivery on all orders above ₹499.',
        'Free shipping on express orders placed before noon.',
        'Lowest prices ever, guaranteed.',
        'Shop the collection before stock runs out.',
      ].join('\n'),
      decisions: [],
      createdAt: '2026-10-24T10:12:00+05:30',
      updatedAt: '2026-10-24T10:12:00+05:30',
    },
    {
      _id: 'D-2',
      title: 'Monsoon Handloom Edit — launch email',
      contentType: 'Email',
      status: 'in_review',
      text: [
        'Introducing the Monsoon Handloom Edit.',
        'Every kurta in this collection is woven from 100% organic cotton.',
        'Enjoy free shipping on all orders above ₹299 this month only.',
        'Our artisans have over 30 years of experience.',
        'Order before 2 PM and we ship the same day.',
      ].join('\n'),
      decisions: [
        {
          decision: 'changes',
          comment:
            'The delivery threshold does not match the Brand Vault. Please fix the offer line and re-submit.',
          actor: 'Reviewer (demo)',
          at: '2026-10-24T16:40:00+05:30',
        },
      ],
      createdAt: '2026-10-23T09:05:00+05:30',
      updatedAt: '2026-10-25T11:02:00+05:30',
    },
    {
      _id: 'D-3',
      title: 'Homepage hero — website copy',
      contentType: 'Website copy',
      status: 'in_review',
      text: [
        'New season, handloom comfort.',
        'Free delivery on all orders above ₹499.',
        "India's most loved handloom brand.",
        'Festive Sale: up to 40% off sitewide.',
      ].join('\n'),
      decisions: [],
      createdAt: '2026-10-25T14:30:00+05:30',
      updatedAt: '2026-10-25T14:30:00+05:30',
    },
  ]

  const history = [
    {
      _id: 'H-1',
      type: 'fact_change',
      at: '2026-10-01T09:30:00+05:30',
      actor: 'Aarav Mehta (Marketing)',
      factId: 'F-002',
      previousText: null,
      newText: facts[1].text,
      comment: 'Verified with the festive campaign brief.',
    },
    {
      _id: 'H-2',
      type: 'decision',
      at: '2026-10-24T16:40:00+05:30',
      actor: 'Reviewer (demo)',
      draftId: 'D-2',
      draftTitle: drafts[1].title,
      from: 'in_review',
      to: 'changes',
      comment: drafts[1].decisions[0].comment,
    },
  ]

  return {
    facts,
    guidelines,
    terminology,
    drafts,
    /** All claims produced by checks, keyed by draft via claim.draftId. */
    claims: [],
    /** Impact entries created when facts are edited or expire. */
    impacts: [],
    history,
    counters: { fact: 4, draft: 3, claim: 100, impact: 0, history: 2 },
  }
}

/** Display text for a terminology entry when it is cited as a source. */
export function terminologyText(term) {
  if (!term) return ''
  return `Use “${term.use}”, never “${term.avoid}”.`
}
