import { QRCodeSVG } from "qrcode.react";
import { useMemo, useState } from "react";
import { buildJoinUrl } from "../lib/invite";

type Props = {
  code: string;
  sessionKey: string;
};

export function SharePanel({ code, sessionKey }: Props) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const joinUrl = useMemo(
    () => buildJoinUrl(code, sessionKey),
    [code, sessionKey],
  );

  async function copy(kind: "code" | "link") {
    const value = kind === "code" ? code : joinUrl;
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <section className="share" aria-label="Invite">
      <h2>Invite S</h2>
      <p className="share-code" aria-label="Session code">
        {code}
      </p>
      <div className="share-actions">
        <button type="button" onClick={() => void copy("code")}>
          {copied === "code" ? "Copied" : "Copy code"}
        </button>
        <button type="button" onClick={() => void copy("link")}>
          {copied === "link" ? "Copied" : "Copy link"}
        </button>
      </div>
      <div className="share-qr">
        <QRCodeSVG value={joinUrl} size={148} bgColor="transparent" fgColor="currentColor" />
      </div>
      <p className="share-note">
        Scan or open the link to join (both of you must be on this same public URL, not localhost).
      </p>
    </section>
  );
}
