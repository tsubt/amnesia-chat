import { segmentAmnesia, type AmnesiaOptions } from "../lib/amnesia";
import type { AmnesiaSettings } from "../lib/protocol";

type Props = {
  text: string;
  settings: AmnesiaSettings;
  seed?: string;
  /** When false, render plaintext (D view / D messages) */
  apply?: boolean;
  /** Composer: blur only. Sent history: scramble + blur. */
  scrambleLetters?: boolean;
  mode?: AmnesiaOptions["mode"];
  className?: string;
};

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

  const segments = segmentAmnesia(text, settings, seed ?? text, {
    scrambleLetters,
    mode,
  });
  const blur =
    mode === "sealed"
      ? Math.max(settings.blurPx, 4)
      : settings.blurPx;

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.mangled ? (
          <span
            key={i}
            className="amnesia-mangled"
            style={{
              filter: `blur(${blur}px)`,
              opacity: mode === "sealed" ? 0.55 : 0.72,
            }}
          >
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  );
}
