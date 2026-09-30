import { ArrowRight, Check, Clock } from 'lucide-react';
import { useI18n } from '../i18n';
import { useRouter } from '../lib/router';
import { useStore } from '../state/store';
import { firstIncompleteStep, TOTAL_STEPS } from '../state/answers';
import { Button, PageTitle } from '../components/ui';
import { ServiceIcon } from '../components/icons';
import { SERVICES } from '../../shared/catalog';
import type { ServiceId } from '../../shared/types';

export function Welcome() {
  const { t, lang } = useI18n();
  const { state, booth } = useStore();
  const { navigate } = useRouter();
  const hasProgress = !booth && state.answersRev > 0;
  const next = firstIncompleteStep(state.answers);

  return (
    <div className="welcome container">
      <section className="welcome__intro">
        <p className="eyebrow">{t.welcome.support}</p>
        <PageTitle className="welcome__title">{t.welcome.title}</PageTitle>
        <p className="welcome__lead">{t.welcome.lead}</p>
        <div className="welcome__cta">
          <Button size="lg" iconRight={<ArrowRight size={20} aria-hidden />} onClick={() => navigate(hasProgress ? (next > TOTAL_STEPS ? '/rezultati' : `/plan/${next}`) : '/plan/1')}>
            {hasProgress ? t.welcome.resume : t.welcome.cta}
          </Button>
          <p className="welcome__micro">
            <Clock size={16} aria-hidden />
            {t.welcome.micro}
          </p>
        </div>
        <p className="welcome__trust">
          <span className="welcome__trust-mark" aria-hidden />
          {t.welcome.trust}
        </p>
      </section>

      <section className="sample" aria-labelledby="sample-title">
        <div className="sample__card">
          <div className="sample__head">
            <span className="sample__tag">{t.welcome.sample.tag}</span>
            <h2 className="sample__title" id="sample-title">
              {t.welcome.sample.title}
            </h2>
            <p className="sample__meta">{t.welcome.sample.meta}</p>
          </div>
          <ul className="sample__rows">
            {t.welcome.sample.rows.map((r) => {
              const s = r.service as ServiceId;
              return (
                <li key={s} className="sample__row">
                  <span className="sample__icon">
                    <ServiceIcon id={s} size={18} />
                  </span>
                  <span className="sample__text">
                    <span className="sample__name">{SERVICES[s].name[lang]}</span>
                    <span className="sample__detail">{r.detail}</span>
                  </span>
                  <span className="sample__check" aria-hidden>
                    <Check size={14} strokeWidth={3} />
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="sample__foot">{t.welcome.sample.footer}</p>
        </div>
      </section>
    </div>
  );
}
