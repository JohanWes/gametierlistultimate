'use client';

import { useState } from 'react';

import type { Game } from '@/lib/games/types';
import type { SnapshotGame } from '@/lib/lists-repo';
import { TIER_ORDER, type TierMap } from '@/lib/ranking';
import { playSound } from '@/lib/sound';
import { useStore } from '@/lib/store';

import { Button } from '../../ui/Button';

export interface ShareBarProps {
  tiers: TierMap;
  gamesById: Map<number, Game>;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

type State =
  | { kind: 'idle' }
  | { kind: 'publishing' }
  | { kind: 'ready'; url: string }
  | { kind: 'error' };

/** Builds a self-contained snapshot (covers embedded) so the share view needs no extra lookups. */
function buildSnapshot(tiers: TierMap, gamesById: Map<number, Game>): SnapshotGame[] {
  const out: SnapshotGame[] = [];
  for (const tier of TIER_ORDER) {
    for (const id of tiers[tier]) {
      const game = gamesById.get(id);
      if (game) out.push({ igdbId: game.igdbId, title: game.title, coverUrl: game.coverUrl });
    }
  }
  return out;
}

/**
 * Publishes the current tier list and surfaces a short shareable link. No account needed — the
 * snapshot is anonymous and immutable. (Image export is a later phase; this ships the link.)
 */
export function ShareBar({ tiers, gamesById, fetchImpl }: ShareBarProps) {
  const setStep = useStore((s) => s.setStep);
  const soundOn = useStore((s) => s.ui.soundOn);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);

  const doFetch = fetchImpl ?? fetch;

  const publish = async () => {
    setState({ kind: 'publishing' });
    try {
      const res = await doFetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ tiers, games: buildSnapshot(tiers, gamesById) }),
      });
      const data = (await res.json()) as { url?: string };
      if (!res.ok || !data.url) throw new Error('publish failed');
      if (soundOn) playSound('success');
      setState({ kind: 'ready', url: data.url });
    } catch {
      setState({ kind: 'error' });
    }
  };

  const copy = async () => {
    if (state.kind !== 'ready') return;
    try {
      await navigator.clipboard?.writeText(state.url);
      if (soundOn) playSound('blip');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the link is visible to copy by hand */
    }
  };

  return (
    <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-lg font-bold uppercase tracking-[0.04em] text-fg">
            Share your tier list
          </p>
          <p className="text-sm text-muted">A short link anyone can open — no sign-in needed.</p>
        </div>

        {state.kind !== 'ready' ? (
          <Button onClick={publish} loading={state.kind === 'publishing'}>
            Share my list →
          </Button>
        ) : null}
      </div>

      {state.kind === 'ready' ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="flex-1 truncate rounded-tile border border-border bg-bg px-4 py-3 font-mono text-sm text-fg">
            {state.url}
          </code>
          <Button variant="secondary" onClick={copy}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </Button>
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <div className="flex items-center justify-between gap-3 rounded-tile border border-coin/50 bg-coin/10 px-4 py-3">
          <p className="text-sm text-fg">Couldn’t publish just now. Try again.</p>
          <Button variant="secondary" size="sm" onClick={publish}>
            Retry
          </Button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setStep('welcome')}
        className="self-start font-mono text-xs uppercase tracking-[0.16em] text-muted transition-colors hover:text-fg focus-visible:outline-none"
      >
        Start over
      </button>
    </div>
  );
}
