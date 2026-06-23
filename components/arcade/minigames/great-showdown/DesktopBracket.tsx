'use client';

import { motion, useReducedMotion } from 'framer-motion';

import type { Game } from '@/lib/games/types';
import { cn } from '@/lib/utils';

import type { ShowdownViewProps } from '../GreatShowdown';
import { ArcadeCard, type CardState } from '../ArcadeCard';
import { MinigameHeader } from '../MinigameHeader';
import { getBout, roundHeading, type Bout } from './tournament';

/**
 * Desktop presentation: the whole bracket at once — two mirrored halves feeding a centered finale,
 * with the redemption duels on a rail below. The active bout glows; decided bouts show the winner and
 * dim the loser. Connectors light as each side resolves ("the bracket fills with light").
 */
export function DesktopBracket({ gameById, state, active, pendingWinnerId, champion, onPick }: ShowdownViewProps) {
  const { title, position } = roundHeading(state);
  const activeId = active?.id ?? null;

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
    />
  );

  return (
    <div className="flex flex-col items-center">
      <MinigameHeader
        tone="accent"
        eyebrow="The Great Showdown"
        title={champion !== null ? 'We have a champion.' : title}
        hint={champion !== null ? '9 bouts · settled' : position ? `${position} · 9 bouts` : '9 bouts'}
      />

      <div className="flex w-full justify-center overflow-visible pb-2">
        {/* Shrink the cover token locally so all five bout columns + connectors fit common desktop
            widths (1280–1440); the active matchup scales with transform so layout stays fixed. */}
        <div
          className="flex items-stretch gap-2 lg:gap-3 [--cover-zone:clamp(3.25rem,5vw,4.75rem)]"
        >
          {/* Left half: two quarters feed semifinal 1. */}
          <div className="flex flex-col justify-center gap-4">
            {box('QF1', 'Quarter 1')}
            {box('QF2', 'Quarter 2')}
          </div>
          <Connector lit={!!getBout(state, 'SF1')} />
          <div className="flex flex-col justify-center">{box('SF1', 'Semifinal 1')}</div>
          <Connector lit={!!getBout(state, 'F')} />

          {/* Finale. */}
          <div className="flex flex-col justify-center">{box('F', 'Finale')}</div>

          {/* Right half mirrors the left. */}
          <Connector lit={!!getBout(state, 'F')} />
          <div className="flex flex-col justify-center">{box('SF2', 'Semifinal 2')}</div>
          <Connector lit={!!getBout(state, 'SF2')} />
          <div className="flex flex-col justify-center gap-4">
            {box('QF3', 'Quarter 3')}
            {box('QF4', 'Quarter 4')}
          </div>
        </div>
      </div>

      {/* Redemption rail — the first-round losers get a second chance. */}
      <div className="mt-3 flex flex-col items-center gap-1.5 border-t border-border/60 pt-3">
        <span className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-coin">
          Redemption
        </span>
        <div className="flex gap-4">
          {box('R1')}
          {box('R2')}
        </div>
      </div>
    </div>
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
}: {
  id: string;
  bout: Bout | undefined;
  label?: string;
  activeId: string | null;
  pendingWinnerId: number | null;
  champion: number | null;
  gameById: Map<number, Game>;
  onPick: (winnerId: number) => void;
}) {
  const isActive = bout != null && bout.id === activeId;
  const isFinale = bout?.round === 'finale';
  const decided = bout?.winnerId != null;
  const isRedemption = bout?.round === 'redemption';

  const stateFor = (id: number): CardState => {
    if (champion === id) return 'win';
    if (!bout) return 'dim';
    if (bout.winnerId != null) return bout.winnerId === id ? 'win' : 'lose';
    if (isActive) return pendingWinnerId == null ? 'idle' : pendingWinnerId === id ? 'win' : 'lose';
    return 'dim';
  };

  return (
    <div
      data-showdown-bout={id}
      data-active={isActive ? 'true' : 'false'}
      className={cn(
        'relative flex flex-col gap-1 rounded-tile border p-1.5 transition-[border-color,background-color,transform,filter] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform motion-reduce:transition-none',
        transformOriginFor(id),
        isActive
          ? isRedemption
            ? 'z-20 scale-[1.14] shadow-[0_16px_46px_rgb(0_0_0/0.38)] xl:scale-[1.20] 2xl:scale-[1.24]'
            : 'z-20 scale-[1.28] shadow-[0_18px_54px_rgb(0_0_0/0.42)] xl:scale-[1.36] 2xl:scale-[1.42]'
          : 'z-0 scale-100',
        isActive
          ? isFinale
            ? 'border-teal/70 bg-teal/5'
            : 'border-accent/60 bg-accent/5'
          : decided
            ? 'border-border'
            : 'border-dashed border-border/60',
      )}
    >
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
    </div>
  );
}

function transformOriginFor(id: string) {
  switch (id) {
    case 'QF1':
      return 'origin-bottom-left';
    case 'QF2':
      return 'origin-top-left';
    case 'QF3':
      return 'origin-bottom-right';
    case 'QF4':
      return 'origin-top-right';
    case 'SF1':
      return 'origin-left';
    case 'SF2':
      return 'origin-right';
    case 'R1':
    case 'R2':
      return 'origin-top';
    default:
      return 'origin-center';
  }
}

function Slot() {
  return (
    <div className="aspect-[3/4] w-[var(--cover-zone)] rounded-tile border border-dashed border-border/50 bg-surface/20" />
  );
}

function Connector({ lit }: { lit: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex items-center" aria-hidden>
      <motion.span
        className="h-px w-4 rounded-full lg:w-6"
        initial={false}
        animate={{
          backgroundColor: lit ? 'rgb(var(--color-accent))' : 'rgb(var(--color-border))',
        }}
        transition={{ duration: reduce ? 0 : 0.3 }}
      />
    </div>
  );
}
