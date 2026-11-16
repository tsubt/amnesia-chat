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
        <span>Clear letters</span>
        <input
          type="range"
          min={0}
          max={40}
          step={1}
          value={settings.clearLetters}
          disabled={!settings.enabled}
          onChange={(e) =>
            onChange({ ...settings, clearLetters: Number(e.target.value) })
          }
        />
        <em>{settings.clearLetters}</em>
      </label>

      <label className="slider">
        <span>Fade letters</span>
        <input
          type="range"
          min={0}
          max={60}
          step={1}
          value={settings.fadeLetters}
          disabled={!settings.enabled}
          onChange={(e) =>
            onChange({ ...settings, fadeLetters: Number(e.target.value) })
          }
        />
        <em>{settings.fadeLetters}</em>
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
    </section>
  );
}
