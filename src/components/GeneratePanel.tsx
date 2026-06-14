import { CaptionsOff, Sparkles } from "lucide-react";

interface GeneratePanelProps {
  onGenerate: () => void;
  disabled?: boolean;
  statusMessage?: string;
}

export function GeneratePanel({ onGenerate, disabled = false, statusMessage }: GeneratePanelProps) {
  return (
    <aside className="generate-panel" aria-label="生成设置">
      <div>
        <strong>Seedance 2.0</strong>
        <span>9:16 · 720p</span>
      </div>
      <label className="toggle-line">
        <input type="checkbox" />
        <CaptionsOff size={16} />
        <span>去除字幕</span>
      </label>
      <button type="button" className="generate-button" onClick={onGenerate} disabled={disabled}>
        <Sparkles size={18} />
        <span>生成视频</span>
      </button>
      {statusMessage && <div className="generate-status">{statusMessage}</div>}
    </aside>
  );
}
