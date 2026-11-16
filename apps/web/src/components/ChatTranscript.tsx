import { useEffect, useRef } from "react";
import { AmnesiaText } from "./AmnesiaText";
import { sealedSettings } from "../lib/amnesia";
import type { AmnesiaSettings, ChatMessage, Role } from "../lib/protocol";

type Props = {
  messages: ChatMessage[];
  role: Role;
  settings: AmnesiaSettings;
};

export function ChatTranscript({ messages, role, settings }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // Scroll only the transcript pane — never the document (avoids mobile jump).
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <div className="transcript" role="log" aria-live="polite" ref={scrollerRef}>
      {messages.length === 0 && (
        <p className="transcript-empty">No messages yet. Start typing.</p>
      )}
      {messages.map((m) => {
        const mine = m.from === role;
        const isSOwn = role === "s" && m.from === "s";
        const forget = isSOwn && settings.enabled;
        const sealed = sealedSettings(settings);

        return (
          <article
            key={m.id}
            className={`bubble ${mine ? "bubble-mine" : "bubble-theirs"} from-${m.from}`}
          >
            <header className="bubble-meta">
              <span className="bubble-role">{m.from === "d" ? "D" : "S"}</span>
              <time dateTime={new Date(m.ts).toISOString()}>
                {new Date(m.ts).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </header>
            {forget && m.plainText ? (
              <AmnesiaText
                text={m.plainText}
                settings={settings}
                seed={m.id}
                apply
                scrambleLetters
                mode="sealed"
                className="bubble-body"
              />
            ) : forget ? (
              <p
                className="bubble-body amnesia-mangled"
                style={{
                  filter: `blur(${sealed.blurPx}px)`,
                  opacity: 0.55,
                }}
              >
                {m.displayText ?? m.text}
              </p>
            ) : (
              <p className="bubble-body">{m.displayText ?? m.text}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
