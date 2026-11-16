export function getWsUrl(): string {
  const fromEnv = import.meta.env.VITE_WS_URL as string | undefined;
  if (fromEnv) return fromEnv;

  // Same-origin in production (Railway single service). Local vite uses :8787.
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const isLocalVite =
    window.location.port === "5173" || window.location.port === "4173";
  if (isLocalVite) {
    return `${proto}//${window.location.hostname}:8787`;
  }
  return `${proto}//${window.location.host}`;
}
