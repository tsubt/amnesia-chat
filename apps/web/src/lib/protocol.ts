export type Role = "d" | "s";

export type DeliveryState = "queued" | "sent" | "sealing" | "sealed" | "revealed";

export type AmnesiaSettings = {
  enabled: boolean;
  /** Trailing letters that stay fully clear while typing */
  clearLetters: number;
  /** Letters before the clear window that ramp from clear → veiled */
  fadeLetters: number;
  /** 0–1 letter swap intensity on sealed (sent) text */
  scramble: number;
};

export const DEFAULT_AMNESIA: AmnesiaSettings = {
  enabled: true,
  clearLetters: 10,
  fadeLetters: 20,
  scramble: 0.85,
};

/** Accept legacy clearWords/blurPx from older sessions. */
export function normalizeSettings(
  raw: Partial<AmnesiaSettings> & {
    clearWords?: number;
    blurPx?: number;
  } = {},
): AmnesiaSettings {
  return {
    enabled: raw.enabled ?? DEFAULT_AMNESIA.enabled,
    clearLetters:
      raw.clearLetters ??
      raw.clearWords ??
      DEFAULT_AMNESIA.clearLetters,
    fadeLetters: raw.fadeLetters ?? DEFAULT_AMNESIA.fadeLetters,
    scramble: raw.scramble ?? DEFAULT_AMNESIA.scramble,
  };
}

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
      type: "sealed";
      id: string;
      sealedText: string;
      ts: number;
    }
  | {
      v: 1;
      type: "seal_ack";
      id: string;
      ts: number;
    }
  | {
      v: 1;
      type: "reveal";
      id: string;
      text: string;
      ts: number;
    }
  | {
      v: 1;
      type: "reseal";
      id: string;
      sealedText: string;
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
        /** Present for S-authored lines when sealed */
        sealedText?: string;
        delivery?: DeliveryState;
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
  /** Display / canonical text depending on role and delivery */
  text: string;
  sealedText?: string;
  /** S only while queued/sent — never persisted after seal */
  plainText?: string;
  delivery?: DeliveryState;
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
