import {
  composerVeilAlpha,
  composerVeilBlurPx,
  segmentAmnesia,
  type AmnesiaOptions,
} from "../lib/amnesia";
import type { AmnesiaSettings } from "../lib/protocol";

type Props = {
  text: string;
  settings: AmnesiaSettings;
  seed?: string;
  /** When false, render plaintext (D view / D messages) */
  apply?: boolean;
  /** Composer: letter veils. History sealed: letter scramble only. */
  scrambleLetters?: boolean;
  mode?: AmnesiaOptions["mode"];
  className?: string;
};

/**
 * Gray tile stacked ON TOP of each letter (opacity 0–1).
 * Clear tail stays plain inline so the caret matches the ghost textarea.
 */
function ComposerVeil({
  text,
  settings,
}: {
  text: string;
  settings: AmnesiaSettings;
}) {
  const chars = [...text];
  const n = chars.length;

  return (
    <>
      {chars.map((ch, i) => {
        const alpha = composerVeilAlpha(i, n, settings);
        if (alpha <= 0.001) {
          return <span key={i}>{ch}</span>;
        }

        // Blur + cover both follow distance behind the clear leader.
        const blurPx = composerVeilBlurPx(i, n, settings).toFixed(2);
        return (
          <span key={i} className="amnesia-veil-char">
            <span
              className="amnesia-veil-glyph"
              style={{ filter: `blur(${blurPx}px)` }}
            >
              {ch === " " ? "\u00a0" : ch}
            </span>
            <span
              className="amnesia-veil-tile"
              style={{ opacity: alpha }}
              aria-hidden
            />
          </span>
        );
      })}
    </>
  );
}

export function AmnesiaText({
  text,
  settings,
  seed,
  apply = true,
  scrambleLetters = true,
  mode = "composer",
  className,
}: Props) {
  if (!apply || !settings.enabled) {
    return <span className={className}>{text}</span>;
  }

  if (mode === "composer") {
    return (
      <span className={className}>
        <ComposerVeil text={text} settings={settings} />
      </span>
    );
  }

  const segments = segmentAmnesia(text, settings, seed ?? text, {
    scrambleLetters,
    mode,
  });

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.mangled ? (
          <span key={i} className="amnesia-scrambled">
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  );
}
