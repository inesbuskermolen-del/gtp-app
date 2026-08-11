import { describe, expect, it } from 'vitest';
import { buildActionsByCategory } from '../src/gtpGenerator.js';
import type { CouncilMatch, CouncilProfile } from '../src/types.js';

function makeCouncilMatch(actionWeights: Record<string, number>): CouncilMatch {
  const council: CouncilProfile = {
    id: 'test',
    name: 'Test Council',
    profileDepth: 'detailed',
    suburbs: [],
    lgaNames: [],
    visionStatement: '',
    strategicPriorities: [],
    quantifiedTargets: [],
    sourceDocuments: [],
    actionWeights,
    policyNarrative: '',
  };
  return { council, matchConfidence: 'lga-polygon-matched' };
}

describe('buildActionsByCategory action weighting', () => {
  it('produces the same base item set regardless of council weights', () => {
    const neutral = buildActionsByCategory(makeCouncilMatch({}));
    const weighted = buildActionsByCategory(makeCouncilMatch({ cycling: 5 }));
    expect(Object.keys(weighted)).toEqual(Object.keys(neutral));
    expect(weighted.cycling.map((a) => a.text).sort()).toEqual(neutral.cycling.map((a) => a.text).sort());
  });

  it('crosses more items over the "priority" threshold when a category is weighted up', () => {
    // endOfTripFacilities has base weights [2, 2, 1] — at neutral weight
    // only the first two clear the score>=2 threshold. Weighting the
    // category up should pull the third one over too (priority is capped
    // at the top 3 items either way, so this category — where neutral
    // doesn't already max out at 3 — is what actually demonstrates the
    // effect; "cycling" already has 3 items >=2 at neutral and can't show
    // a difference).
    const neutral = buildActionsByCategory(makeCouncilMatch({}));
    const neutralOrder = neutral.endOfTripFacilities.map((a) => a.text);

    const weighted = buildActionsByCategory(makeCouncilMatch({ endOfTripFacilities: 3 }));
    const weightedOrder = weighted.endOfTripFacilities.map((a) => a.text);

    // The order itself is unaffected by a uniform per-category multiplier
    // (it scales every item in the category equally, so relative order is
    // unchanged) — the multiplier changes which items cross the priority
    // threshold, which is the actual signal consultants see change.
    expect(weightedOrder).toEqual(neutralOrder);
    const neutralPriorityCount = neutral.endOfTripFacilities.filter((a) => a.priority).length;
    const weightedPriorityCount = weighted.endOfTripFacilities.filter((a) => a.priority).length;
    expect(weightedPriorityCount).toBeGreaterThan(neutralPriorityCount);
  });

  it('changes relative category emphasis when weights differ per category', () => {
    // Two categories with equal base item weights in a synthetic scenario
    // would tie under neutral weights; skewing one council's weights makes
    // that category's top score higher than the other's.
    const yarraLike = buildActionsByCategory(makeCouncilMatch({ cycling: 1.6, carParking: 1.3 }));
    const merriBekLike = buildActionsByCategory(makeCouncilMatch({ cycling: 1.3, carParking: 1.4 }));

    const topScore = (byCategory: ReturnType<typeof buildActionsByCategory>, cat: string) => byCategory[cat][0]?.score ?? 0;

    expect(topScore(yarraLike, 'cycling')).toBeGreaterThan(topScore(merriBekLike, 'cycling'));
    expect(topScore(merriBekLike, 'carParking')).toBeGreaterThan(topScore(yarraLike, 'carParking'));
  });
});
