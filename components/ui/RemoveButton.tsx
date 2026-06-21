'use client';

/**
 * A small circular "X" pinned to the top-right corner of a cover. Deletes the game from the pool.
 * It sits over drag/select surfaces (arcade cards, the reveal board), so every pointer/touch event
 * is stopped from propagating — otherwise pressing it would start a drag or trigger a card pick.
 */
export function RemoveButton({ onClick, title }: { onClick: () => void; title: string }) {
  const fire = (
    e:
      | React.MouseEvent<HTMLButtonElement>
      | React.TouchEvent<HTMLButtonElement>
      | React.PointerEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
  };

  return (
    <button
      type="button"
      aria-label={`Remove ${title}`}
      onPointerDown={fire}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      className="absolute -right-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-bg text-muted shadow-soft transition-colors hover:border-red-500 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
