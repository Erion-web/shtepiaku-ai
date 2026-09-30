import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type AppConfig } from '../lib/api';
import { resolvePricing } from '../../shared/pricing/registry';
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
  const pricing = config && config.estimatesEnabled ? resolvePricing(config.pricingMode) : null;
  return <Ctx.Provider value={{ config, pricing }}>{children}</Ctx.Provider>;
}

export const useConfig = () => useContext(Ctx);
