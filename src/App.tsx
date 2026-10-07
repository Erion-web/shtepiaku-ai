import { useEffect, type ReactNode } from 'react';
import { I18nProvider, useI18n } from './i18n';
import { ConfigProvider, useConfig } from './state/config';
import { StoreProvider, useStore } from './state/store';
import { RouterProvider, useRouter } from './lib/router';
import { BoothController } from './state/booth';
import { Header } from './components/Header';
import { Button, PageTitle } from './components/ui';
import { Welcome } from './screens/Welcome';
import { Questionnaire } from './screens/Questionnaire';
import { Results } from './screens/Results';
import { Contact } from './screens/Contact';
import { Success } from './screens/Success';
import { Staff } from './screens/Staff';
import { Budget } from './screens/Budget';
import type { AppConfig } from './lib/api';

export function App({ config, booth }: { config?: AppConfig; booth?: boolean } = {}) {
  return (
    <I18nProvider>
      <ConfigProvider initial={config}>
        <StoreProvider initialBooth={booth}>
          <Shell />
        </StoreProvider>
      </ConfigProvider>
    </I18nProvider>
  );
}

function Shell() {
  const { state, booth } = useStore();
  return (
    <RouterProvider visitId={state.visitId}>
      <div className={booth ? 'app app--booth' : 'app'}>
        <Header />
        <main id="main" className="main">
          <Routes />
        </main>
        <DevNotices />
        <BoothController />
      </div>
    </RouterProvider>
  );
}

function Routes(): ReactNode {
  const { path, navigate } = useRouter();
  const step = /^\/plan\/([1-6])\/?$/.exec(path);

  useEffect(() => {
    if (path === '/plan' || path === '/plan/') navigate('/plan/1', { replace: true });
  }, [path, navigate]);

  if (path === '/') return <Welcome />;
  if (path === '/buxheti') return <Budget />;
  if (step) return <Questionnaire key={step[1]} step={Number(step[1])} />;
  if (path === '/rezultati') return <Results />;
  if (path === '/kerkese') return <Contact />;
  if (path === '/faleminderit') return <Success />;
  if (path === '/staff' || path === '/staff/') return <Staff />;
  if (path === '/plan' || path === '/plan/') return null;
  return <NotFound />;
}

function NotFound() {
  const { t } = useI18n();
  const { navigate } = useRouter();
  return (
    <div className="container success">
      <div className="card success__card">
        <PageTitle className="success__title">{t.notFound.title}</PageTitle>
        <Button onClick={() => navigate('/')}>{t.notFound.cta}</Button>
      </div>
    </div>
  );
}

/** Makes missing integrations visible during development instead of failing silently. */
function DevNotices() {
  const { config } = useConfig();
  const { t } = useI18n();
  if (!config || config.online) return null;
  return (
    <div className="offline-banner" role="status">
      {t.common.apiOffline}
    </div>
  );
}
