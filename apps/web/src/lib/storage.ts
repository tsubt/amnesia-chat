import type { AmnesiaSettings, ChatMessage, Role } from "./protocol";
import { DEFAULT_AMNESIA } from "./protocol";

const historyKey = (code: string) => `amnesia:history:${code}`;
const sessionKey = (code: string) => `amnesia:session:${code}`;
const sDisplayKey = (code: string) => `amnesia:s-display:${code}`;

export type StoredSession = {
  code: string;
  role: Role;
  sessionKey: string;
  settings: AmnesiaSettings;
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
  localStorage.setItem(historyKey(code), JSON.stringify(messages));
}

/** S only stores display (mangled) form of own messages + clear D messages */
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
  localStorage.setItem(sDisplayKey(code), JSON.stringify(messages));
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
      settings: { ...DEFAULT_AMNESIA, ...parsed.settings },
    };
  } catch {
    return null;
  }
}

export function clearSession(code: string) {
  sessionStorage.removeItem(sessionKey(code));
}
