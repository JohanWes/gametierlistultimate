import { AppShell } from '@/components/ui/AppShell';

/**
 * Public view of a shared tier list. Phase 3 ships the shell only; the real shared-list
 * rendering is wired up in Phases 8/10 (fetch by shareId → animated tier reveal).
 */
export default async function SharedListPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;

  return (
    <AppShell>
      <div className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 text-center">
        <span className="font-mono text-xs uppercase tracking-[0.22em] text-accent">
          Shared list
        </span>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg">
          This tier list isn’t ready to show yet.
        </h1>
        <p className="text-muted">
          Public shared lists render here soon. Reference:{' '}
          <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-fg">{shareId}</code>
        </p>
      </div>
    </AppShell>
  );
}
