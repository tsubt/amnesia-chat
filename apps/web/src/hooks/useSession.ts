import { useCallback, useEffect, useRef, useState } from "react";
import {
  decryptPayload,
  encryptPayload,
  generateSessionKey,
  importSessionKey,
} from "../lib/crypto";
import { mangleText } from "../lib/amnesia";
import {
  DEFAULT_AMNESIA,
  newId,
  normalizeSettings,
  type AmnesiaSettings,
  type AppFrame,
  type ChatMessage,
  type DeliveryState,
  type Role,
  type ServerMessage,
} from "../lib/protocol";
import {
  enqueueOutbox,
  loadHistory,
  loadOutbox,
  loadSDisplay,
  removeOutboxItem,
  saveHistory,
  saveSDisplay,
  saveSession,
} from "../lib/storage";
import { getWsUrl } from "../lib/wsUrl";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "waiting"
  | "connected"
  | "error"
  | "closed";

type UseSessionOptions = {
  code?: string;
  sessionKey?: string;
  mode: "create" | "join" | "rejoin" | "none";
  rejoinRole?: Role;
  onCreated?: (info: { code: string; sessionKey: string }) => void;
};

function sealText(
  text: string,
  id: string,
  settings: AmnesiaSettings,
): string {
  if (!settings.enabled) return text;
  return mangleText(text, settings, id, {
    mode: "sealed",
    scrambleLetters: true,
  });
}

export function useSession(opts: UseSessionOptions) {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(opts.code ?? null);
  const [role, setRole] = useState<Role | null>(opts.rejoinRole ?? null);
  const [peerConnected, setPeerConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState<AmnesiaSettings>(DEFAULT_AMNESIA);
  const [sessionKeyStr, setSessionKeyStr] = useState<string | null>(
    opts.sessionKey ?? null,
  );

  const wsRef = useRef<WebSocket | null>(null);
  const cryptoKeyRef = useRef<CryptoKey | null>(null);
  const roleRef = useRef<Role | null>(opts.rejoinRole ?? null);
  const codeRef = useRef<string | null>(opts.code ?? null);
  const settingsRef = useRef(settings);
  const sessionKeyRef = useRef<string | null>(opts.sessionKey ?? null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const peerConnectedRef = useRef(false);
  const joinRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCreatedRef = useRef(opts.onCreated);
  onCreatedRef.current = opts.onCreated;

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  useEffect(() => {
    sessionKeyRef.current = sessionKeyStr;
  }, [sessionKeyStr]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    peerConnectedRef.current = peerConnected;
  }, [peerConnected]);

  const clearJoinRetry = useCallback(() => {
    if (joinRetryRef.current) {
      clearTimeout(joinRetryRef.current);
      joinRetryRef.current = null;
    }
  }, []);

  const persistMessages = useCallback((next: ChatMessage[], r: Role, c: string) => {
    if (r === "d") {
      saveHistory(c, next);
    } else {
      saveSDisplay(c, next);
    }
  }, []);

  const updateMessages = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setMessages((prev) => {
        const next = updater(prev);
        const r = roleRef.current;
        const c = codeRef.current;
        if (r && c) persistMessages(next, r, c);
        messagesRef.current = next;
        return next;
      });
    },
    [persistMessages],
  );

  const appendMessage = useCallback(
    (msg: ChatMessage) => {
      updateMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    },
    [updateMessages],
  );

  const patchMessage = useCallback(
    (id: string, patch: Partial<ChatMessage>) => {
      updateMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      );
    },
    [updateMessages],
  );

  const mergeHistory = useCallback(
    (
      incoming: Array<{
        id: string;
        from: Role;
        text: string;
        ts: number;
        sealedText?: string;
        delivery?: DeliveryState;
      }>,
    ) => {
      const r = roleRef.current;
      if (!r) return;
      updateMessages((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]));
        const c = codeRef.current;
        for (const m of incoming) {
          const existing = byId.get(m.id);
          const historySealed =
            Boolean(m.sealedText) ||
            m.delivery === "sealed" ||
            m.delivery === "revealed";

          // Keep local in-flight unless history already carries a seal
          if (
            existing &&
            (existing.delivery === "queued" ||
              existing.delivery === "sent" ||
              existing.delivery === "sealing") &&
            !historySealed
          ) {
            continue;
          }

          if (r === "s" && m.from === "s") {
            const sealed = m.sealedText ?? m.text;
            const revealed = m.delivery === "revealed";
            byId.set(m.id, {
              id: m.id,
              from: m.from,
              text: revealed ? m.text : sealed,
              sealedText: sealed,
              delivery: revealed ? "revealed" : "sealed",
              ts: m.ts,
            });
            if (c && historySealed) removeOutboxItem(c, m.id);
          } else {
            byId.set(m.id, {
              id: m.id,
              from: m.from,
              text: m.text,
              sealedText: m.sealedText,
              delivery: m.delivery,
              ts: m.ts,
            });
          }
        }
        return [...byId.values()].sort((a, b) => a.ts - b.ts);
      });
    },
    [updateMessages],
  );

  const sendRelay = useCallback(async (frame: AppFrame) => {
    const ws = wsRef.current;
    const key = cryptoKeyRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !key) return false;
    const payload = await encryptPayload(key, JSON.stringify(frame));
    ws.send(JSON.stringify({ type: "relay", payload }));
    return true;
  }, []);

  const flushOutbox = useCallback(async () => {
    const c = codeRef.current;
    if (!c || roleRef.current !== "s") return;
    if (!peerConnectedRef.current) return;
    const items = loadOutbox(c);
    for (const item of items) {
      const ok = await sendRelay({
        v: 1,
        type: "chat",
        id: item.id,
        from: "s",
        text: item.text,
        ts: item.ts,
      });
      if (ok) {
        patchMessage(item.id, { delivery: "sent" });
      }
    }
  }, [patchMessage, sendRelay]);

  const pushHistoryToPeer = useCallback(async () => {
    const hist = messagesRef.current;
    if (!hist.length) return;
    await sendRelay({
      v: 1,
      type: "history",
      messages: hist.map((m) => {
        if (m.from === "s") {
          const revealed = m.delivery === "revealed";
          const sealed = m.sealedText ?? sealText(m.text, m.id, settingsRef.current);
          return {
            id: m.id,
            from: m.from,
            text: revealed ? m.text : sealed,
            sealedText: sealed,
            delivery: m.delivery === "revealed" ? "revealed" : "sealed",
            ts: m.ts,
          };
        }
        return {
          id: m.id,
          from: m.from,
          text: m.text,
          ts: m.ts,
        };
      }),
      ts: Date.now(),
    });
  }, [sendRelay]);

  const completeSeal = useCallback(
    async (id: string) => {
      const c = codeRef.current;
      const msg = messagesRef.current.find((m) => m.id === id);
      if (!msg) return;
      const sealed = msg.sealedText ?? msg.text;
      updateMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                text: sealed,
                sealedText: sealed,
                plainText: undefined,
                delivery: "sealed",
              }
            : m,
        ),
      );
      if (c) removeOutboxItem(c, id);
      // Avoid duplicate acks if already sealed (e.g. history heal)
      if (msg.delivery === "sealed") return;
      await sendRelay({
        v: 1,
        type: "seal_ack",
        id,
        ts: Date.now(),
      });
    },
    [sendRelay, updateMessages],
  );

  const handleAppFrame = useCallback(
    (frame: AppFrame) => {
      const r = roleRef.current;
      if (!r) return;

      if (frame.type === "chat") {
        if (frame.from === r) return;

        if (r === "d" && frame.from === "s") {
          const sealed = sealText(frame.text, frame.id, settingsRef.current);
          const amnesiaOn = settingsRef.current.enabled;
          appendMessage({
            id: frame.id,
            from: frame.from,
            text: frame.text,
            sealedText: sealed,
            delivery: amnesiaOn ? "sent" : "sealed",
            ts: frame.ts,
          });
          void sendRelay({
            v: 1,
            type: "sealed",
            id: frame.id,
            sealedText: sealed,
            ts: Date.now(),
          });
          return;
        }

        // S receives D chat — clear
        appendMessage({
          id: frame.id,
          from: frame.from,
          text: frame.text,
          ts: frame.ts,
        });
        return;
      }

      if (frame.type === "sealed") {
        if (r !== "s") return;
        const existing = messagesRef.current.find((m) => m.id === frame.id);
        const plain = existing?.plainText;
        const amnesiaOn = settingsRef.current.enabled;
        const sealed = frame.sealedText;

        // Drop outbox as soon as D's sealed form is known (plaintext only
        // remains in memory for the letter-swap animation).
        const c = codeRef.current;
        if (c) removeOutboxItem(c, frame.id);

        if (!amnesiaOn || !plain || plain === sealed) {
          updateMessages((prev) => {
            const has = prev.some((m) => m.id === frame.id);
            if (has) {
              return prev.map((m) =>
                m.id === frame.id
                  ? {
                      ...m,
                      text: sealed,
                      sealedText: sealed,
                      plainText: undefined,
                      delivery: "sealed",
                    }
                  : m,
              );
            }
            return [
              ...prev,
              {
                id: frame.id,
                from: "s" as const,
                text: sealed,
                sealedText: sealed,
                delivery: "sealed" as const,
                ts: frame.ts,
              },
            ];
          });
          void sendRelay({
            v: 1,
            type: "seal_ack",
            id: frame.id,
            ts: Date.now(),
          });
          return;
        }

        updateMessages((prev) =>
          prev.map((m) =>
            m.id === frame.id
              ? {
                  ...m,
                  sealedText: sealed,
                  delivery: "sealing",
                }
              : m,
          ),
        );
        return;
      }

      if (frame.type === "seal_ack") {
        if (r !== "d") return;
        patchMessage(frame.id, { delivery: "sealed" });
        return;
      }

      if (frame.type === "reveal") {
        if (r !== "s") return;
        patchMessage(frame.id, {
          text: frame.text,
          plainText: undefined,
          delivery: "revealed",
        });
        return;
      }

      if (frame.type === "reseal") {
        if (r !== "s") return;
        patchMessage(frame.id, {
          text: frame.sealedText,
          sealedText: frame.sealedText,
          plainText: undefined,
          delivery: "sealed",
        });
        return;
      }

      if (frame.type === "history") {
        mergeHistory(frame.messages);
        return;
      }

      if (frame.type === "settings") {
        const next = normalizeSettings(frame.settings);
        setSettings(next);
        settingsRef.current = next;
        const c = codeRef.current;
        const key = sessionKeyRef.current;
        if (c && r && key) {
          saveSession({
            code: c,
            role: r,
            sessionKey: key,
            settings: next,
          });
        }
        return;
      }

      if (frame.type === "presence" && frame.event === "ready") {
        setPeerConnected(true);
        peerConnectedRef.current = true;
      }
    },
    [appendMessage, mergeHistory, patchMessage, sendRelay, updateMessages],
  );

  const connect = useCallback(() => {
    if (opts.mode === "none") return;
    clearJoinRetry();

    if (
      (opts.mode === "join" || opts.mode === "rejoin") &&
      !opts.sessionKey
    ) {
      setError("Invite key missing. Open the full invite link from D.");
      setStatus("error");
      return;
    }

    if ((opts.mode === "join" || opts.mode === "rejoin") && !opts.code) {
      setError("Session code missing.");
      setStatus("error");
      return;
    }

    setStatus("connecting");
    setError(null);

    const localKey =
      opts.mode === "create"
        ? (sessionKeyRef.current ?? generateSessionKey())
        : (opts.sessionKey as string);

    sessionKeyRef.current = localKey;
    setSessionKeyStr(localKey);

    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;
    let opened = false;

    const isCurrent = () => wsRef.current === ws;

    const scheduleJoinRetry = () => {
      clearJoinRetry();
      joinRetryRef.current = setTimeout(() => {
        if (!isCurrent() || ws.readyState !== WebSocket.OPEN) return;
        if (opts.mode === "join" && opts.code) {
          ws.send(JSON.stringify({ type: "join", code: opts.code }));
        } else if (opts.mode === "rejoin" && opts.code && opts.rejoinRole === "s") {
          ws.send(
            JSON.stringify({
              type: "rejoin",
              code: opts.code,
              role: "s",
            }),
          );
        }
      }, 2000);
    };

    ws.onopen = () => {
      if (!isCurrent()) return;
      opened = true;
      setError(null);
      void (async () => {
        try {
          cryptoKeyRef.current = await importSessionKey(localKey);
        } catch {
          if (!isCurrent()) return;
          setError("Invalid invite key.");
          setStatus("error");
          ws.close();
          return;
        }

        if (!isCurrent()) return;

        if (opts.mode === "create") {
          ws.send(JSON.stringify({ type: "create" }));
        } else if (opts.mode === "rejoin" && opts.code && opts.rejoinRole) {
          ws.send(
            JSON.stringify({
              type: "rejoin",
              code: opts.code,
              role: opts.rejoinRole,
            }),
          );
        } else if (opts.mode === "join" && opts.code) {
          ws.send(JSON.stringify({ type: "join", code: opts.code }));
        }
      })();
    };

    ws.onmessage = async (ev) => {
      if (!isCurrent()) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case "created":
        case "joined": {
          clearJoinRetry();
          setError(null);
          setCode(msg.code);
          setRole(msg.role);
          roleRef.current = msg.role;
          codeRef.current = msg.code;
          const keyStr = sessionKeyRef.current!;
          saveSession({
            code: msg.code,
            role: msg.role,
            sessionKey: keyStr,
            settings: settingsRef.current,
          });

          if (msg.type === "created") {
            onCreatedRef.current?.({ code: msg.code, sessionKey: keyStr });
          }

          if (msg.role === "d") {
            const hist = loadHistory(msg.code);
            messagesRef.current = hist;
            setMessages(hist);
            setStatus("waiting");
          } else {
            const sealed = loadSDisplay(msg.code);
            const outbox = loadOutbox(msg.code);
            const byId = new Map(sealed.map((m) => [m.id, m]));
            // Drop outbox rows already sealed in localStorage (privacy)
            for (const item of outbox) {
              if (byId.has(item.id)) {
                removeOutboxItem(msg.code, item.id);
                continue;
              }
              byId.set(item.id, {
                id: item.id,
                from: "s",
                text: item.text,
                plainText: item.text,
                delivery: "queued",
                ts: item.ts,
              });
            }
            const merged = [...byId.values()].sort((a, b) => a.ts - b.ts);
            messagesRef.current = merged;
            setMessages(merged);
            setStatus("connected");
          }
          break;
        }
        case "peer_joined":
          clearJoinRetry();
          setError(null);
          setPeerConnected(true);
          peerConnectedRef.current = true;
          setStatus("connected");
          if (roleRef.current === "d") {
            void (async () => {
              await sendRelay({
                v: 1,
                type: "settings",
                settings: settingsRef.current,
                ts: Date.now(),
              });
              await sendRelay({
                v: 1,
                type: "presence",
                event: "ready",
                role: "d",
                ts: Date.now(),
              });
              await pushHistoryToPeer();
            })();
          } else {
            void (async () => {
              await sendRelay({
                v: 1,
                type: "presence",
                event: "ready",
                role: "s",
                ts: Date.now(),
              });
              await flushOutbox();
            })();
          }
          break;
        case "peer_left":
          setPeerConnected(false);
          peerConnectedRef.current = false;
          setStatus("waiting");
          break;
        case "relay": {
          const key = cryptoKeyRef.current;
          if (!key) return;
          try {
            const plain = await decryptPayload(key, msg.payload);
            const frame = JSON.parse(plain) as AppFrame;
            if (!frame || typeof frame !== "object" || frame.v !== 1) return;
            handleAppFrame(frame);
          } catch {
            if (isCurrent()) {
              setError("Failed to decrypt a message (wrong invite key?)");
            }
          }
          break;
        }
        case "error":
          if (msg.message === "Peer not connected") {
            // Soft: S messages stay queued; do not hard-error the session.
            if (roleRef.current === "s") {
              updateMessages((prev) =>
                prev.map((m) =>
                  m.from === "s" &&
                  (m.delivery === "sent" || !m.delivery) &&
                  m.plainText
                    ? { ...m, delivery: "queued" }
                    : m,
                ),
              );
            }
            break;
          }
          if (
            msg.message === "Room not found" &&
            (opts.mode === "join" ||
              (opts.mode === "rejoin" && opts.rejoinRole === "s"))
          ) {
            setError("Waiting for D to reopen the room…");
            setStatus("waiting");
            scheduleJoinRetry();
            break;
          }
          setError(msg.message);
          setStatus("error");
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      if (!isCurrent()) return;
      clearJoinRetry();
      setStatus((s) => (s === "error" ? s : "closed"));
      setPeerConnected(false);
      peerConnectedRef.current = false;
    };

    ws.onerror = () => {
      if (!isCurrent()) return;
      if (opened) return;
      setError("Connection failed — is the relay running?");
      setStatus("error");
    };
  }, [
    opts.mode,
    opts.code,
    opts.sessionKey,
    opts.rejoinRole,
    handleAppFrame,
    sendRelay,
    pushHistoryToPeer,
    flushOutbox,
    clearJoinRetry,
    updateMessages,
  ]);

  useEffect(() => {
    if (opts.mode === "none") return;
    connect();
    return () => {
      clearJoinRetry();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.mode, opts.code, opts.sessionKey, opts.rejoinRole]);

  const sendChat = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const r = roleRef.current;
      if (!r) return;
      const id = newId();
      const ts = Date.now();
      const c = codeRef.current;

      if (r === "d") {
        appendMessage({ id, from: r, text: trimmed, ts });
        await sendRelay({
          v: 1,
          type: "chat",
          id,
          from: r,
          text: trimmed,
          ts,
        });
        return;
      }

      // S: queue locally; flush when peer is up
      if (c) {
        enqueueOutbox(c, { id, text: trimmed, ts });
      }
      const canSend = peerConnectedRef.current;
      appendMessage({
        id,
        from: r,
        text: trimmed,
        plainText: trimmed,
        delivery: canSend ? "sent" : "queued",
        ts,
      });

      if (canSend) {
        const ok = await sendRelay({
          v: 1,
          type: "chat",
          id,
          from: r,
          text: trimmed,
          ts,
        });
        if (!ok) {
          patchMessage(id, { delivery: "queued" });
        }
      }
    },
    [appendMessage, patchMessage, sendRelay],
  );

  const toggleReveal = useCallback(
    async (id: string) => {
      if (roleRef.current !== "d") return;
      const msg = messagesRef.current.find((m) => m.id === id);
      if (!msg || msg.from !== "s") return;
      if (!settingsRef.current.enabled) return;

      if (msg.delivery === "revealed") {
        const sealed =
          msg.sealedText ?? sealText(msg.text, msg.id, settingsRef.current);
        patchMessage(id, { delivery: "sealed", sealedText: sealed });
        await sendRelay({
          v: 1,
          type: "reseal",
          id,
          sealedText: sealed,
          ts: Date.now(),
        });
      } else if (msg.delivery === "sealed") {
        patchMessage(id, { delivery: "revealed" });
        await sendRelay({
          v: 1,
          type: "reveal",
          id,
          text: msg.text,
          ts: Date.now(),
        });
      }
    },
    [patchMessage, sendRelay],
  );

  const updateSettings = useCallback(
    async (next: AmnesiaSettings) => {
      next = normalizeSettings(next);
      setSettings(next);
      settingsRef.current = next;
      const c = codeRef.current;
      const r = roleRef.current;
      const key = sessionKeyRef.current;
      if (c && r && key) {
        saveSession({ code: c, role: r, sessionKey: key, settings: next });
      }
      if (r === "d") {
        await sendRelay({
          v: 1,
          type: "settings",
          settings: next,
          ts: Date.now(),
        });
      }
    },
    [sendRelay],
  );

  return {
    status,
    error,
    code,
    role,
    peerConnected,
    messages,
    settings,
    sessionKeyStr,
    sendChat,
    updateSettings,
    toggleReveal,
    completeSeal,
    reconnect: connect,
  };
}
