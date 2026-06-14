import { CaptionsOff, Sparkles } from "lucide-react";

export function GeneratePanel() {
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
      <button type="button" className="generate-button">
        <Sparkles size={18} />
        <span>生成视频</span>
      </button>
    </aside>
  );
}
