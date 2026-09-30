// Visit state: everything one visitor enters. Contact details live only in memory.
// Outside booth mode, non-contact answers survive a page refresh via sessionStorage.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Answers, PlanConfig, PlanTier, RequestType } from '../../shared/types';
import { emptyAnswers } from './answers';

export interface ContactDraft {
  fullName: string;
  role: string;
  email: string;
  phone: string;
  preferredContact: 'email' | 'phone' | 'whatsapp';
  note: string;
  marketingOptIn: boolean;
  website: string;
}

export const emptyContact = (): ContactDraft => ({
  fullName: '',
  role: '',
  email: '',
  phone: '',
  preferredContact: 'email',
  note: '',
  marketingOptIn: false,
  website: '',
});

export interface ResultsState {
  tier: PlanTier;
  plan: PlanConfig | null;
  /** answersRev the plan was built from; a mismatch rebuilds it. */
  basedOnRev: number;
  customized: boolean;
}

export interface VisitState {
  visitId: string;
  answers: Answers;
  answersRev: number;
  furthestStep: number;
  results: ResultsState;
  requestType: RequestType;
  contact: ContactDraft;
  /** One key per contact attempt series; reused on retry so the server can deduplicate. */
  idempotencyKey: string;
  lead: { id: string; dataset: string } | null;
}

const SESSION_KEY = 'sh_visit_v1';
const BOOTH_KEY = 'sh_booth';

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));

export function freshVisit(): VisitState {
  return {
    visitId: uuid(),
    answers: emptyAnswers(),
    answersRev: 0,
    furthestStep: 1,
    results: { tier: 'recommended', plan: null, basedOnRev: -1, customized: false },
    requestType: 'offer',
    contact: emptyContact(),
    idempotencyKey: uuid(),
    lead: null,
  };
}

function safeSession<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

function loadVisit(booth: boolean): VisitState {
  const base = freshVisit();
  if (booth) return base;
  const raw = safeSession(() => sessionStorage.getItem(SESSION_KEY));
  if (!raw) return base;
  const saved = safeSession(() => JSON.parse(raw) as Partial<VisitState>);
  if (!saved?.answers) return base;
  return { ...base, ...saved, contact: emptyContact(), lead: null };
}

export function readBoothFlag(): boolean {
  const q = new URLSearchParams(location.search).get('booth');
  if (q === '1' || q === '0') {
    safeSession(() => (q === '1' ? localStorage.setItem(BOOTH_KEY, '1') : localStorage.removeItem(BOOTH_KEY)));
    return q === '1';
  }
  return safeSession(() => localStorage.getItem(BOOTH_KEY) === '1') ?? false;
}

interface Store {
  state: VisitState;
  booth: boolean;
  setBooth: (on: boolean) => void;
  updateAnswers: (fn: (draft: Answers) => void) => void;
  reachStep: (step: number) => void;
  setResults: (r: Partial<ResultsState>) => void;
  setRequestType: (t: RequestType) => void;
  setContact: (c: Partial<ContactDraft>) => void;
  setLead: (lead: VisitState['lead']) => void;
  /** Clears every answer, the plan, contact details and the result. */
  reset: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, initialBooth }: { children: ReactNode; initialBooth?: boolean }) {
  const [booth, setBoothState] = useState(() => initialBooth ?? readBoothFlag());
  const [state, setState] = useState<VisitState>(() => loadVisit(booth));
  const boothRef = useRef(booth);
  boothRef.current = booth;

  useEffect(() => {
    if (booth) {
      safeSession(() => sessionStorage.removeItem(SESSION_KEY));
      return;
    }
    const { answers, answersRev, furthestStep, results, requestType, visitId } = state;
    safeSession(() => sessionStorage.setItem(SESSION_KEY, JSON.stringify({ answers, answersRev, furthestStep, results, requestType, visitId })));
  }, [state, booth]);

  const updateAnswers = useCallback((fn: (draft: Answers) => void) => {
    setState((s) => {
      const draft = structuredClone(s.answers);
      fn(draft);
      return { ...s, answers: draft, answersRev: s.answersRev + 1 };
    });
  }, []);

  const store = useMemo<Store>(
    () => ({
      state,
      booth,
      setBooth: (on) => {
        safeSession(() => (on ? localStorage.setItem(BOOTH_KEY, '1') : localStorage.removeItem(BOOTH_KEY)));
        setBoothState(on);
      },
      updateAnswers,
      reachStep: (step) => setState((s) => (step > s.furthestStep ? { ...s, furthestStep: step } : s)),
      setResults: (r) => setState((s) => ({ ...s, results: { ...s.results, ...r } })),
      setRequestType: (t) => setState((s) => ({ ...s, requestType: t })),
      setContact: (c) => setState((s) => ({ ...s, contact: { ...s.contact, ...c } })),
      setLead: (lead) => setState((s) => ({ ...s, lead })),
      reset: () => {
        safeSession(() => sessionStorage.removeItem(SESSION_KEY));
        setState(freshVisit());
      },
    }),
    [state, booth, updateAnswers],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}
