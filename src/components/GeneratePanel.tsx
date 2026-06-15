import { Sparkles } from "lucide-react";
import type { GenerationSettings } from "../types";

interface GeneratePanelProps {
  settings: GenerationSettings;
  onSettingsChange: (settings: GenerationSettings) => void;
  onGenerate: () => void;
  disabled?: boolean;
  statusMessage?: string;
}

export function GeneratePanel({ settings, onSettingsChange, onGenerate, disabled = false, statusMessage }: GeneratePanelProps) {
  return (
    <aside className="generate-panel" aria-label="生成设置">
      <div className="generate-summary">
        <strong>Seedance 2.0</strong>
        <span>{settings.aspectRatio} · {settings.durationSeconds}s · 720p</span>
      </div>
      <label className="field-line">
        <span>比例</span>
        <select
          aria-label="比例"
          value={settings.aspectRatio}
          onChange={(event) =>
            onSettingsChange({ ...settings, aspectRatio: event.currentTarget.value as GenerationSettings["aspectRatio"] })
          }
        >
          <option value="9:16">9:16</option>
          <option value="16:9">16:9</option>
          <option value="1:1">1:1</option>
        </select>
      </label>
      <label className="field-line">
        <span>时长</span>
        <select
          aria-label="时长"
          value={String(settings.durationSeconds)}
          onChange={(event) =>
            onSettingsChange({
              ...settings,
              durationSeconds: Number(event.currentTarget.value) as GenerationSettings["durationSeconds"]
            })
          }
        >
          <option value="5">5s</option>
          <option value="10">10s</option>
          <option value="16">16s</option>
        </select>
      </label>
      <label className="toggle-line">
        <input
          type="checkbox"
          aria-label="全能参考模式"
          checked={settings.omnireference}
          onChange={(event) => onSettingsChange({ ...settings, omnireference: event.currentTarget.checked })}
        />
        <span>全能参考模式</span>
      </label>
      <button type="button" className="generate-button" onClick={onGenerate} disabled={disabled}>
        <Sparkles size={18} />
        <span>生成视频</span>
      </button>
      {statusMessage && <div className="generate-status">{statusMessage}</div>}
    </aside>
  );
}
