// Booth mode for shared tablets: one-tap reset and an inactivity guard.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { useRouter } from '../lib/router';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { Button, Modal } from '../components/ui';

export const IDLE_MS = 90_000;
export const WARNING_SECONDS = 30;

/** Clears the visitor's data, drops any staff session on the device and returns to the start. */
export function useBoothReset() {
  const { reset } = useStore();
  const { navigate } = useRouter();
  return useCallback(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    reset();
    navigate('/', { replace: true });
    api.staff.logout().catch(() => {
      /* no session or offline: nothing to clear */
    });
  }, [reset, navigate]);
}

export function BoothController({ idleMs = IDLE_MS, warningSeconds = WARNING_SECONDS }: { idleMs?: number; warningSeconds?: number }) {
  const { booth, state } = useStore();
  const { path } = useRouter();
  const { t } = useI18n();
  const reset = useBoothReset();
  const [warning, setWarning] = useState<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const active = booth && !path.startsWith('/staff') && (state.answersRev > 0 || path !== '/');

  const arm = useCallback(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setWarning(warningSeconds), idleMs);
  }, [idleMs, warningSeconds]);

  useEffect(() => {
    if (!active) {
      clearTimeout(idleTimer.current);
      setWarning(null);
      return;
    }
    arm();
    const onActivity = () => {
      if (warning === null) arm();
    };
    const events = ['pointerdown', 'keydown', 'input', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      clearTimeout(idleTimer.current);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [active, arm, warning]);

  useEffect(() => {
    if (warning === null) return;
    if (warning <= 0) {
      setWarning(null);
      reset();
      return;
    }
    const id = setTimeout(() => setWarning((w) => (w === null ? null : w - 1)), 1000);
    return () => clearTimeout(id);
  }, [warning, reset]);

  return (
    <Modal
      open={warning !== null}
      onClose={() => {
        setWarning(null);
        arm();
      }}
      title={t.booth.idleTitle}
      actions={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setWarning(null);
              reset();
            }}
          >
            {t.booth.idleReset}
          </Button>
          <Button
            size="lg"
            autoFocus
            onClick={() => {
              setWarning(null);
              arm();
            }}
          >
            {t.booth.idleContinue}
          </Button>
        </>
      }
    >
      <p aria-live="polite">{t.booth.idleBody(warning ?? warningSeconds)}</p>
    </Modal>
  );
}
