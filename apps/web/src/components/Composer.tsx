import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AmnesiaText } from "./AmnesiaText";
import { newId, type AmnesiaSettings, type Role } from "../lib/protocol";

type Props = {
  role: Role;
  settings: AmnesiaSettings;
  disabled?: boolean;
  onSend: (text: string) => void | Promise<void>;
};

export function Composer({ role, settings, disabled, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const fieldId = useId();
  const draftSeed = useRef(newId());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const liveAmnesia = role === "s" && settings.enabled;

  useEffect(() => {
    if (!disabled && !sending) {
      textareaRef.current?.focus();
    }
  }, [disabled, sending]);

  async function submit() {
    if (!draft.trim() || disabled || sending) return;
    const text = draft;
    setDraft("");
    draftSeed.current = newId();
    setSending(true);
    try {
      await onSend(text);
    } finally {
      setSending(false);
      // Refocus after Enter/send — disabled state can steal focus otherwise
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <form className="composer" onSubmit={onSubmit}>
      <div className={`composer-field ${liveAmnesia ? "composer-field-amnesia" : ""}`}>
        {liveAmnesia && (
          <div className="composer-mirror" aria-hidden>
            {draft ? (
              <AmnesiaText
                text={draft}
                settings={settings}
                seed={draftSeed.current}
                scrambleLetters={false}
                mode="composer"
              />
            ) : (
              <span className="composer-placeholder">
                Let thoughts arrive… older letters cover over
              </span>
            )}
          </div>
        )}
        <textarea
          ref={textareaRef}
          id={fieldId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            liveAmnesia
              ? ""
              : role === "s"
                ? "Let thoughts arrive…"
                : "Write a message…"
          }
          rows={3}
          disabled={disabled}
          aria-busy={sending}
          aria-label="Message"
          className={liveAmnesia ? "composer-input-ghost" : undefined}
        />
      </div>
      <div className="composer-bar">
        <span className="composer-hint">Enter to send · Shift+Enter for newline</span>
        <button type="submit" disabled={disabled || sending || !draft.trim()}>
          Send
        </button>
      </div>
    </form>
  );
}
