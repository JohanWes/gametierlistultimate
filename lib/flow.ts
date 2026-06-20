export type Step = 'welcome' | 'onboarding' | 'pool' | 'arcade' | 'reveal';

/**
 * Linear order of the flow. `goNext`/`goBack` walk this array. `reveal` is terminal: it hosts the
 * animated reveal, the editable tier list, and the share action on one screen.
 */
export const STEP_ORDER: Step[] = ['welcome', 'onboarding', 'pool', 'arcade', 'reveal'];

/** Smallest pool that unlocks the arcade. Below this the Continue button stays gated. */
export const MIN_POOL = 12;

const STEP_SET = new Set<string>(STEP_ORDER);

export function isStep(value: unknown): value is Step {
  return typeof value === 'string' && STEP_SET.has(value);
}

export function parseStep(value: unknown): Step | null {
  return isStep(value) ? value : null;
}

function stepRequiresPool(step: Step): boolean {
  return step === 'arcade' || step === 'reveal';
}

/**
 * Clamp a saved resume step against the state we were able to restore. Advanced steps need the
 * live pool rebuilt first; otherwise they would render empty ranking/result screens.
 */
export function resolveResumeStep(saved: unknown, poolCount: number): Step {
  const step = parseStep(saved);
  if (!step) return 'welcome';
  if (stepRequiresPool(step) && poolCount < MIN_POOL) return 'pool';
  return step;
}
