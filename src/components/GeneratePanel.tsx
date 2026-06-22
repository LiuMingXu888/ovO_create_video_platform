import { Sparkles } from "lucide-react";
import { VIDEO_RESOLUTIONS } from "../lib/imageGenOptions";
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
        </span>
      </div>
      <div className="field-pair">
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
          <span>画质</span>
          <select
            aria-label="画质"
            value={settings.resolution}
            onChange={(event) =>
              onSettingsChange({ ...settings, resolution: event.currentTarget.value as GenerationSettings["resolution"] })
            }
          >
            {VIDEO_RESOLUTIONS.map((resolution) => (
              <option key={resolution} value={resolution}>
                {resolution}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-pair field-pair-duration">
        <label className="field-line field-line-nowrap">
          <span>联网</span>
          <input
            type="checkbox"
            aria-label="联网搜索"
            checked={settings.webSearch}
            onChange={(event) => onSettingsChange({ ...settings, webSearch: event.currentTarget.checked })}
          />
        </label>
        <label className="field-line field-line-range">
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
      </div>
      <button type="button" className="generate-button generate-button-light" onClick={onGenerate} disabled={disabled}>
        <Sparkles size={18} />
        <span>生成视频(需要{creditCost}积分)</span>
      </button>
    </aside>
  );
}
