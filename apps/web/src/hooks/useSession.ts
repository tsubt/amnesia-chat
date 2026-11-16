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
  type AmnesiaSettings,
  type AppFrame,
  type ChatMessage,
  type Role,
  type ServerMessage,
} from "../lib/protocol";
import {
  loadHistory,
  loadSDisplay,
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
      const safe = next.map((m) =>
        m.from === "s"
          ? {
              ...m,
              text: mangleText(m.plainText ?? m.text, settingsRef.current, m.id, {
                mode: "sealed",
                scrambleLetters: true,
              }),
              displayText: mangleText(
                m.plainText ?? m.text,
                settingsRef.current,
                m.id,
                { mode: "sealed", scrambleLetters: true },
              ),
              plainText: undefined,
            }
          : { ...m, plainText: undefined },
      );
      saveSDisplay(c, safe);
    }
  }, []);

  const appendMessage = useCallback(
    (msg: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        const next = [...prev, msg];
        const r = roleRef.current;
        const c = codeRef.current;
        if (r && c) persistMessages(next, r, c);
        return next;
      });
    },
    [persistMessages],
  );

  const mergeHistory = useCallback(
    (
      incoming: Array<{ id: string; from: Role; text: string; ts: number }>,
    ) => {
      const r = roleRef.current;
      if (!r) return;
      setMessages((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]));
        for (const m of incoming) {
          if (byId.has(m.id)) continue;
          if (r === "s" && m.from === "s") {
            const mangled = settingsRef.current.enabled
              ? mangleText(m.text, settingsRef.current, m.id, {
                  mode: "sealed",
                  scrambleLetters: true,
                })
              : m.text;
            byId.set(m.id, {
              id: m.id,
              from: m.from,
              text: mangled,
              displayText: mangled,
              ts: m.ts,
            });
          } else {
            byId.set(m.id, {
              id: m.id,
              from: m.from,
              text: m.text,
              ts: m.ts,
            });
          }
        }
        const next = [...byId.values()].sort((a, b) => a.ts - b.ts);
        const c = codeRef.current;
        if (c) persistMessages(next, r, c);
        return next;
      });
    },
    [persistMessages],
  );

  const handleAppFrame = useCallback(
    (frame: AppFrame) => {
      const r = roleRef.current;
      if (!r) return;

      if (frame.type === "chat") {
        if (frame.from === r) return;
        appendMessage({
          id: frame.id,
          from: frame.from,
          text: frame.text,
          ts: frame.ts,
        });
        return;
      }

      if (frame.type === "history") {
        mergeHistory(frame.messages);
        return;
      }

      if (frame.type === "settings") {
        setSettings(frame.settings);
        settingsRef.current = frame.settings;
        const c = codeRef.current;
        const key = sessionKeyRef.current;
        if (c && r && key) {
          saveSession({
            code: c,
            role: r,
            sessionKey: key,
            settings: frame.settings,
          });
        }
        if (r === "s") {
          setMessages((prev) => {
            const next = prev.map((m) => {
              if (m.from !== "s" || !m.plainText) return m;
              return {
                ...m,
                displayText: frame.settings.enabled
                  ? mangleText(m.plainText, frame.settings, m.id, {
                      mode: "sealed",
                      scrambleLetters: true,
                    })
                  : m.plainText,
              };
            });
            const c2 = codeRef.current;
            if (c2) persistMessages(next, "s", c2);
            return next;
          });
        }
        return;
      }

      if (frame.type === "presence" && frame.event === "ready") {
        setPeerConnected(true);
      }
    },
    [appendMessage, mergeHistory, persistMessages],
  );

  const sendRelay = useCallback(async (frame: AppFrame) => {
    const ws = wsRef.current;
    const key = cryptoKeyRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !key) return;
    const payload = await encryptPayload(key, JSON.stringify(frame));
    ws.send(JSON.stringify({ type: "relay", payload }));
  }, []);

  const pushHistoryToPeer = useCallback(async () => {
    const hist = messagesRef.current;
    if (!hist.length) return;
    // Prefer canonical plaintext for S lines when D still has it in-memory.
    await sendRelay({
      v: 1,
      type: "history",
      messages: hist.map((m) => ({
        id: m.id,
        from: m.from,
        text: m.plainText ?? m.text,
        ts: m.ts,
      })),
      ts: Date.now(),
    });
  }, [sendRelay]);

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
            const hist = loadSDisplay(msg.code);
            messagesRef.current = hist;
            setMessages(hist);
            setStatus("connected");
          }
          break;
        }
        case "peer_joined":
          clearJoinRetry();
          setError(null);
          setPeerConnected(true);
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
            void sendRelay({
              v: 1,
              type: "presence",
              event: "ready",
              role: "s",
              ts: Date.now(),
            });
          }
          break;
        case "peer_left":
          setPeerConnected(false);
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
    clearJoinRetry,
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
      const frame: AppFrame = {
        v: 1,
        type: "chat",
        id,
        from: r,
        text: trimmed,
        ts,
      };

      if (r === "d") {
        appendMessage({ id, from: r, text: trimmed, ts });
      } else {
        const mangled = settingsRef.current.enabled
          ? mangleText(trimmed, settingsRef.current, id, {
              mode: "sealed",
              scrambleLetters: true,
            })
          : trimmed;
        appendMessage({
          id,
          from: r,
          text: mangled,
          displayText: mangled,
          plainText: trimmed,
          ts,
        });
      }

      await sendRelay(frame);
    },
    [appendMessage, sendRelay],
  );

  const updateSettings = useCallback(
    async (next: AmnesiaSettings) => {
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
    reconnect: connect,
  };
}
