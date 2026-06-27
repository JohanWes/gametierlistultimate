'use client';

import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion';

import type { Game } from '@/lib/games/types';
import { cn } from '@/lib/utils';

import type { ShowdownViewProps } from '../GreatShowdown';
import { ArcadeCard, type CardState } from '../ArcadeCard';
import { MinigameHeader } from '../MinigameHeader';
import { getBout, roundHeading, type Bout } from './tournament';

/**
 * Desktop presentation: the whole bracket at once — two mirrored halves feeding a centered finale.
 * The active bout grows for real (a larger `--cover-zone`) and the tree reflows around it via
 * framer `layout`, so titles stay crisp (no scale blur). The redemption duels are *not* a permanent
 * rail; they pop up in the foreground after the quarters resolve and dissolve as the semifinals
 * light up — freeing the layout and giving the "second chance" its own beat.
 */
export function DesktopBracket({
  gameById,
  state,
  active,
  pendingWinnerId,
  champion,
  onPick,
}: ShowdownViewProps) {
  const reduce = useReducedMotion();
  const { title, position } = roundHeading(state);
  const activeId = active?.id ?? null;
  const redemptionActive = active?.round === 'redemption';

  const box = (id: string, label?: string) => (
    <BoutBox
      id={id}
      bout={getBout(state, id)}
      label={label}
      activeId={activeId}
      pendingWinnerId={pendingWinnerId}
      champion={champion}
      gameById={gameById}
      onPick={onPick}
      reduce={reduce}
    />
  );

  return (
    // Base cover token lives on the root so every bout column inherits one consistent size; the
    // active bout overrides it locally to grow.
    <div className="flex flex-col items-center [--cover-zone:clamp(3.5rem,4.6vw,5rem)]">
      <MinigameHeader
        tone="accent"
        eyebrow="The Great Showdown"
        title={champion !== null ? 'We have a champion.' : title}
        hint={champion !== null ? '9 bouts · settled' : position ? `${position} · 9 bouts` : '9 bouts'}
      />

      <div className="relative flex w-full justify-center pb-2">
        <div className="flex items-stretch gap-2 lg:gap-3">
          {/* Left half: two quarters feed semifinal 1. */}
          <div className="flex flex-col items-center justify-center gap-4">
            {box('QF1', 'Quarter 1')}
            {box('QF2', 'Quarter 2')}
          </div>
          <Connector lit={!!getBout(state, 'SF1')} reduce={reduce} />
          <div className="flex flex-col items-center justify-center">{box('SF1', 'Semifinal 1')}</div>
          <Connector lit={!!getBout(state, 'F')} reduce={reduce} />

          {/* Finale. */}
          <div className="flex flex-col items-center justify-center">{box('F', 'Finale')}</div>

          {/* Right half mirrors the left. */}
          <Connector lit={!!getBout(state, 'F')} reduce={reduce} />
          <div className="flex flex-col items-center justify-center">{box('SF2', 'Semifinal 2')}</div>
          <Connector lit={!!getBout(state, 'SF2')} reduce={reduce} />
          <div className="flex flex-col items-center justify-center gap-4">
            {box('QF3', 'Quarter 3')}
            {box('QF4', 'Quarter 4')}
          </div>
        </div>

        {/* Redemption — pops into the foreground over a dimmed bracket while its duels are live. */}
        <AnimatePresence>
          {redemptionActive ? (
            <RedemptionOverlay
              state={state}
              activeId={activeId}
              pendingWinnerId={pendingWinnerId}
              champion={champion}
              gameById={gameById}
              onPick={onPick}
              reduce={reduce}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function RedemptionOverlay({
  state,
  activeId,
  pendingWinnerId,
  champion,
  gameById,
  onPick,
  reduce,
}: {
  state: ShowdownViewProps['state'];
  activeId: string | null;
  pendingWinnerId: number | null;
  champion: number | null;
  gameById: Map<number, Game>;
  onPick: (winnerId: number) => void;
  reduce: boolean | null;
}) {
  // While AnimatePresence plays the exit, the bracket has already advanced to the next bout. Drop
  // the redemption bouts' active state during exit so the foreground never holds a second
  // `data-active` bout (or a live, tappable card) over the new semifinal.
  const isPresent = useIsPresent();
  const effectiveActiveId = isPresent ? activeId : null;

  return (
    <motion.div
      data-showdown-redemption-overlay
      aria-hidden={!isPresent}
      className={cn(
        'absolute inset-0 z-30 flex items-center justify-center',
        !isPresent && 'pointer-events-none',
      )}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.22 }}
    >
      <div className="absolute inset-0 bg-bg/72 backdrop-blur-sm" aria-hidden />

      <motion.div
        className="relative flex flex-col items-center gap-3 rounded-card border border-coin/40 bg-surface/95 px-7 py-5 shadow-[0_24px_70px_rgb(0_0_0/0.5)] [--cover-zone:clamp(6.5rem,9vw,9rem)]"
        initial={reduce ? false : { opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 10 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 26 }}
      >
        <div className="flex flex-col items-center gap-0.5 text-center">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-coin">
            Redemption
          </span>
          <span className="text-xs text-muted">Second chance — the first-round losers duel again.</span>
        </div>
        <div className="flex gap-6">
          {(['R1', 'R2'] as const).map((id) => (
            <BoutBox
              key={id}
              id={id}
              bout={getBout(state, id)}
              activeId={effectiveActiveId}
              pendingWinnerId={pendingWinnerId}
              champion={champion}
              gameById={gameById}
              onPick={onPick}
              reduce={reduce}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function BoutBox({
  id,
  bout,
  label,
  activeId,
  pendingWinnerId,
  champion,
  gameById,
  onPick,
  reduce,
}: {
  id: string;
  bout: Bout | undefined;
  label?: string;
  activeId: string | null;
  pendingWinnerId: number | null;
  champion: number | null;
  gameById: Map<number, Game>;
  onPick: (winnerId: number) => void;
  reduce: boolean | null;
}) {
  const isActive = bout != null && bout.id === activeId;
  const isFinale = bout?.round === 'finale';
  const decided = bout?.winnerId != null;
  const isRedemption = bout?.round === 'redemption';
  // Grow the active bout for real — but not in the redemption pop-up, which is already enlarged and
  // leans on the glow instead (an active override there would shrink the card below its sibling).
  const grow = isActive && !isRedemption;

  const stateFor = (id: number): CardState => {
    if (champion === id) return 'win';
    if (!bout) return 'dim';
    if (bout.winnerId != null) return bout.winnerId === id ? 'win' : 'lose';
    if (isActive) return pendingWinnerId == null ? 'idle' : pendingWinnerId === id ? 'win' : 'lose';
    return 'dim';
  };

  return (
    <motion.div
      layout={!reduce}
      data-showdown-bout={id}
      data-active={isActive ? 'true' : 'false'}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 30 }}
      className={cn(
        'relative flex flex-col gap-1 rounded-tile border p-1.5 transition-[opacity,border-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        // The active bout is the hero: grow it for real and lift it clear of the tree.
        grow && 'z-20 -translate-y-1 [--cover-zone:clamp(6rem,8.5vw,9rem)]',
        // Push the rest of the bracket back so the live bout owns the eye (ambient context, not gone).
        !isActive && 'opacity-65',
        isActive
          ? isFinale
            ? 'border-teal/80 bg-teal/5 shadow-[0_18px_50px_rgb(0_0_0/0.42),0_0_38px_rgb(var(--color-teal)/0.32)]'
            : 'border-accent/70 bg-accent/5 shadow-[0_18px_50px_rgb(0_0_0/0.42),0_0_38px_rgb(var(--color-accent)/0.32)]'
          : decided
            ? 'border-border'
            : 'border-dashed border-border/60',
      )}
    >
      {grow ? (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute -inset-7 -z-10 rounded-full blur-2xl',
            isFinale
              ? 'bg-[radial-gradient(circle,rgb(var(--color-teal)/0.18),transparent_70%)]'
              : 'bg-[radial-gradient(circle,rgb(var(--color-accent)/0.18),transparent_70%)]',
          )}
        />
      ) : null}
      {label ? (
        <span
          className={cn(
            'text-center font-mono text-[0.5rem] uppercase tracking-[0.16em]',
            isActive ? 'text-accent' : 'text-muted/60',
          )}
        >
          {label}
        </span>
      ) : null}
      <div className="flex gap-1.5">
        {bout
          ? [bout.a, bout.b].map((id) => {
              const game = gameById.get(id);
              if (!game) return <Slot key={id} />;
              return (
                <ArcadeCard
                  key={id}
                  game={game}
                  size="zone"
                  state={stateFor(id)}
                  badge={champion === id ? '♛' : undefined}
                  onSelect={isActive ? () => onPick(id) : undefined}
                />
              );
            })
          : [<Slot key="a" />, <Slot key="b" />]}
      </div>
    </motion.div>
  );
}

function Slot() {
  return (
    <div className="aspect-[3/4] w-[var(--cover-zone)] rounded-tile border border-dashed border-border/50 bg-surface/20" />
  );
}

function Connector({ lit, reduce }: { lit: boolean; reduce: boolean | null }) {
  return (
    <motion.div layout={!reduce} className="flex items-center" aria-hidden>
      <motion.span
        className="h-px w-4 rounded-full lg:w-6"
        initial={false}
        animate={{
          backgroundColor: lit ? 'rgb(var(--color-accent))' : 'rgb(var(--color-border))',
        }}
        transition={{ duration: reduce ? 0 : 0.3 }}
      />
    </motion.div>
  );
}
