import { ArrowRight, CalendarCheck, CircleAlert } from 'lucide-react';
import { useI18n } from '../i18n';
import type { Estimate } from '../../shared/pricing/engine';
import { Button, cx } from './ui';

export function DemoLabel({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <p className={cx('demo-label', compact && 'demo-label--compact')}>
      <span className="demo-label__tag">{t.common.demoPrices}</span>
      {!compact && <span>{t.common.demoNote}</span>}
    </p>
  );
}

/** The headline estimate. Pass actions=false to render it without CTAs (contact page). */
export function EstimateCard({
  est,
  estimatesEnabled,
  onOffer,
  onVisit,
  actions = true,
}: {
  est: Estimate | null;
  estimatesEnabled: boolean;
  onOffer?: () => void;
  onVisit?: () => void;
  actions?: boolean;
}) {
  const { t, moneyRange } = useI18n();
  const assessments = est?.lines.filter((l) => l.billing === 'assessment').length ?? 0;
  const vatPct = est ? Math.round(est.vat.rate * 100) : 0;
  const onlyOneTime = est && !est.monthly && est.oneTime;

  return (
    <section className="estimate" aria-labelledby="estimate-label">
      {est?.pricingStatus === 'demo' && <DemoLabel compact />}
      <p className="estimate__label" id="estimate-label">
        {onlyOneTime ? t.results.estimateLabelOneTime : t.results.estimateLabel}
      </p>

      {!estimatesEnabled || !est ? (
        <p className="estimate__none">{t.results.noEstimate}</p>
      ) : est.monthly ? (
        <p className="estimate__price" aria-live="polite">
          <span className="estimate__amount">{moneyRange(est.monthly)}</span>
          <span className="estimate__unit">{t.results.perMonth}</span>
        </p>
      ) : est.oneTime ? (
        <p className="estimate__price" aria-live="polite">
          <span className="estimate__amount">{moneyRange(est.oneTime)}</span>
          <span className="estimate__unit">{t.results.oneTimeSuffix}</span>
        </p>
      ) : (
        <p className="estimate__none">{t.results.onlyAssessment}</p>
      )}

      {est && (est.monthly || est.oneTime) && (
        <ul className="estimate__facts">
          <li>{est.vat.pricesIncludeVat ? t.results.vatIncluded(vatPct) : t.results.vatExcluded(vatPct, moneyRange(est.monthlyWithVat ?? { min: 0, max: 0 }))}</li>
          {est.perPerson && <li>{t.results.perPerson(moneyRange(est.perPerson))}</li>}
          {est.monthly && est.oneTime && <li>{t.results.oneTime(moneyRange(est.oneTime))}</li>}
        </ul>
      )}
      {est && !est.monthly && est.oneTime && !est.vat.pricesIncludeVat && (
        <ul className="estimate__facts">
          <li>{t.assumptions.vat(vatPct, false)}</li>
        </ul>
      )}

      {assessments > 0 && (
        <p className="estimate__assess">
          <CircleAlert size={16} aria-hidden /> {t.results.assessment(assessments)}
        </p>
      )}

      <p className="estimate__support">{t.results.support}</p>

      {actions && (
        <div className="estimate__actions">
          <Button size="lg" block iconRight={<ArrowRight size={18} aria-hidden />} onClick={onOffer}>
            {t.results.cta}
          </Button>
          <Button variant="secondary" block icon={<CalendarCheck size={18} aria-hidden />} onClick={onVisit}>
            {t.results.ctaVisit}
          </Button>
        </div>
      )}
    </section>
  );
}
