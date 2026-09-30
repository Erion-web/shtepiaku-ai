// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import type { AppConfig } from '../src/lib/api';
import { completeAnswers } from './fixtures';
import { IDLE_MS, WARNING_SECONDS } from '../src/state/booth';

const config = (over: Partial<AppConfig> = {}): AppConfig => ({
  pricingMode: 'demo',
  pricingId: 'demo-2026.09',
  pricingStatus: 'demo',
  estimatesEnabled: true,
  aiEnabled: false,
  staffConfigured: true,
  dev: false,
  online: true,
  ...over,
});

/** Node 25 exposes its own localStorage global; use an explicit in-memory Storage instead. */
class MemStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  dump() {
    return JSON.stringify([...this.m.entries()]);
  }
}
let session: MemStorage;
let local: MemStorage;

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let handler: Handler;
const calls: { url: string; body?: unknown }[] = [];
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calls.length = 0;
  handler = () => json(404, { error: 'not_found' });
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return handler(url, init);
  });
  window.scrollTo = vi.fn() as never;
  session = new MemStorage();
  local = new MemStorage();
  vi.stubGlobal('sessionStorage', session);
  vi.stubGlobal('localStorage', local);
  history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function seedCompleteVisit(path: string) {
  sessionStorage.setItem(
    'sh_visit_v1',
    JSON.stringify({ answers: completeAnswers(), answersRev: 1, furthestStep: 7, results: { tier: 'recommended', plan: null, basedOnRev: -1, customized: false }, requestType: 'offer', visitId: 'seed' }),
  );
  history.replaceState(null, '', path);
}

describe('questionnaire navigation', () => {
  it('keeps answers when going back and does not advance on selection', async () => {
    const user = userEvent.setup();
    render(<App config={config()} booth={false} />);
    await user.click(screen.getByRole('button', { name: 'Ndërto planin e zyrës' }));
    await user.type(screen.getByLabelText('Emri i kompanisë'), 'Dardania Tech');
    await user.click(screen.getByText('Prishtinë'));
    await user.click(screen.getByText('Zyrë'));
    expect(location.pathname).toBe('/plan/1'); // selecting does not advance
    await user.click(screen.getByRole('button', { name: 'Vazhdo' }));
    expect(location.pathname).toBe('/plan/2');
    await user.type(screen.getByLabelText('Sipërfaqja'), '220');

    await user.click(screen.getByRole('button', { name: 'Kthehu' }));
    expect(screen.getByLabelText('Emri i kompanisë')).toHaveProperty('value', 'Dardania Tech');

    // Browser back/forward also keeps the answers.
    await user.click(screen.getByRole('button', { name: 'Vazhdo' }));
    act(() => {
      history.back();
    });
    await waitFor(() => expect(location.pathname).toBe('/plan/1'));
    expect(screen.getByLabelText('Emri i kompanisë')).toHaveProperty('value', 'Dardania Tech');
  });

  it('shows errors instead of advancing when a step is incomplete', async () => {
    const user = userEvent.setup();
    history.replaceState(null, '', '/plan/1');
    render(<App config={config()} booth={false} />);
    await user.click(screen.getByRole('button', { name: 'Vazhdo' }));
    expect(location.pathname).toBe('/plan/1');
    expect(screen.getByText('Shkruani emrin e kompanisë.')).toBeTruthy();
  });

  it('redirects a direct visit to a later step back to the first incomplete one', async () => {
    history.replaceState(null, '', '/plan/5');
    render(<App config={config()} booth={false} />);
    await waitFor(() => expect(location.pathname).toBe('/plan/1'));
  });
});

describe('results', () => {
  it('shows the estimate with the demo label and recalculates when a service is added or removed', async () => {
    const user = userEvent.setup();
    seedCompleteVisit('/rezultati');
    render(<App config={config()} booth={false} />);
    expect(screen.getByRole('heading', { name: 'Plani për Dardania Tech' })).toBeTruthy();
    expect(screen.getAllByText('Çmime demonstruese').length).toBeGreaterThan(0);
    const amount = () => document.querySelector('.estimate__amount')!.textContent;
    const before = amount();
    await user.click(screen.getByRole('button', { name: 'Shto Mirëmbajtje teknike' }));
    const withMaint = amount();
    expect(withMaint).not.toBe(before);
    expect(screen.getByText('I përshtatur')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Hiq Mirëmbajtje teknike' }));
    expect(amount()).toBe(before);
    // Answers are untouched by plan edits.
    expect(JSON.parse(sessionStorage.getItem('sh_visit_v1')!).answers.company.name).toBe('Dardania Tech');
  });

  it('falls back to the deterministic explanation when AI is unavailable', async () => {
    handler = (url) => (url.includes('/api/explain') ? json(503, { error: 'ai_unavailable' }) : json(404, {}));
    seedCompleteVisit('/rezultati');
    render(<App config={config({ aiEnabled: true })} booth={false} />);
    await waitFor(() => expect(screen.getByText(/Me 18 persona që e përdorin zyrën çdo ditë/)).toBeTruthy(), { timeout: 3000 });
    expect(calls.some((c) => c.url === '/api/explain')).toBe(true);
    const sent = calls.find((c) => c.url === '/api/explain')!.body as Record<string, unknown>;
    expect(JSON.stringify(sent)).not.toContain('Dardania Tech');
  });

  it('shows the deterministic explanation immediately when AI is disabled', () => {
    seedCompleteVisit('/rezultati');
    render(<App config={config()} booth={false} />);
    expect(screen.getByText(/Me 18 persona/)).toBeTruthy();
    expect(calls.some((c) => c.url === '/api/explain')).toBe(false);
  });
});

describe('contact submission', () => {
  it('keeps the form after a failure and retries with the same idempotency key', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    handler = (url) => {
      if (url !== '/api/leads') return json(404, {});
      attempt += 1;
      return attempt === 1 ? json(500, { error: 'storage_failed' }) : json(201, { id: 'abcdef12-0000', duplicate: false, dataset: 'demo' });
    };
    seedCompleteVisit('/kerkese');
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    render(<App config={config()} booth={false} />);
    await user.type(screen.getByLabelText('Emri dhe mbiemri'), 'Arta Krasniqi');
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'arta@example.com');
    now.mockReturnValue(1_010_000);

    await user.click(screen.getByRole('button', { name: 'Dërgo kërkesën' }));
    await screen.findByText(/nuk u ruajt/);
    expect(location.pathname).toBe('/kerkese');
    expect(screen.getByLabelText('Emri dhe mbiemri')).toHaveProperty('value', 'Arta Krasniqi');
    expect(screen.queryByText('Kërkesa juaj u pranua.')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Provo sërish' }));
    await screen.findByText('Kërkesa juaj u pranua.');
    const posts = calls.filter((c) => c.url === '/api/leads').map((c) => c.body as { idempotencyKey: string; elapsedMs: number });
    expect(posts).toHaveLength(2);
    expect(posts[0].idempotencyKey).toBe(posts[1].idempotencyKey);
    expect(posts[0].elapsedMs).toBeGreaterThanOrEqual(10_000);
    now.mockRestore();
  });

  it('validates that email or phone is present before sending', async () => {
    const user = userEvent.setup();
    seedCompleteVisit('/kerkese');
    render(<App config={config()} booth={false} />);
    await user.type(screen.getByLabelText('Emri dhe mbiemri'), 'Arta');
    await user.click(screen.getByRole('button', { name: 'Dërgo kërkesën' }));
    expect(screen.getByText('Plotësoni emailin ose telefonin.')).toBeTruthy();
    expect(calls.some((c) => c.url === '/api/leads')).toBe(false);
  });

  it('never writes contact details to browser storage', async () => {
    const user = userEvent.setup();
    seedCompleteVisit('/kerkese');
    render(<App config={config()} booth={false} />);
    await user.type(screen.getByLabelText('Emri dhe mbiemri'), 'Arta Krasniqi');
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'arta@example.com');
    const dump = session.dump() + local.dump();
    expect(dump).not.toContain('arta@example.com');
    expect(dump).not.toContain('Arta Krasniqi');
  });
});

describe('booth mode', () => {
  it('resets all visitor data and keeps it unreachable through Back', async () => {
    const user = userEvent.setup();
    render(<App config={config()} booth />);
    await user.click(screen.getByRole('button', { name: 'Ndërto planin e zyrës' }));
    await user.type(screen.getByLabelText('Emri i kompanisë'), 'Dardania Tech');
    expect(sessionStorage.getItem('sh_visit_v1')).toBeNull(); // nothing persisted in booth mode

    await user.click(screen.getByRole('button', { name: /Fillo për kompaninë tjetër/ }));
    await user.click(screen.getByRole('button', { name: 'Po, fillo nga e para' }));
    expect(location.pathname).toBe('/');
    expect(calls.some((c) => c.url === '/api/staff/logout')).toBe(true);

    act(() => history.back());
    await waitFor(() => expect(location.pathname).toBe('/'));
    await user.click(screen.getByRole('button', { name: 'Ndërto planin e zyrës' }));
    expect(screen.getByLabelText('Emri i kompanisë')).toHaveProperty('value', '');
  });

  it('warns after inactivity, lets the visitor continue, and resets if they do not', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    history.replaceState(null, '', '/plan/1');
    render(<App config={config()} booth />);
    fireEvent.change(screen.getByLabelText('Emri i kompanisë'), { target: { value: 'Dardania Tech' } });

    act(() => vi.advanceTimersByTime(IDLE_MS + 10));
    expect(screen.getByText('A jeni ende këtu?')).toBeTruthy();
    fireEvent.click(within(document.querySelector('dialog[open]') as HTMLElement).getByRole('button', { name: 'Vazhdo' }));
    expect(screen.queryByText('A jeni ende këtu?')).toBeNull();
    expect(screen.getByLabelText('Emri i kompanisë')).toHaveProperty('value', 'Dardania Tech');

    act(() => vi.advanceTimersByTime(IDLE_MS + 10));
    for (let i = 0; i <= WARNING_SECONDS; i++) act(() => vi.advanceTimersByTime(1000));
    expect(location.pathname).toBe('/');
    expect(screen.getByRole('button', { name: 'Ndërto planin e zyrës' })).toBeTruthy();
  });
});
