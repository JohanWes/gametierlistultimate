'use client';

import { playSound } from '@/lib/sound';
import { useStore } from '@/lib/store';

import { Button } from '../ui/Button';
import { GameCard } from '../ui/GameCard';
import { Row, TIER_ORDER } from '../ui/Row';
import { SAMPLE_TIERS } from './sample';
import { StepScaffold } from './StepScaffold';

export function RevealStep() {
  return (
    <StepScaffold
      eyebrow="Step 4 · Your tier list"
      title="Here’s where they landed."
      description="S at the top, F at the bottom. Hover or tap any cover for details. (Animated reveal arrives in Phase 8.)"
      nextLabel="Tweak it →"
    >
      <div className="flex flex-col gap-2.5">
        {TIER_ORDER.map((tier) => (
          <Row key={tier} tier={tier} count={SAMPLE_TIERS[tier].length}>
            {SAMPLE_TIERS[tier].map((g) => (
              <GameCard key={g.igdbId} game={g} size="sm" />
            ))}
          </Row>
        ))}
      </div>
    </StepScaffold>
  );
}

export function CorrectionStep() {
  return (
    <StepScaffold
      eyebrow="Step 5 · Fine-tune"
      title="Not quite right?"
      description="Move games between tiers or run a few more battles to settle the close calls. (Manual editing lands in Phase 9.)"
      nextLabel="Share it →"
    >
      <div className="flex flex-col gap-2.5">
        {(['S', 'A', 'B'] as const).map((tier) => (
          <Row key={tier} tier={tier} count={SAMPLE_TIERS[tier].length}>
            {SAMPLE_TIERS[tier].map((g) => (
              <GameCard key={g.igdbId} game={g} size="sm" onSelect={() => playSound('blip')} />
            ))}
          </Row>
        ))}
      </div>
    </StepScaffold>
  );
}

export function ShareStep() {
  return (
    <StepScaffold
      eyebrow="Step 6 · Share"
      title="Show it off."
      description="Publish a snapshot to get a short link and an image to share. (Wiring lands in Phase 10.)"
      hideBack={false}
      nextLabel="Start over"
      onNext={() => useStore.getState().setStep('welcome')}
    >
      <div className="rounded-card border border-border bg-surface p-5 shadow-cabinet">
        <p className="mb-3 text-sm text-muted">Your shareable link</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="flex-1 truncate rounded-tile border border-border bg-bg px-4 py-3 font-mono text-sm text-fg">
            ultimategametierlist.app/s/your-list
          </code>
          <Button variant="secondary" onClick={() => playSound('success')}>
            Copy link
          </Button>
        </div>
      </div>
    </StepScaffold>
  );
}
