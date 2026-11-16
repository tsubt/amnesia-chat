import type { AmnesiaSettings } from "./protocol";

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

function scrambleChar(ch: string, intensity: number, rand: () => number): string {
  if (!/[a-zA-Z]/.test(ch)) return ch;
  if (intensity <= 0) return ch;
  if (intensity < 1 && rand() > intensity) return ch;
  const isUpper = ch >= "A" && ch <= "Z";
  let next = LETTERS[Math.floor(rand() * LETTERS.length)] ?? "x";
  if (next.toLowerCase() === ch.toLowerCase()) {
    next = LETTERS[(LETTERS.indexOf(next) + 7) % LETTERS.length] ?? "q";
  }
  return isUpper ? next.toUpperCase() : next;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type AmnesiaSegment = {
  text: string;
  mangled: boolean;
};

export type AmnesiaOptions = {
  /** When false, keep real letters and only mark the faded region (for blur). */
  scrambleLetters?: boolean;
  /**
   * composer — last N words stay clear (typing).
   * sealed — entire message is unreadable (sent history).
   */
  mode?: "composer" | "sealed";
};

/** Settings used for a sealed (sent) S message — fully unreadable. */
export function sealedSettings(settings: AmnesiaSettings): AmnesiaSettings {
  return {
    ...settings,
    clearWords: 0,
    scramble: Math.max(settings.scramble, 0.95),
    blurPx: Math.max(settings.blurPx, 4),
  };
}

/** Split text into faded prefix + clear suffix by word count. */
export function segmentAmnesia(
  text: string,
  settings: AmnesiaSettings,
  seed = text,
  options: AmnesiaOptions = {},
): AmnesiaSegment[] {
  const scrambleLetters = options.scrambleLetters !== false;
  const mode = options.mode ?? "composer";
  const effective =
    mode === "sealed" ? sealedSettings(settings) : settings;

  if (!effective.enabled || !text) {
    return [{ text, mangled: false }];
  }

  const parts = text.split(/(\s+)/);
  const wordIndexes: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] && !/^\s+$/.test(parts[i]!)) wordIndexes.push(i);
  }

  const clearCount = Math.max(0, Math.floor(effective.clearWords));
  const mangledWordCount = Math.max(0, wordIndexes.length - clearCount);
  const mangledPartSet = new Set(wordIndexes.slice(0, mangledWordCount));

  const rand = mulberry32(hashSeed(seed));
  const segments: AmnesiaSegment[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? "";
    if (!part) continue;
    const isMangled = mangledPartSet.has(i);
    if (isMangled) {
      const out = scrambleLetters
        ? [...part]
            .map((c) => scrambleChar(c, effective.scramble, rand))
            .join("")
        : part;
      segments.push({ text: out, mangled: true });
    } else {
      segments.push({ text: part, mangled: false });
    }
  }

  return segments;
}

export function mangleText(
  text: string,
  settings: AmnesiaSettings,
  seed?: string,
  options?: AmnesiaOptions,
): string {
  return segmentAmnesia(text, settings, seed ?? text, {
    mode: "sealed",
    scrambleLetters: true,
    ...options,
  })
    .map((s) => s.text)
    .join("");
}
