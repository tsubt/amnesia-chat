/**
 * Progressive letter morph from `from` toward `to` at progress 0..1.
 * Length follows `to`; extra/missing chars fade in as target chars.
 */
export function morphText(from: string, to: string, progress: number): string {
  const p = Math.min(1, Math.max(0, progress));
  const len = Math.max(from.length, to.length);
  let out = "";
  const revealCount = Math.floor(len * p);
  for (let i = 0; i < len; i++) {
    const a = from[i] ?? "";
    const b = to[i] ?? "";
    if (i < revealCount) out += b || a;
    else out += a || "";
  }
  return out;
}
