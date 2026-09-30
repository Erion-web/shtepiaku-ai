import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useI18n } from '../i18n';
import { Link, useRouter } from '../lib/router';
import { useStore } from '../state/store';
import { Button, Modal, Segmented } from './ui';
import { useBoothReset } from '../state/booth';

export function Header() {
  const { t, lang, setLang } = useI18n();
  const { booth, state } = useStore();
  const { path } = useRouter();
  const reset = useBoothReset();
  const [confirm, setConfirm] = useState(false);
  const isStaff = path.startsWith('/staff');
  const showReset = booth && !isStaff && (state.answersRev > 0 || path !== '/');

  return (
    <header className="header">
      <a className="skip-link" href="#main">
        {t.common.skipToContent}
      </a>
      <div className="header__inner container">
        <Link to={isStaff ? '/staff' : '/'} className="logo">
          <img className="logo__img" src="/logo.png" alt={t.common.brand} width={378} height={96} />
        </Link>
        <span className="edition">{t.common.edition}</span>
        {booth && !isStaff && <span className="edition edition--booth">{t.booth.badge}</span>}

        <div className="header__actions">
          {showReset && (
            <Button variant="secondary" icon={<RotateCcw size={18} aria-hidden />} onClick={() => setConfirm(true)} className="header__reset" aria-label={t.booth.reset}>
              <span className="hide-sm">{t.booth.reset}</span>
              <span className="show-sm">{t.booth.resetShort}</span>
            </Button>
          )}
          <Segmented
            label={t.common.languageLabel}
            hideLabel
            size="sm"
            value={lang}
            onChange={setLang}
            options={[
              { value: 'sq', label: 'AL', ariaLabel: 'Shqip' },
              { value: 'en', label: 'EN', ariaLabel: 'English' },
            ]}
          />
        </div>
      </div>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t.booth.confirmTitle}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t.common.cancel}
            </Button>
            <Button
              onClick={() => {
                setConfirm(false);
                reset();
              }}
            >
              {t.booth.confirmCta}
            </Button>
          </>
        }
      >
        <p>{t.booth.confirmBody}</p>
      </Modal>
    </header>
  );
}
