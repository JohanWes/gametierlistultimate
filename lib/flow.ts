export type Step = 'welcome' | 'pool' | 'arcade' | 'reveal';

/**
 * Linear order of the flow. `goNext`/`goBack` walk this array. `reveal` is terminal: it hosts the
 * animated reveal, the editable tier list, and the share action on one screen.
 */
export const STEP_ORDER: Step[] = ['welcome', 'pool', 'arcade', 'reveal'];

/** Smallest pool that unlocks the arcade. Below this the Continue button stays gated. */
export const MIN_POOL = 12;

/**
 * Clamp a saved resume step against the state we were able to restore. Advanced steps need the
 * live pool rebuilt first; otherwise they would render empty ranking/result screens.
 */
export function resolveResumeStep(saved: unknown, poolCount: number): Step {
  const step: Step =
    typeof saved === 'string' && STEP_ORDER.includes(saved as Step) ? (saved as Step) : 'welcome';
  if ((step === 'arcade' || step === 'reveal') && poolCount < MIN_POOL) return 'pool';
  return step;
}
