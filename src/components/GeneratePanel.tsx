import { Sparkles } from "lucide-react";
import type { GenerationSettings } from "../types";

interface GeneratePanelProps {
  settings: GenerationSettings;
  onSettingsChange: (settings: GenerationSettings) => void;
  onGenerate: () => void;
  disabled?: boolean;
}

export function GeneratePanel({ settings, onSettingsChange, onGenerate, disabled = false }: GeneratePanelProps) {
  const creditCost = settings.durationSeconds * 10;

  return (
    <aside className="generate-panel generate-panel-fixed" aria-label="生成设置">
      <div className="generate-summary">
        <strong>Seedance 2.0</strong>
        <span>
          <b>全能参考</b>
          <em>720p</em>
        </span>
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
        <span>{settings.durationSeconds}s</span>
        <input
          type="range"
          aria-label="时长"
          min="4"
          max="15"
          step="1"
          value={settings.durationSeconds}
          onChange={(event) =>
            onSettingsChange({
              ...settings,
              durationSeconds: Number(event.currentTarget.value)
            })
          }
        />
      </label>
      <label className="field-line field-line-nowrap">
        <span>联网搜索</span>
        <input
          type="checkbox"
          aria-label="联网搜索"
          checked={settings.webSearch}
          onChange={(event) => onSettingsChange({ ...settings, webSearch: event.currentTarget.checked })}
        />
      </label>
      <button type="button" className="generate-button" onClick={onGenerate} disabled={disabled}>
        <Sparkles size={18} />
        <span>生成视频(需要{creditCost}积分)</span>
      </button>
    </aside>
  );
}
