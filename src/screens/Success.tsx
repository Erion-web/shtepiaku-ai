import { useEffect, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { useI18n } from '../i18n';
import { useRouter } from '../lib/router';
import { useStore } from '../state/store';
import { useBoothReset } from '../state/booth';
import { Button, PageTitle } from '../components/ui';

export const SUCCESS_RESET_SECONDS = 45;

export function Success() {
  const { t } = useI18n();
  const { state, booth } = useStore();
  const { navigate } = useRouter();
  const boothReset = useBoothReset();
  const [left, setLeft] = useState(SUCCESS_RESET_SECONDS);
  const lead = state.lead;

  useEffect(() => {
    if (!lead) navigate('/', { replace: true });
  }, [lead, navigate]);

  useEffect(() => {
    if (!booth || !lead) return;
    if (left <= 0) {
      boothReset();
      return;
    }
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [booth, lead, left, boothReset]);

  if (!lead) return null;

  return (
    <div className="success container">
      <div className="card success__card">
        <span className="success__icon" aria-hidden>
          <Check size={32} strokeWidth={2.5} />
        </span>
        <PageTitle className="success__title">{t.success.title}</PageTitle>
        <p className="success__body">{t.success.body}</p>
        {lead.dataset === 'demo' && <p className="note">{t.success.demo}</p>}
        <p className="success__ref">{t.success.reference(lead.id.slice(0, 8).toUpperCase())}</p>
        <div className="success__actions">
          {booth ? (
            <>
              <Button size="lg" icon={<RotateCcw size={18} aria-hidden />} onClick={boothReset}>
                {t.booth.reset}
              </Button>
              <p className="note" aria-live="off">
                {t.booth.successCountdown(left)}
              </p>
            </>
          ) : (
            <Button variant="secondary" onClick={boothReset}>
              {t.success.home}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
