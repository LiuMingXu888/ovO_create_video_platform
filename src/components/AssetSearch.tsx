import { Download, Maximize2, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { searchAssets } from "../lib/assetSearch";
import type { AssetAction, CanvasAsset } from "../types";

interface AssetSearchProps {
  assets: CanvasAsset[];
  onAction: (asset: CanvasAsset, action: AssetAction) => void;
  onPreview: (asset: CanvasAsset, results: CanvasAsset[]) => void;
}

export function AssetSearch({ assets, onAction, onPreview }: AssetSearchProps) {
  const [query, setQuery] = useState("");
  const groups = searchAssets(assets, query);
  const flat = groups.flatMap((g) => g.items);

  return (
    <div className="asset-search">
      <div className="asset-search-input">
        <Search size={15} />
        <input
          type="search"
          role="searchbox"
          aria-label="搜索资源"
          placeholder="搜索资源名称"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      </div>
      {query.trim() && (
        <div className="asset-search-results" aria-label="搜索结果">
          {groups.length === 0 ? (
            <div className="asset-search-empty">无匹配</div>
          ) : (
            groups.map((group) => (
              <div key={group.category} className="asset-search-group">
                <div className="asset-search-group-title">{group.title}</div>
                {group.items.map((asset) => (
                  <div key={asset.id} className="asset-search-row">
                    <span className="asset-search-name" title={asset.name}>{asset.name}</span>
                    <div className="asset-search-actions">
                      <button type="button" title="加入引用" aria-label={`加入引用 ${asset.name}`} onClick={() => onAction(asset, "insert")}><Plus size={14} /></button>
                      <button type="button" title="放大预览" aria-label={`放大预览 ${asset.name}`} onClick={() => onPreview(asset, flat)}><Maximize2 size={14} /></button>
                      <button type="button" title="下载" aria-label={`下载 ${asset.name}`} onClick={() => onAction(asset, "download")}><Download size={14} /></button>
                      <button type="button" title="删除" aria-label={`删除 ${asset.name}`} onClick={() => onAction(asset, "delete")}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
