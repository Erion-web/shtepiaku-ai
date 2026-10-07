// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../src/i18n';
import { PricingEditor } from '../src/screens/staff/PricingEditor';
import { toStored } from '../shared/pricing/stored';
import { DEMO_PRICING } from '../shared/pricing/demo';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let posts: Record<string, unknown>[];

beforeEach(() => {
  posts = [];
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) });
  let active = toStored(DEMO_PRICING);
  let version: number | null = null;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === '/api/staff/pricing' && (!init?.method || init.method === 'GET')) return json(200, { active, version, history: [], pricingMode: 'demo' });
    if (url === '/api/staff/pricing' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      posts.push(body);
      version = (version ?? 0) + 1;
      active = { ...body.config, id: `v${version}`, status: body.status };
      return json(201, { version, active });
    }
    return json(404, {});
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderEditor = () =>
  render(
    <I18nProvider initial="sq">
      <PricingEditor onUnauthorized={() => undefined} />
    </I18nProvider>,
  );

describe('pricing editor', () => {
  it('edits a value, shows the old one, previews the effect and saves a new version', async () => {
    const user = userEvent.setup();
    renderEditor();
    const min = await screen.findByLabelText('Çmimi minimal për vizitë');
    expect(screen.getByRole('button', { name: /Ruaj si version të ri/ })).toHaveProperty('disabled', true);

    await user.clear(min);
    await user.type(min, '200');
    expect(screen.getByText('1 ndryshim i paruajtur')).toBeTruthy();
    expect(screen.getByText('Më parë: 20 €')).toBeTruthy();
    // Preview shows a new monthly range for the small office: 8.67 visits × €200 minimum.
    const preview = screen.getByRole('region', { name: 'Si ndikon te ofertat' });
    expect(within(preview).getAllByText('Me ndryshimet').length).toBe(3);

    await user.type(screen.getByLabelText(/Emri juaj/), 'CEO');
    await user.click(screen.getByRole('button', { name: /Ruaj si version të ri/ }));
    await screen.findByText('U ruajt si versioni 1. Faqja publike i përdor tani.');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ status: 'demo', author: 'CEO' });
    expect((posts[0].config as { cleaning: { minimumVisit: number } }).cleaning.minimumVisit).toBe(200);
  });

  it('stores percentages as fractions', async () => {
    const user = userEvent.setup();
    renderEditor();
    const vat = await screen.findByLabelText('Norma e TVSH-së');
    expect(vat).toHaveProperty('value', '18');
    await user.clear(vat);
    await user.type(vat, '20');
    await user.click(screen.getByRole('button', { name: /Ruaj si version të ri/ }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect((posts[0].config as { vat: { rate: number } }).vat.rate).toBeCloseTo(0.2, 10);
  });

  it('blocks saving when Low is above High or a value is not a number', async () => {
    const user = userEvent.setup();
    renderEditor();
    const low = await screen.findByLabelText('Çdo kuzhinë, për vizitë: E ulët');
    await user.clear(low);
    await user.type(low, '9');
    expect(screen.getByText('Vlera e ulët nuk mund të jetë më e madhe se e larta.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Ruaj si version të ri/ }));
    expect(screen.getByText(/Disa vlera nuk janë të sakta/)).toBeTruthy();
    expect(posts).toHaveLength(0);

    await user.clear(low);
    await user.type(low, 'abc');
    expect(screen.getByText('Shkruani një numër.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Ruaj si version të ri/ }));
    expect(posts).toHaveLength(0);
  });

  it('asks for confirmation before publishing approved prices', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByLabelText('Çmimi minimal për vizitë');
    await user.click(screen.getByText('Të miratuara'));
    await user.click(screen.getByRole('button', { name: /Ruaj si version të ri/ }));
    expect(screen.getByText('Të publikohen si çmime të miratuara?')).toBeTruthy();
    expect(posts).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Po, publiko' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].status).toBe('approved');
  });
});
