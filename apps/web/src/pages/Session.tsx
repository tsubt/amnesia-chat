import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AmnesiaControls } from "../components/AmnesiaControls";
import { ChatTranscript } from "../components/ChatTranscript";
import { Composer } from "../components/Composer";
import { SharePanel } from "../components/SharePanel";
import { StatusPill } from "../components/StatusPill";
import { useSession } from "../hooks/useSession";
import { buildSessionPath, readInviteKey } from "../lib/invite";
import type { Role } from "../lib/protocol";

type Props = {
  mode: "create" | "join" | "rejoin";
  rejoinRole?: Role;
};

function useDesktopInviteOpen() {
  const [open, setOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 861px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 861px)");
    const sync = () => setOpen(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return [open, setOpen] as const;
}

export function Session({ mode, rejoinRole = "d" }: Props) {
  const { code: codeParam } = useParams();
  const [search] = useSearchParams();
  const keyFromUrl = readInviteKey(search);
  const [inviteOpen, setInviteOpen] = useDesktopInviteOpen();

  // Update the URL without remounting so the create socket stays D.
  const onCreated = useCallback(
    ({ code, sessionKey }: { code: string; sessionKey: string }) => {
      window.history.replaceState(null, "", buildSessionPath(code, sessionKey));
    },
    [],
  );

  const session = useSession({
    mode,
    code: mode === "create" ? undefined : codeParam,
    sessionKey: mode === "create" ? undefined : keyFromUrl,
    rejoinRole: mode === "rejoin" ? rejoinRole : undefined,
    onCreated: mode === "create" ? onCreated : undefined,
  });

  const {
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
    reconnect,
  } = session;

  if (!role && status === "connecting") {
    return (
      <main className="session session-loading">
        <p className="brand-inline">Amnesia</p>
        <p>Connecting…</p>
      </main>
    );
  }

  if (status === "error" && !role) {
    return (
      <main className="session session-loading">
        <p className="brand-inline">Amnesia</p>
        <p className="error-text">{error ?? "Something went wrong"}</p>
        <div className="row-actions">
          <button type="button" onClick={reconnect}>
            Retry
          </button>
          <Link to="/">Home</Link>
        </div>
      </main>
    );
  }

  if (!role || !code) {
    return (
      <main className="session session-loading">
        <p className="brand-inline">Amnesia</p>
        <p>Preparing session…</p>
      </main>
    );
  }

  return (
    <main className={`session role-${role}`}>
      <header className="session-top">
        <div>
          <Link to="/" className="brand-inline">
            Amnesia
          </Link>
          <span className="role-badge">{role === "d" ? "Dominant" : "Submissive"}</span>
        </div>
        <StatusPill status={status} peerConnected={peerConnected} />
      </header>

      {error && <p className="error-banner">{error}</p>}

      <div className={`session-layout ${role === "d" ? "with-side" : ""}`}>
        <section className="chat-panel">
          <ChatTranscript messages={messages} role={role} settings={settings} />
          <Composer
            role={role}
            settings={settings}
            disabled={status === "error" || status === "closed"}
            onSend={sendChat}
          />
        </section>

        {role === "d" && sessionKeyStr && (
          <aside className="side-panel">
            <details
              className="side-drawer"
              open={inviteOpen}
              onToggle={(e) => setInviteOpen(e.currentTarget.open)}
            >
              <summary>Invite &amp; amnesia</summary>
              <div className="side-drawer-body">
                <SharePanel code={code} sessionKey={sessionKeyStr} />
                <AmnesiaControls
                  settings={settings}
                  onChange={(s) => void updateSettings(s)}
                />
              </div>
            </details>
          </aside>
        )}
      </div>
    </main>
  );
}
