/** Read session key from `?k=` (QR-safe) or `#k=` (legacy). */
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

/**
 * Join links use ?k= because many mobile QR scanners drop URL fragments (#...).
 * The SPA still never needs the key for API calls; only the first HTML request
 * may include it in access logs.
 */
export function buildJoinPath(code: string, sessionKey: string): string {
  return `/join/${encodeURIComponent(code)}?k=${encodeURIComponent(sessionKey)}`;
}

export function buildSessionPath(code: string, sessionKey: string): string {
  return `/session/${encodeURIComponent(code)}?k=${encodeURIComponent(sessionKey)}`;
}

export function buildJoinUrl(code: string, sessionKey: string): string {
  return new URL(buildJoinPath(code, sessionKey), window.location.origin).toString();
}
