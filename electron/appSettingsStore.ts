import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface AppSettings {
  downloadDir: string;
}

function settingsFilePath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

export function readAppSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { downloadDir: typeof parsed.downloadDir === "string" ? parsed.downloadDir : "" };
  } catch {
    return { downloadDir: "" };
  }
}

export function writeAppSettings(input: AppSettings): { ok: true } {
  fs.mkdirSync(path.dirname(settingsFilePath()), { recursive: true });
  fs.writeFileSync(settingsFilePath(), JSON.stringify({ downloadDir: input.downloadDir ?? "" }, null, 2), "utf-8");
  return { ok: true };
}

export function resolveDownloadDir(downloadsFallback: string, configuredDir: string): string {
  const trimmed = (configuredDir ?? "").trim();
  return trimmed.length > 0 ? trimmed : downloadsFallback;
}
