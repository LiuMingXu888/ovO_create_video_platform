interface PromptTokenEditorProps {
  prompt: string;
  onPromptChange: (value: string) => void;
}

export function PromptTokenEditor({ prompt, onPromptChange }: PromptTokenEditorProps) {
  return (
    <div className="prompt-token-editor">
      <textarea
        value={prompt}
        onChange={(event) => onPromptChange(event.currentTarget.value)}
        placeholder="输入视频提示词，点击资源 + 会插入资源标签"
      />
    </div>
  );
}
