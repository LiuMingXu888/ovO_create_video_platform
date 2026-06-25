export type AppMode = "free" | "workflow";

interface ModeSwitchProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

export function ModeSwitch({ mode, onModeChange }: ModeSwitchProps) {
  const isWorkflow = mode === "workflow";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isWorkflow}
      aria-label="模式切换"
      className={`mode-switch${isWorkflow ? " mode-switch--workflow" : ""}`}
      onClick={() => onModeChange(isWorkflow ? "free" : "workflow")}
    >
      <span className="mode-switch-thumb" aria-hidden="true" />
      <span className="mode-switch-label mode-switch-label--free">自由</span>
      <span className="mode-switch-label mode-switch-label--workflow">工作流</span>
    </button>
  );
}
