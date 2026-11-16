/** Read session key from location.hash (`#k=...`) or legacy `?k=`. */
export function readInviteKey(
  searchParams: URLSearchParams,
  hash: string = window.location.hash,
): string | undefined {
  const fromQuery = searchParams.get("k") ?? undefined;
  if (fromQuery) return fromQuery;
  if (!hash.startsWith("#")) return undefined;
  const params = new URLSearchParams(hash.slice(1));
  return params.get("k") ?? undefined;
}

export function buildJoinPath(code: string, sessionKey: string): string {
  return `/join/${code}#k=${encodeURIComponent(sessionKey)}`;
}

export function buildSessionPath(code: string, sessionKey: string): string {
  return `/session/${code}#k=${encodeURIComponent(sessionKey)}`;
}

export function buildJoinUrl(code: string, sessionKey: string): string {
  return new URL(buildJoinPath(code, sessionKey), window.location.origin).toString();
}
