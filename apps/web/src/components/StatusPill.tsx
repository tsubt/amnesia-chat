import type { ConnectionStatus } from "../hooks/useSession";

const LABELS: Record<ConnectionStatus, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  waiting: "Waiting for peer",
  connected: "Connected",
  error: "Error",
  closed: "Disconnected",
};

export function StatusPill({
  status,
  peerConnected,
}: {
  status: ConnectionStatus;
  peerConnected: boolean;
}) {
  const label =
    status === "connected" && !peerConnected
      ? "Peer left"
      : LABELS[status];
  return (
    <span className={`status status-${status}`} data-peer={peerConnected}>
      {label}
    </span>
  );
}
