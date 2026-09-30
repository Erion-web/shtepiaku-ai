// Minimal History-API router. Each history entry carries the visitId it belongs to,
// so entries left over from a previous booth visitor never restore their screens.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface Router {
  path: string;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}

const Ctx = createContext<Router | null>(null);

export function RouterProvider({ children, visitId }: { children: ReactNode; visitId: string }) {
  const [path, setPath] = useState(() => location.pathname);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const entryVisit = (e.state as { visitId?: string } | null)?.visitId;
      // A history entry from an earlier visitor: send the new visitor to the start instead.
      if (entryVisit && entryVisit !== visitId && location.pathname !== '/' && !location.pathname.startsWith('/staff')) {
        history.replaceState({ visitId }, '', '/');
        setPath('/');
        return;
      }
      setPath(location.pathname);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [visitId]);

  // Stamp the current entry with the active visit (also after a booth reset issues a new id).
  useEffect(() => {
    history.replaceState({ visitId }, '', location.pathname + location.search);
  }, [visitId]);

  const navigate = useCallback(
    (to: string, opts?: { replace?: boolean }) => {
      if (opts?.replace) history.replaceState({ visitId }, '', to);
      else history.pushState({ visitId }, '', to);
      setPath(new URL(to, location.origin).pathname);
      window.scrollTo({ top: 0 });
    },
    [visitId],
  );

  const value = useMemo(() => ({ path, navigate }), [path, navigate]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRouter(): Router {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRouter outside RouterProvider');
  return v;
}

export function Link({ to, children, className, ...rest }: { to: string; children: ReactNode; className?: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
