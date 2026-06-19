'use client';

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { useRef, useState } from 'react';

import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';

import { ArcadeCard, type CardState } from './ArcadeCard';

/** Movement (px) past which a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD = 6;
/** A heavy, slightly floaty follow: the cover trails the cursor and settles with weight. */
const FOLLOW_SPRING = { stiffness: 210, damping: 26, mass: 1.3 } as const;

interface DraggableArcadeCardProps {
  game: Game;
  ariaLabel: string;
  onTap: () => void;
  /** Hit-test the release point (page coords); returns true if it landed in a target. */
  onDropAt: (point: { x: number; y: number }) => boolean;
  picked?: boolean;
  state?: CardState;
  badge?: React.ReactNode;
}

/**
 * Shared heavy arcade drag card. Pointer drag uses a lagging spring for the weighty cursor feel;
 * click/touch fallback still fires `onTap`, so minigames stay usable without precision dragging.
 */
export function DraggableArcadeCard({
  game,
  ariaLabel,
  onTap,
  onDropAt,
  picked = false,
  state = 'idle',
  badge,
}: DraggableArcadeCardProps) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, FOLLOW_SPRING);
  const sy = useSpring(y, FOLLOW_SPRING);
  const rotate = useTransform(sx, [-160, 0, 160], [-9, 0, 9]);

  const [dragging, setDragging] = useState(false);
  const downRef = useRef(false);
  const draggedRef = useRef(false);
  const suppressTapRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });

  const clearSuppressionSoon = () => {
    window.setTimeout(() => {
      draggedRef.current = false;
      suppressTapRef.current = false;
    }, 60);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (reduce) return;
    if (e.button !== 0) return;
    e.preventDefault();
    downRef.current = true;
    draggedRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (reduce || !downRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (!draggedRef.current && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      draggedRef.current = true;
      setDragging(true);
      playSound('blip');
    }
    if (draggedRef.current) {
      e.preventDefault();
      x.set(dx);
      y.set(dy);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!downRef.current) return;
    downRef.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    suppressTapRef.current = true;
    if (!draggedRef.current) {
      onTap();
      clearSuppressionSoon();
      return;
    }

    setDragging(false);
    onDropAt({ x: e.clientX + window.scrollX, y: e.clientY + window.scrollY });
    x.set(0);
    y.set(0);
    clearSuppressionSoon();
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (!downRef.current) return;
    downRef.current = false;
    draggedRef.current = false;
    suppressTapRef.current = false;
    setDragging(false);
    x.set(0);
    y.set(0);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const handleTapFallback = () => {
    if (draggedRef.current || suppressTapRef.current) return;
    onTap();
  };

  const active = picked || dragging;

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className="cursor-grab touch-none select-none rounded-tile active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      style={reduce ? undefined : { x: sx, y: sy, rotate, zIndex: dragging ? 50 : undefined }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleTapFallback}
      onTouchEnd={(e) => {
        e.preventDefault();
        handleTapFallback();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap();
        }
      }}
      animate={{ scale: dragging ? 1.1 : picked ? 1.05 : 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26, mass: 1.1 }}
    >
      <ArcadeCard
        game={game}
        size="sm"
        state={active ? 'win' : state}
        badge={badge}
        className={active ? 'shadow-[0_18px_40px_rgb(0_0_0/0.5)]' : undefined}
      />
    </motion.div>
  );
}
