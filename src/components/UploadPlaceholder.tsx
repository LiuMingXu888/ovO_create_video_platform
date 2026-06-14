import { Plus } from "lucide-react";
import type { AssetCategory } from "../types";

interface UploadPlaceholderProps {
  accept?: string;
  category: AssetCategory;
  onFilesSelected: (category: AssetCategory, files: FileList) => void;
}

export function UploadPlaceholder({ accept, category, onFilesSelected }: UploadPlaceholderProps) {
  return (
    <label className="upload-placeholder" title="本地选择文件">
      <input
        accept={accept}
        className="visually-hidden"
        type="file"
        multiple
        onChange={(event) => {
          if (event.currentTarget.files) {
            onFilesSelected(category, event.currentTarget.files);
          }
          event.currentTarget.value = "";
        }}
      />
      <Plus size={30} />
    </label>
  );
}
