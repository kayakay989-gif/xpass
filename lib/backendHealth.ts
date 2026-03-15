// Simple backend health helper (original Render-based behavior)
import { config } from "@/lib/config";

export interface BackendVersionInfo {
  version: string;
  commit: string;
  env: string;
  timestamp: string;
}

// Return null if backend is unavailable; caller decides how to handle.
export async function checkBackendHealth(): Promise<BackendVersionInfo | null> {
  try {
    if (!config.api.baseUrl) {
      console.warn("[BackendHealth] Missing API base URL; treating backend as unavailable");
      return null;
    }

    const url = `${config.api.baseUrl.replace(/\/+$/, "")}/api`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      console.error("[BackendHealth] Health endpoint returned non-OK status:", res.status);
      return null;
    }
    // Original implementation didn't need version details; keep shape minimal
    const json = (await res.json()) as any;
    return {
      version: json.version || "unknown",
      commit: json.commit || "unknown",
      env: json.env || "production",
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[BackendHealth] Health check failed", err);
    return null;
  }
}

