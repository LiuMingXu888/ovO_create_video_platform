import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

interface PromptTokenEditorProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  headerSlot?: ReactNode;
}

const MIN_PROMPT_HEIGHT = 190;

export function PromptTokenEditor({ prompt, onPromptChange, headerSlot }: PromptTokenEditorProps) {
  const [height, setHeight] = useState(MIN_PROMPT_HEIGHT);
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const dragState = dragStateRef.current;

      if (!dragState || !Number.isFinite(event.clientY)) {
        return;
      }

      const maxHeight = Math.floor(window.innerHeight * 0.9);
      const nextHeight = dragState.startHeight + dragState.startY - event.clientY;
      setHeight(Math.min(Math.max(nextHeight, MIN_PROMPT_HEIGHT), maxHeight));
    }

    function handlePointerUp() {
      dragStateRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  function beginResize(event: React.PointerEvent<HTMLElement>) {
    event.preventDefault();
    if (!Number.isFinite(event.clientY)) {
      return;
    }

    dragStateRef.current = {
      startY: event.clientY,
      startHeight: height
    };
    if (Number.isFinite(event.pointerId)) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
  }

  return (
    <div className="prompt-token-editor" style={{ height }}>
      {headerSlot}
      {/* Full-width top strip: hovering anywhere along the top edge shows the
          ns-resize cursor and lets the user drag to change height (UI问题1). */}
      <div
        className="prompt-resize-edge"
        aria-hidden="true"
        onPointerDown={beginResize}
      />
      <button
        type="button"
        className="prompt-resize-handle"
        aria-label="调整提示词高度"
        title="调整提示词高度"
        onPointerDown={beginResize}
      >
        <GripVertical size={14} />
      </button>
      <textarea
        className="prompt-resizable-textarea"
        style={{ resize: "none" }}
        value={prompt}
        onChange={(event) => onPromptChange(event.currentTarget.value)}
        placeholder="输入视频提示词，可用图片1、音频1说明参考素材"
      />
    </div>
  );
}
