import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { useConfig } from '../state/config';
import { api } from '../lib/api';
import { deterministicExplanation } from '../../shared/explain';
import { planKey } from '../../shared/plans';
import type { Arrangement, PlanConfig, WorkspaceProfile } from '../../shared/types';

const cache = new Map<string, string | null>();
export const clearExplanationCache = () => cache.clear();

/**
 * Plan explanation. Uses the AI text when the server provides a validated one;
 * otherwise shows the deterministic explanation immediately.
 */
export function Explanation({ ws, plan, arrangement }: { ws: WorkspaceProfile; plan: PlanConfig; arrangement: Arrangement | null }) {
  const { t, lang } = useI18n();
  const { config } = useConfig();
  const fallback = useMemo(() => deterministicExplanation({ lang, ws, plan, arrangement }), [lang, ws, plan, arrangement]);
  const key = `${lang}|${JSON.stringify(ws)}|${planKey(plan)}|${arrangement}`;
  const aiEnabled = Boolean(config?.aiEnabled && config.online);
  const [state, setState] = useState<{ key: string; text: string | null; loading: boolean }>(() => ({ key, text: cache.get(key) ?? null, loading: false }));

  useEffect(() => {
    if (!aiEnabled) return;
    if (cache.has(key)) {
      setState({ key, text: cache.get(key) ?? null, loading: false });
      return;
    }
    const ctrl = new AbortController();
    setState({ key, text: null, loading: true });
    // Short debounce so rapid toggles on the results page send one request.
    const timer = setTimeout(() => {
      api
        .explain({ lang, workspace: { ...ws, city: '' }, plan, arrangement }, ctrl.signal)
        .then((r) => {
          cache.set(key, r.text);
          setState({ key, text: r.text, loading: false });
        })
        .catch(() => {
          if (ctrl.signal.aborted) return;
          cache.set(key, null);
          setState({ key, text: null, loading: false });
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, aiEnabled, lang, ws, plan, arrangement]);

  const current = state.key === key ? state : { text: cache.get(key) ?? null, loading: aiEnabled && !cache.has(key) };
  const isAi = Boolean(current.text);

  return (
    <section className="card explain" aria-labelledby="explain-title" aria-busy={current.loading}>
      <h2 className="section-title" id="explain-title">
        {t.results.why}
      </h2>
      {current.loading ? (
        <div className="explain__loading" role="status">
          <span className="skeleton skeleton--line" />
          <span className="skeleton skeleton--line" />
          <span className="skeleton skeleton--line skeleton--short" />
          <span className="sr-only">{t.results.explaining}</span>
        </div>
      ) : (
        <p className="explain__text">{current.text ?? fallback}</p>
      )}
      {isAi && !current.loading && <p className="explain__meta">{t.results.aiSource}</p>}
      {!aiEnabled && config?.dev && <p className="dev-note">{t.results.aiDevOff}</p>}
    </section>
  );
}
