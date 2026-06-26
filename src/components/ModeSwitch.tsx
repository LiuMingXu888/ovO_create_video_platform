export type AppMode = "free" | "workflow" | "tools";

interface ModeSwitchProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

export function ModeSwitch({ mode, onModeChange }: ModeSwitchProps) {
  return (
    <div className="mode-switch-group" role="group" aria-label="模式切换">
      <button
        type="button"
        className={`mode-switch-button${mode === "free" ? " mode-switch-button--active" : ""}`}
        onClick={() => onModeChange("free")}
      >
        自由
      </button>
      <button
        type="button"
        className={`mode-switch-button${mode === "workflow" ? " mode-switch-button--active" : ""}`}
        onClick={() => onModeChange("workflow")}
      >
        工作流
      </button>
      <button
        type="button"
        className={`mode-switch-button${mode === "tools" ? " mode-switch-button--active" : ""}`}
        onClick={() => onModeChange("tools")}
      >
        工具
      </button>
    </div>
  );
}
