'use client';

import { playSound } from '@/lib/sound';
import { useStore } from '@/lib/store';

import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { GameCard } from '../ui/GameCard';
import { ProgressMeter } from '../ui/ProgressMeter';
import { Row, TIER_ORDER } from '../ui/Row';
import { Toggle } from '../ui/Toggle';
import { SAMPLE_TIERS } from './sample';
import { StepScaffold } from './StepScaffold';

const GENRES = [
  'RPG',
  'Action',
  'Adventure',
  'Strategy',
  'Shooter',
  'Platformer',
  'Horror',
  'Puzzle',
  'Simulation',
  'Open world',
  'Story-rich',
  'Multiplayer',
];

const FLAGS = [
  { key: 'older', label: 'Include older games', description: 'Classics from before 2010.' },
  { key: 'indie', label: 'Lean indie', description: 'Favor smaller studios.' },
  { key: 'hidden', label: 'Hidden gems', description: 'Surface lesser-known titles.' },
  { key: 'chaos', label: 'Chaos mode', description: 'Wilder, more surprising matchups.' },
];

export function OnboardingStep() {
  const genres = useStore((s) => s.prefs.genres);
  const flags = useStore((s) => s.prefs.flags);
  const toggleGenre = useStore((s) => s.toggleGenre);
  const setFlag = useStore((s) => s.setFlag);

  return (
    <StepScaffold
      eyebrow="Step 1 · Preferences"
      title="What do you reach for?"
      description="Pick a few genres and tune the vibe. We use these to suggest games worth ranking — nothing is locked in."
    >
      <div className="flex flex-wrap gap-2">
        {GENRES.map((g) => (
          <Chip key={g} label={g} selected={genres.includes(g)} onToggle={() => toggleGenre(g)} />
        ))}
      </div>
      <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
        {FLAGS.map((f) => (
          <Toggle
            key={f.key}
            label={f.label}
            description={f.description}
            checked={!!flags[f.key]}
            onChange={(v) => setFlag(f.key, v)}
          />
        ))}
      </div>
    </StepScaffold>
  );
}

export function PoolStep() {
  return (
    <StepScaffold
      eyebrow="Step 2 · Your games"
      title="Add the games you’ve played."
      description="Review suggestions a handful at a time, or search for anything. Aim for 20+ to get a sharp list. (Full builder lands next phase.)"
    >
      <div className="flex flex-wrap gap-3">
        {SAMPLE_TIERS.S.concat(SAMPLE_TIERS.A).map((g) => (
          <GameCard key={g.igdbId} game={g} size="sm" onSelect={() => playSound('blip')} />
        ))}
        <GameCard loading size="sm" />
        <GameCard loading size="sm" />
      </div>
    </StepScaffold>
  );
}

export function ArcadeStep() {
  const [a, b] = SAMPLE_TIERS.S;
  return (
    <StepScaffold
      eyebrow="Step 3 · The arcade"
      title="Which one wins?"
      description="Quick battles sharpen your hidden rankings. Play more to refine, or reveal whenever you’re ready. (Minigames land in a later phase.)"
      nextLabel="Reveal my list →"
    >
      <ProgressMeter value={42} label="Confidence" className="mb-7" />
      <div className="grid grid-cols-2 gap-4">
        {[a, b].map((g) => (
          <button
            key={g.igdbId}
            type="button"
            onClick={() => playSound('success')}
            className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-5 shadow-soft transition-colors hover:border-teal/60 focus-visible:outline-none"
          >
            <GameCard game={g} />
            <span className="text-sm font-medium text-fg">{g.title}</span>
          </button>
        ))}
      </div>
    </StepScaffold>
  );
}

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
