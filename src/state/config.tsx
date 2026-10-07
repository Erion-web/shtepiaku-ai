import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type AppConfig } from '../lib/api';
import { fromStored } from '../../shared/pricing/stored';
import type { PricingConfig } from '../../shared/pricing/config';

interface ConfigState {
  config: AppConfig | null;
  /** Active pricing configuration, or null when live estimates are not approved yet. */
  pricing: PricingConfig | null;
}

const Ctx = createContext<ConfigState>({ config: null, pricing: null });

export function ConfigProvider({ children, initial }: { children: ReactNode; initial?: AppConfig }) {
  const [config, setConfig] = useState<AppConfig | null>(initial ?? null);
  useEffect(() => {
    if (initial) return;
    let alive = true;
    api.config().then((c) => alive && setConfig(c));
    return () => {
      alive = false;
    };
  }, [initial]);
  // Prices come from the server (the version staff last saved), never from the bundle.
  const pricing = useMemo(() => (config?.estimatesEnabled && config.pricing ? fromStored(config.pricing) : null), [config]);
  return <Ctx.Provider value={{ config, pricing }}>{children}</Ctx.Provider>;
}

export const useConfig = () => useContext(Ctx);
