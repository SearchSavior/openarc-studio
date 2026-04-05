import { untrack } from "svelte";
import { invoke } from "@tauri-apps/api/core";

export type AppSettings = {
  runtimeMode: "local" | "remote";
  remoteEndpoint: string;
  apiKey: string;
  startOnBoot: boolean;
  autoUpdate: boolean;
  compactMode: boolean;
  defaultModelPath: string;
};

export type LogLevel = "error" | "warn" | "info" | "v1" | "v2" | "v3" | "v4";

export type LogEntry = {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  details?: string;
};

export const appState = $state({
  settingsOpen: false,
  downloaderOpen: false,
  leftPanelOpen: true,
  rightPanelOpen: true,
  hasCompletedSetup: false,

  logs: [] as LogEntry[],

  addLog(level: LogLevel, message: string, details?: string) {
    untrack(() => {
      this.logs.unshift({
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        timestamp: new Date(),
        level,
        message,
        details,
      });
      if (this.logs.length > 2000) {
        this.logs.pop();
      }
    });
  },

  clearLogs() {
    this.logs = [];
  },

  settings: {
    runtimeMode: "remote" as "local" | "remote",
    remoteEndpoint: "http://127.0.0.1:8000",
    apiKey: "openarc-api-key",
    startOnBoot: false,
    autoUpdate: true,
    compactMode: false,
    defaultModelPath: "/home/user/models",
  } as AppSettings,

  async saveSettings() {
    if (typeof window !== "undefined") {
      try {
        await invoke("save_settings", {
          settings: this.settings,
          hasCompletedSetup: this.hasCompletedSetup,
        });
      } catch (e) {
        console.error("Failed to save settings to disk", e);
        localStorage.setItem("openarc_settings", JSON.stringify(this.settings));
        localStorage.setItem(
          "hasCompletedSetup",
          this.hasCompletedSetup ? "true" : "false",
        );
      }
    }
  },

  async loadSettings() {
    if (typeof window !== "undefined") {
      try {
        const data = await invoke<any>("load_app_settings");
        if (data && data.settings) {
          this.settings = { ...this.settings, ...data.settings };
          this.hasCompletedSetup = data.hasCompletedSetup === true;
          return;
        }
      } catch (e) {
        console.error("Failed to load settings from disk", e);
      }

      const saved = localStorage.getItem("openarc_settings");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          this.settings = { ...this.settings, ...parsed };
        } catch (e) {
          console.error("Failed to parse settings", e);
        }
      }
      this.hasCompletedSetup =
        localStorage.getItem("hasCompletedSetup") === "true";
    }
  },
});
