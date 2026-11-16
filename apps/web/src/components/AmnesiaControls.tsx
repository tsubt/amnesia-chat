import type { AmnesiaSettings } from "../lib/protocol";

type Props = {
  settings: AmnesiaSettings;
  onChange: (next: AmnesiaSettings) => void;
};

export function AmnesiaControls({ settings, onChange }: Props) {
  return (
    <section className="controls" aria-label="Amnesia settings">
      <h2>Amnesia</h2>
      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) =>
            onChange({ ...settings, enabled: e.target.checked })
          }
        />
        <span>{settings.enabled ? "On" : "Off"}</span>
      </label>

      <label className="slider">
        <span>Clear words</span>
        <input
          type="range"
          min={0}
          max={12}
          step={1}
          value={settings.clearWords}
          disabled={!settings.enabled}
          onChange={(e) =>
            onChange({ ...settings, clearWords: Number(e.target.value) })
          }
        />
        <em>{settings.clearWords}</em>
      </label>

      <label className="slider">
        <span>Scramble</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.scramble}
          disabled={!settings.enabled}
          onChange={(e) =>
            onChange({ ...settings, scramble: Number(e.target.value) })
          }
        />
        <em>{Math.round(settings.scramble * 100)}%</em>
      </label>

      <label className="slider">
        <span>Blur</span>
        <input
          type="range"
          min={0}
          max={6}
          step={0.25}
          value={settings.blurPx}
          disabled={!settings.enabled}
          onChange={(e) =>
            onChange({ ...settings, blurPx: Number(e.target.value) })
          }
        />
        <em>{settings.blurPx.toFixed(2)}px</em>
      </label>
    </section>
  );
}
