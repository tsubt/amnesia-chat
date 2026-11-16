import type { AmnesiaSettings, ChatMessage, Role } from "./protocol";
import { normalizeSettings } from "./protocol";

const historyKey = (code: string) => `amnesia:history:${code}`;
const sessionKey = (code: string) => `amnesia:session:${code}`;
const sDisplayKey = (code: string) => `amnesia:s-display:${code}`;
const outboxKey = (code: string) => `amnesia:outbox:${code}`;

export type StoredSession = {
  code: string;
  role: Role;
  sessionKey: string;
  settings: AmnesiaSettings;
};

export type OutboxItem = {
  id: string;
  text: string;
  ts: number;
};

export function loadHistory(code: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(historyKey(code));
    if (!raw) return [];
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

export function saveHistory(code: string, messages: ChatMessage[]) {
  // D keeps full plaintext; strip ephemeral plainText field if present
  const safe = messages.map((m) => {
    const { plainText: _p, ...rest } = m;
    return rest;
  });
  localStorage.setItem(historyKey(code), JSON.stringify(safe));
}

/** S persists D's clear lines + own sealed lines only (never plaintext). */
export function loadSDisplay(code: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(sDisplayKey(code));
    if (!raw) return [];
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

export function saveSDisplay(code: string, messages: ChatMessage[]) {
  const safe = messages
    .filter((m) => m.from === "d" || m.delivery === "sealed" || m.sealedText)
    .map((m) => {
      if (m.from === "s") {
        const sealed = m.sealedText ?? m.text;
        return {
          id: m.id,
          from: m.from,
          text: sealed,
          sealedText: sealed,
          delivery: "sealed" as const,
          ts: m.ts,
        };
      }
      return {
        id: m.id,
        from: m.from,
        text: m.text,
        delivery: m.delivery,
        ts: m.ts,
      };
    });
  localStorage.setItem(sDisplayKey(code), JSON.stringify(safe));
}

export function loadOutbox(code: string): OutboxItem[] {
  try {
    const raw = sessionStorage.getItem(outboxKey(code));
    if (!raw) return [];
    return JSON.parse(raw) as OutboxItem[];
  } catch {
    return [];
  }
}

export function saveOutbox(code: string, items: OutboxItem[]) {
  sessionStorage.setItem(outboxKey(code), JSON.stringify(items));
}

export function enqueueOutbox(code: string, item: OutboxItem) {
  const next = loadOutbox(code).filter((x) => x.id !== item.id);
  next.push(item);
  next.sort((a, b) => a.ts - b.ts);
  saveOutbox(code, next);
}

export function removeOutboxItem(code: string, id: string) {
  saveOutbox(
    code,
    loadOutbox(code).filter((x) => x.id !== id),
  );
}

export function clearOutbox(code: string) {
  sessionStorage.removeItem(outboxKey(code));
}

export function saveSession(session: StoredSession) {
  sessionStorage.setItem(sessionKey(session.code), JSON.stringify(session));
  sessionStorage.setItem("amnesia:lastCode", session.code);
}

export function loadSession(code: string): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return {
      ...parsed,
      settings: normalizeSettings(parsed.settings),
    };
  } catch {
    return null;
  }
}

export function clearSession(code: string) {
  sessionStorage.removeItem(sessionKey(code));
}
