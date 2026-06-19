import Link from 'next/link';

import { SharedBoard } from '@/components/steps/result/SharedBoard';
import { AppShell } from '@/components/ui/AppShell';
import { getList } from '@/lib/lists-repo';

/**
 * Public, read-only view of a shared tier list. Fetches the immutable snapshot by shareId and
 * renders the same board the owner sees — clean enough to screenshot, no sign-in required.
 */
export default async function SharedListPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const list = await getList(shareId);

  if (!list) {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 text-center">
          <span className="font-mono text-xs uppercase tracking-[0.22em] text-teal">Shared list</span>
          <h1 className="font-display text-4xl font-black uppercase leading-none tracking-[0.02em] text-fg">
            This list isn’t here.
          </h1>
          <p className="text-muted">
            The link may be wrong or the list was never published. Build your own instead.
          </p>
          <Link
            href="/"
            className="rounded-tile border border-accent bg-accent px-5 py-3 font-display text-sm font-bold uppercase tracking-[0.08em] text-bg shadow-cabinet transition-colors hover:bg-accent/90"
          >
            Build my tier list →
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-1 flex-col">
        <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.22em] text-teal">
              A shared tier list
            </p>
            <h1 className="font-display text-4xl font-black uppercase leading-[0.95] tracking-[0.02em] text-fg sm:text-5xl">
              The best games they’ve played.
            </h1>
          </div>
          <Link
            href="/"
            className="shrink-0 self-start rounded-tile border border-accent bg-accent px-5 py-3 font-display text-sm font-bold uppercase tracking-[0.08em] text-bg shadow-cabinet transition-colors hover:bg-accent/90"
          >
            Build your own →
          </Link>
        </div>

        <div className="mt-6">
          <SharedBoard tiers={list.tiers} games={list.games} />
        </div>
      </div>
    </AppShell>
  );
}
