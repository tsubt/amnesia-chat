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
  /** When false, keep real letters (composer veil / display). */
  scrambleLetters?: boolean;
  /**
   * composer — trailing clear + fade window (letter-based).
   * sealed — entire message scrambled.
   */
  mode?: "composer" | "sealed";
};

/** Settings used for a sealed (sent) S message — full scramble, no clear window. */
export function sealedSettings(settings: AmnesiaSettings): AmnesiaSettings {
  return {
    ...settings,
    clearLetters: 0,
    fadeLetters: 0,
    scramble: Math.max(settings.scramble, 0.95),
  };
}

/**
 * How far behind the clear “leader” a char is, 0 → 1.
 * 0 inside the clear window; ramps across fadeLetters; 1 beyond that.
 */
export function composerVeilProgress(
  index: number,
  length: number,
  settings: AmnesiaSettings,
): number {
  if (!settings.enabled || length <= 0) return 0;
  const clearN = Math.max(0, Math.floor(settings.clearLetters));
  const fadeN = Math.max(0, Math.floor(settings.fadeLetters));
  const fromEnd = length - 1 - index; // 0 = last char (leader tip)

  if (fromEnd < clearN) return 0;
  if (fadeN <= 0) return 1;
  if (fromEnd >= clearN + fadeN) return 1;
  return (fromEnd - clearN) / fadeN;
}

/** Cover opacity — same ramp as distance, capped at 80%. */
export function composerVeilAlpha(
  index: number,
  length: number,
  settings: AmnesiaSettings,
): number {
  return composerVeilProgress(index, length, settings) * 0.8;
}

/** Glyph blur in px — same distance axis as opacity, but starts later. */
export function composerVeilBlurPx(
  index: number,
  length: number,
  settings: AmnesiaSettings,
): number {
  const t = composerVeilProgress(index, length, settings);
  // Cover begins immediately; blur waits until ~35% into the fade.
  const blurStart = 0.35;
  if (t <= blurStart) return 0;
  const delayed = (t - blurStart) / (1 - blurStart);
  return delayed * 2.2;
}

/** Split text into faded prefix + clear suffix (sealed = all mangled). */
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

  if (mode === "sealed") {
    const rand = mulberry32(hashSeed(seed));
    if (!scrambleLetters) {
      return [{ text, mangled: true }];
    }
    const out = [...text]
      .map((c) => scrambleChar(c, effective.scramble, rand))
      .join("");
    return [{ text: out, mangled: true }];
  }

  // Composer: letter windows — clear tail, then fade, then full veil
  const clearN = Math.max(0, Math.floor(effective.clearLetters));
  const fadeN = Math.max(0, Math.floor(effective.fadeLetters));
  const veilEnd = Math.max(0, text.length - clearN); // exclusive end of veiled region
  const fadeStart = Math.max(0, veilEnd - fadeN);

  const segments: AmnesiaSegment[] = [];
  const push = (slice: string, mangled: boolean) => {
    if (!slice) return;
    segments.push({ text: slice, mangled });
  };

  push(text.slice(0, fadeStart), true); // fully veiled
  push(text.slice(fadeStart, veilEnd), true); // fade zone (still “mangled” for markup)
  push(text.slice(veilEnd), false); // clear

  if (scrambleLetters) {
    const rand = mulberry32(hashSeed(seed));
    return segments.map((seg) =>
      seg.mangled
        ? {
            ...seg,
            text: [...seg.text]
              .map((c) => scrambleChar(c, effective.scramble, rand))
              .join(""),
          }
        : seg,
    );
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
