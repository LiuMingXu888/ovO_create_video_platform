import { FolderOpen, X } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  downloadDir: string;
  onChangeDownloadDir: (value: string) => void;
  onPickFolder: () => void;
  onSave: () => void;
  onClose: () => void;
}

export function SettingsModal({ open, downloadDir, onChangeDownloadDir, onPickFolder, onSave, onClose }: SettingsModalProps) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="设置">
      <div className="settings-modal">
        <button type="button" className="modal-close" onClick={onClose} title="关闭" aria-label="关闭">
          <X size={20} />
        </button>
        <h2 className="settings-title">设置</h2>
        <label className="settings-field">
          <span>下载路径</span>
          <div className="settings-field-row">
            <input
              type="text"
              value={downloadDir}
              placeholder="默认下载到系统下载文件夹"
              onChange={(e) => onChangeDownloadDir(e.currentTarget.value)}
            />
            <button type="button" className="secondary-button" onClick={onPickFolder} title="选择文件夹" aria-label="选择文件夹">
              <FolderOpen size={16} />
            </button>
          </div>
          <small>留空则下载到系统下载文件夹。路径末尾不要加斜杠。</small>
        </label>
        <div className="settings-actions">
          <button type="button" className="primary-button" onClick={onSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
