import { cn } from '@/lib/utils';

/**
 * The app's small stroke icon set: one 24px grid, round caps, `currentColor`. Decorative only —
 * the control carrying the icon owns the accessible name.
 */
function Icon({
  className,
  strokeWidth = 2.5,
  children,
}: {
  className?: string;
  strokeWidth?: number;
  children: React.ReactNode;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-4 w-4 shrink-0', className)}
    >
      {children}
    </svg>
  );
}

type IconProps = { className?: string };

export const XIcon = ({ className }: IconProps) => (
  <Icon className={className} strokeWidth={3}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const CheckIcon = ({ className }: IconProps) => (
  <Icon className={className} strokeWidth={3}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const PlayIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
  </Icon>
);

export const SearchIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Icon>
);

export const StarIcon = ({ className }: IconProps) => (
  <Icon className={className} strokeWidth={2}>
    <path
      d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"
      fill="currentColor"
    />
  </Icon>
);

export const ChevronDownIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M6 9.5l6 6 6-6" />
  </Icon>
);

export const ArrowUpIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
);

export const ArrowDownIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
);

export const CrownIcon = ({ className }: IconProps) => (
  <Icon className={className} strokeWidth={2}>
    <path d="M4 18l-.5-10 5 4L12 5.5 15.5 12l5-4-.5 10z" fill="currentColor" />
  </Icon>
);
