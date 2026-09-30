import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Lang } from '../../shared/types';
import { sq, type Dict } from './sq';
import { en } from './en';

const DICTS: Record<Lang, Dict> = { sq, en };
const STORAGE_KEY = 'sh_lang';

interface I18n {
  lang: Lang;
  t: Dict;
  setLang: (l: Lang) => void;
  /** "€1 240" style amount; whole euros. */
  money: (n: number) => string;
  /** "€495–€745", collapsing equal ends to a single amount. */
  moneyRange: (r: { min: number; max: number }, opts?: { signed?: boolean }) => string;
  num: (n: number, digits?: number) => string;
}

const Ctx = createContext<I18n | null>(null);

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'en' ? 'en' : 'sq';
  } catch {
    return 'sq';
  }
}

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initial ?? readStoredLang);

  useEffect(() => {
    document.documentElement.lang = DICTS[lang].meta.htmlLang;
  }, [lang]);

  const value = useMemo<I18n>(() => {
    const locale = lang === 'sq' ? 'sq-AL' : 'en-GB';
    const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const money = (n: number) => `€${fmt.format(Math.round(Math.abs(n)))}`;
    return {
      lang,
      t: DICTS[lang],
      setLang: (l) => {
        setLangState(l);
        try {
          localStorage.setItem(STORAGE_KEY, l);
        } catch {
          /* storage unavailable: the choice lasts for this session only */
        }
      },
      money: (n) => (n < 0 ? `−${money(n)}` : money(n)),
      moneyRange: (r, opts) => {
        const a = Math.round(r.min);
        const b = Math.round(r.max);
        const sign = a < 0 && b <= 0 ? '−' : opts?.signed && a >= 0 && b >= 0 ? '+' : '';
        const one = (n: number) => (sign ? money(n) : n < 0 ? `−${money(n)}` : money(n));
        return a === b ? `${sign}${one(a)}` : `${sign}${one(a)}–${one(b)}`;
      },
      num: (n, digits = 0) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n),
    };
  }, [lang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}
