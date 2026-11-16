function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export function getWsUrl(): string {
  const fromEnv = import.meta.env.VITE_WS_URL as string | undefined;
  const pageLocal = isLoopbackHost(window.location.hostname);

  // Ignore a localhost WS env when the page is on a public host (e.g. Railway).
  // That mismatch is what triggers mobile "access other apps/services" + connection failed.
  if (fromEnv) {
    try {
      const envHost = new URL(fromEnv).hostname;
      if (!(isLoopbackHost(envHost) && !pageLocal)) {
        return fromEnv;
      }
    } catch {
      // fall through to same-origin
    }
  }

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const isLocalVite =
    pageLocal &&
    (window.location.port === "5173" || window.location.port === "4173");
  if (isLocalVite) {
    return `${proto}//${window.location.hostname}:8787`;
  }
  return `${proto}//${window.location.host}`;
}
