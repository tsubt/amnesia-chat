export type Role = "d" | "s";

export type AmnesiaSettings = {
  enabled: boolean;
  /** Words that stay clear at the end of S's text */
  clearWords: number;
  /** 0–1 letter swap intensity on mangled region */
  scramble: number;
  /** CSS blur in px applied to mangled region */
  blurPx: number;
};

export const DEFAULT_AMNESIA: AmnesiaSettings = {
  enabled: true,
  clearWords: 3,
  scramble: 0.85,
  blurPx: 3.5,
};

/** Inner encrypted application frames */
export type AppFrame =
  | {
      v: 1;
      type: "chat";
      id: string;
      from: Role;
      text: string;
      ts: number;
    }
  | {
      v: 1;
      type: "settings";
      settings: AmnesiaSettings;
      ts: number;
    }
  | {
      v: 1;
      type: "presence";
      event: "ready";
      role: Role;
      ts: number;
    }
  | {
      v: 1;
      type: "history";
      messages: Array<{
        id: string;
        from: Role;
        text: string;
        ts: number;
      }>;
      ts: number;
    }
  | {
      v: 1;
      type: "draft";
      from: Role;
      text: string;
      ts: number;
    }
  | {
      v: 1;
      type: "draft_flush";
      from: Role;
      text: string;
      id: string;
      ts: number;
    };

export type ChatMessage = {
  id: string;
  from: Role;
  text: string;
  /** For S own messages: already-mangled display string */
  displayText?: string;
  /** In-memory only for S during the live session (never persisted) */
  plainText?: string;
  ts: number;
};

export type ServerMessage =
  | { type: "hello"; serverTime: number }
  | { type: "created"; code: string; role: Role }
  | { type: "joined"; code: string; role: Role }
  | { type: "peer_joined"; role: Role }
  | { type: "peer_left"; role: Role }
  | { type: "relay"; from: Role; payload: string }
  | { type: "pong"; serverTime: number }
  | { type: "error"; message: string };

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
