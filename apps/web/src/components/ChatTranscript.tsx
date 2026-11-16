import { useEffect, useRef, useState, type ReactNode } from "react";
import { morphText } from "../lib/sealAnim";
import type { AmnesiaSettings, ChatMessage, Role } from "../lib/protocol";

type Props = {
  messages: ChatMessage[];
  role: Role;
  settings: AmnesiaSettings;
  onToggleReveal?: (id: string) => void;
  onSealComplete?: (id: string) => void;
};

function DeliveryDot({
  state,
}: {
  state: ChatMessage["delivery"];
}) {
  if (!state || state === "revealed") return null;
  if (state === "queued") {
    return (
      <span
        className="delivery-dot delivery-queued"
        title="Queued — waiting for peer"
        aria-label="Queued"
      />
    );
  }
  if (state === "sent" || state === "sealing") {
    return (
      <span
        className="delivery-dot delivery-sent"
        title="Delivered"
        aria-label="Delivered"
      />
    );
  }
  return null;
}

function SealMorph({
  from,
  to,
  onDone,
}: {
  from: string;
  to: string;
  onDone: () => void;
}) {
  const [display, setDisplay] = useState(from);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    doneRef.current = false;
    let cancelled = false;
    const duration = 1600;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      if (cancelled) return;
      const t = Math.min(1, (now - start) / duration);
      setDisplay(morphText(from, to, t));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else if (!doneRef.current) {
        doneRef.current = true;
        onDoneRef.current();
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      // Do not call onDone here — Strict Mode remounts would skip the morph.
    };
  }, [from, to]);

  return (
    <p className="bubble-body seal-morph seal-mono">{display}</p>
  );
}

export function ChatTranscript({
  messages,
  role,
  settings,
  onToggleReveal,
  onSealComplete,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="transcript" role="log" aria-live="polite" ref={scrollerRef}>
      {messages.length === 0 && (
        <p className="transcript-empty">No messages yet. Start typing.</p>
      )}
      {messages.map((m) => {
        const mine = m.from === role;
        const isSOwn = role === "s" && m.from === "s";
        const isDViewingS = role === "d" && m.from === "s";
        const delivery = m.delivery;
        const showPadlock =
          isDViewingS &&
          settings.enabled &&
          (delivery === "sealed" || delivery === "revealed");
        const showGreen =
          isDViewingS && (delivery === "sent" || delivery === "sealed");

        let body: ReactNode;

        if (isSOwn && delivery === "sealing" && m.plainText && m.sealedText) {
          body = (
            <SealMorph
              from={m.plainText}
              to={m.sealedText}
              onDone={() => onSealComplete?.(m.id)}
            />
          );
        } else if (
          isSOwn &&
          (delivery === "queued" || delivery === "sent") &&
          m.plainText
        ) {
          // Clear plaintext until D's seal morph — no history blur
          body = <p className="bubble-body seal-mono">{m.plainText}</p>;
        } else if (isSOwn && delivery === "revealed") {
          body = <p className="bubble-body">{m.text}</p>;
        } else if (isSOwn && (m.sealedText || delivery === "sealed")) {
          body = (
            <p className="bubble-body seal-mono amnesia-scrambled">
              {m.sealedText ?? m.text}
            </p>
          );
        } else {
          body = <p className="bubble-body">{m.text}</p>;
        }

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
              {isSOwn && (
                <span className="bubble-status">
                  <DeliveryDot state={delivery} />
                </span>
              )}
              {isDViewingS && (showGreen || showPadlock) && (
                <span className="bubble-status">
                  {showPadlock ? (
                    <button
                      type="button"
                      className={`padlock ${delivery === "revealed" ? "padlock-open" : ""}`}
                      title={
                        delivery === "revealed" ? "Re-seal for S" : "Reveal to S"
                      }
                      aria-label={
                        delivery === "revealed"
                          ? "Re-seal message"
                          : "Reveal message"
                      }
                      onClick={() => onToggleReveal?.(m.id)}
                    >
                      <span className="padlock-icon" aria-hidden />
                    </button>
                  ) : (
                    <span
                      className="delivery-dot delivery-sent"
                      title="Received"
                      aria-label="Received"
                    />
                  )}
                </span>
              )}
            </header>
            {body}
          </article>
        );
      })}
    </div>
  );
}
