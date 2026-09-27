import { STARTER_IDS } from './games/starter-set';
import { updatePoolPatternAggregates } from './pool-patterns-repo';

/**
 * Apply a previous→next pool delta to the anonymous `gameCooccurrence` aggregate that powers
 * personalized suggestions. Curated starter-set ids are excluded so real users don't inflate the
 * seeded persona clusters into universal popularity hubs.
 */
export async function recordPoolDelta(previous: number[], next: number[]): Promise<void> {
  const notStarter = (id: number) => !STARTER_IDS.has(id);
  await updatePoolPatternAggregates(previous.filter(notStarter), next.filter(notStarter));
}
