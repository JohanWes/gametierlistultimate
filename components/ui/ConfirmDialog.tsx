'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { Button } from './Button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Generic yes/no confirmation modal. Mirrors the TierPicker sheet: a dimmed backdrop (tap to
 * cancel) and a spring-in dialog. Both buttons fire on mouse + touch via the shared Button.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            aria-label={cancelLabel}
            onClick={onCancel}
            className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-label={title}
            initial={reduce ? false : { y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="relative z-10 w-full max-w-md rounded-t-card border-2 border-border bg-panel p-5 shadow-cabinet sm:rounded-card"
          >
            <h2 className="font-display text-2xl font-black uppercase tracking-[0.02em] text-fg">
              {title}
            </h2>
            {body ? <p className="mt-2 text-sm leading-6 text-muted">{body}</p> : null}

            <div className="mt-5 flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={onCancel}>
                {cancelLabel}
              </Button>
              <Button onClick={onConfirm}>{confirmLabel}</Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
