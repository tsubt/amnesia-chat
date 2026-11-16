import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { buildJoinPath } from "../lib/invite";

export function Landing() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [key, setKey] = useState("");

  function onJoin(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    const k = key.trim();
    if (!c || !k) return;
    navigate(buildJoinPath(c, k));
  }

  return (
    <main className="landing">
      <div className="landing-atmosphere" aria-hidden />
      <div className="landing-inner">
        <p className="brand">Amnesia</p>
        <h1 className="brand-sub">Chat</h1>
        <p className="lede">
          Two people. One shared stream. Only one of you gets to remember.
        </p>

        <div className="landing-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => navigate("/session/new")}
          >
            Start as D
          </button>

          <form className="join-form" onSubmit={onJoin}>
            <label>
              <span>Session code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label>
              <span>Invite key</span>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="From D’s invite link"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <button
              type="submit"
              className="btn-secondary"
              disabled={!code.trim() || !key.trim()}
            >
              Join as S
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
