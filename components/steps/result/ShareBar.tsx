'use client';

import { useState } from 'react';

import type { Game } from '@/lib/games/types';
import type { SnapshotGame } from '@/lib/lists-repo';
import { TIER_ORDER, type TierMap } from '@/lib/ranking';
import { clearLocalSession } from '@/lib/session-local';
import { playSound } from '@/lib/sound';
import { useStore } from '@/lib/store';

import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';

export interface ShareBarProps {
  tiers: TierMap;
  gamesById: Map<number, Game>;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Header-mounted variant for phones. The full bar renders *after* the board, which on a phone
   * is a long scroll away — sharing is the point of the screen, so on mobile it moves up beside
   * the title as a single button that expands into the link once published.
   */
  compact?: boolean;
  /**
   * Drop the publish/link controls and keep only "Start over". Used on mobile, where a `compact`
   * instance in the header already owns publishing — this leaves the reset action in its usual
   * place at the end of the board without a duplicate, divergent publish state.
   */
  hidePublish?: boolean;
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

export interface ShareController {
  state: State;
  copied: boolean;
  publish: () => Promise<void>;
  copy: () => Promise<void>;
}

/**
 * Publish/copy state for a tier list. Lifted out of `ShareBar` so it can live in `ResultStep`:
 * the compact (header) and full (below-board) presentations mount on opposite sides of the mobile
 * breakpoint, and with the state inside the component a rotate or resize across that breakpoint
 * swapped in a fresh instance and lost the published URL.
 */
export function useShare({ tiers, gamesById, fetchImpl }: ShareBarProps): ShareController {
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

  return { state, copied, publish, copy };
}

/**
 * Publishes the current tier list and surfaces a short shareable link. No account needed — the
 * snapshot is anonymous and immutable. (Image export is a later phase; this ships the link.)
 *
 * Pass `share` to drive it from a lifted controller; without one it owns its own state, which
 * keeps standalone use (and its tests) working unchanged.
 */
export function ShareBar({
  tiers,
  gamesById,
  fetchImpl,
  compact = false,
  hidePublish = false,
  share,
}: ShareBarProps & { share?: ShareController }) {
  const [confirmReset, setConfirmReset] = useState(false);
  // Always called (hooks can't be conditional); ignored when a controller is supplied. The
  // unused instance is inert — it holds idle state and never fetches.
  const own = useShare({ tiers, gamesById, fetchImpl });
  const { state, copied, publish, copy } = share ?? own;

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        {state.kind === 'ready' ? (
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-tile border border-border bg-bg px-3 py-2 font-mono text-xs text-fg">
              {state.url}
            </code>
            <Button variant="secondary" size="sm" onClick={copy}>
              {copied ? 'Copied ✓' : 'Copy'}
            </Button>
          </div>
        ) : (
          <Button
            onClick={publish}
            loading={state.kind === 'publishing'}
            className="w-full"
          >
            {state.kind === 'error' ? 'Retry share' : 'Share my list →'}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6">
      {hidePublish ? null : (
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
      )}

      {!hidePublish && state.kind === 'ready' ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="flex-1 truncate rounded-tile border border-border bg-bg px-4 py-3 font-mono text-sm text-fg">
            {state.url}
          </code>
          <Button variant="secondary" onClick={copy}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </Button>
        </div>
      ) : null}

      {!hidePublish && state.kind === 'error' ? (
        <div className="flex items-center justify-between gap-3 rounded-tile border border-coin/50 bg-coin/10 px-4 py-3">
          <p className="text-sm text-fg">Couldn’t publish just now. Try again.</p>
          <Button variant="secondary" size="sm" onClick={publish}>
            Retry
          </Button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setConfirmReset(true)}
        className="self-start font-mono text-xs uppercase tracking-[0.16em] text-muted transition-colors hover:text-fg focus-visible:outline-none"
      >
        Start over
      </button>

      <ConfirmDialog
        open={confirmReset}
        title="Start over?"
        body="This clears your games, rankings, and progress on this device. Published links keep working."
        confirmLabel="Start over"
        cancelLabel="Cancel"
        onConfirm={() => {
          // Reload after clearing: keep-alive steps hold in-memory state (pool slots, engine,
          // board) that a store reset alone would leave stale.
          clearLocalSession();
          window.location.reload();
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
