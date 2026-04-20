import { invoke } from "@tauri-apps/api/core";
import { appState } from "$lib/state.svelte.js";

type OptimisticLoadEntry = {
  status: "loading" | "failed";
  modelInfo: {
    name: string;
    type: string;
    path: string;
  };
  addedAt: number;
  error?: string;
};

export class OpenArcClient {
  status = $state<any>(null);
  version = $state<any>(null);
  metrics = $state<any>(null);
  downloads = $state<any>(null);
  localModels = $state<any>(null);
  error = $state<string | null>(null);
  loading = $state<boolean>(false);
  isOnline = $state<boolean>(false);
  lastHeartbeatAt = $state<number | null>(null);

  // optimistic load tracking - shows models as "loading" before server confirms
  optimisticLoads = $state<Record<string, OptimisticLoadEntry>>({});
  private optimisticTimers: Record<
    string,
    {
      loadDelay: ReturnType<typeof setTimeout>;
      timeout: ReturnType<typeof setTimeout>;
      failedTimeout?: ReturnType<typeof setTimeout>;
    }
  > = {};
  private readonly OPTIMISTIC_LOAD_DELAY_MS = 3_000; // delay before sending the actual server request
  private readonly OPTIMISTIC_TIMEOUT_MS = 90_000; // total revert timeout from when "Load" was clicked
  private readonly FAILED_DISPLAY_MS = 15_000; // auto-dismiss red "Failed" badge after this

  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatIntervalMs = 3000;
  private heartbeatGen = 0;
  private reconnecting = false;

  async configure(baseUrl: string, apiKey: string) {
    appState.addLog(
      "v2",
      "Configuring OpenArc client...",
      `Base URL: ${baseUrl}`,
    );
    this.stopHeartbeat();
    this.loading = true;
    this.error = null;
    this.isOnline = false;
    this.status = null;
    try {
      await invoke("configure_client", { baseUrl, apiKey });
      appState.addLog("info", "Client endpoint configured", baseUrl);
    } catch (e: any) {
      appState.addLog("error", "Failed to configure client", e.toString());
      this.error = e.toString();
      this.loading = false;
      return;
    }
    await this.heartbeat();
    this.loading = false;
    this.startHeartbeat();
  }

  startHeartbeat(intervalMs: number = this.heartbeatIntervalMs) {
    this.stopHeartbeat();
    this.heartbeatIntervalMs = intervalMs;
    const gen = ++this.heartbeatGen;
    appState.addLog("v2", `Starting heartbeat (${intervalMs}ms)`);
    const tick = async () => {
      if (gen !== this.heartbeatGen) return;
      await this.heartbeat();
      if (gen !== this.heartbeatGen) return;
      this.heartbeatTimer = setTimeout(tick, this.heartbeatIntervalMs);
    };
    this.heartbeatTimer = setTimeout(tick, this.heartbeatIntervalMs);
  }

  stopHeartbeat() {
    this.heartbeatGen++;
    if (this.heartbeatTimer !== null) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async heartbeat() {
    const wasOnline = this.isOnline;
    try {
      const status = await invoke("get_server_status");
      this.status = status;
      this.lastHeartbeatAt = Date.now();
      this.error = null;
      appState.addLog("v4", "Heartbeat OK", JSON.stringify(status));
      this.reconcileOptimisticLoads();
      if (!wasOnline) {
        this.isOnline = true;
        appState.addLog("info", "Remote available — establishing session");
        await this.reconnect();
      } else {
        await Promise.allSettled([
          this.refreshMetrics(),
          this.refreshDownloads(),
          this.refreshLocalModels(),
        ]);
      }
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      if (wasOnline) {
        appState.addLog("warn", "Lost connection to remote", msg);
      } else {
        appState.addLog("v3", "Heartbeat failed", msg);
      }
      this.isOnline = false;
      this.status = null;
      this.error = msg;
    }
  }

  private async reconnect() {
    if (this.reconnecting) return;
    this.reconnecting = true;
    try {
      await Promise.allSettled([
        this.refreshVersion(),
        this.refreshMetrics(),
        this.refreshDownloads(),
        this.refreshLocalModels(),
      ]);
      appState.addLog("info", "Reconnected to OpenArc");
    } finally {
      this.reconnecting = false;
    }
  }

  async refreshStatus() {
    appState.addLog("v2", "Refreshing server status...");
    try {
      this.status = await invoke("get_server_status");
      this.lastHeartbeatAt = Date.now();
      this.isOnline = true;
      this.error = null;
      appState.addLog(
        "v4",
        "Server Status Payload",
        JSON.stringify(this.status, null, 2),
      );
      this.reconcileOptimisticLoads();
    } catch (e: any) {
      appState.addLog("error", "Failed to refresh server status", e.toString());
      this.isOnline = false;
      this.status = null;
      this.error = e.toString();
    }
  }

  async refreshVersion() {
    appState.addLog("v2", "Refreshing server version...");
    try {
      this.version = await invoke("get_version");
      appState.addLog(
        "v4",
        "Server Version Payload",
        JSON.stringify(this.version, null, 2),
      );
    } catch (e: any) {
      appState.addLog(
        "error",
        "Failed to refresh server version",
        e.toString(),
      );
      this.error = e.toString();
    }
  }

  async refreshMetrics() {
    appState.addLog("v2", "Refreshing server metrics...");
    try {
      this.metrics = await invoke("get_metrics");
      appState.addLog(
        "v4",
        "Server Metrics Payload",
        JSON.stringify(this.metrics, null, 2),
      );
    } catch (e: any) {
      appState.addLog(
        "error",
        "Failed to refresh server metrics",
        e.toString(),
      );
      this.error = e.toString();
    }
  }

  async refreshLocalModels(path?: string) {
    appState.addLog(
      "v2",
      "Refreshing local models...",
      path ? `Path: ${path}` : undefined,
    );
    try {
      this.localModels = await invoke("get_local_models", { path });
      appState.addLog(
        "v4",
        "Local Models Payload",
        JSON.stringify(this.localModels, null, 2),
      );
    } catch (e: any) {
      appState.addLog("error", "Failed to refresh local models", e.toString());
      this.error = e.toString();
    }
  }

  async refreshDownloads() {
    appState.addLog("v2", "Refreshing downloads list...");
    try {
      this.downloads = await invoke("list_downloads");
      appState.addLog(
        "v4",
        "Downloads List Payload",
        JSON.stringify(this.downloads, null, 2),
      );
    } catch (e: any) {
      appState.addLog("error", "Failed to refresh downloads", e.toString());
      this.error = e.toString();
    }
  }

  async startDownload(modelName: string, path?: string) {
    appState.addLog(
      "v1",
      `Starting download for model: ${modelName}`,
      path ? `Path: ${path}` : undefined,
    );
    try {
      const res = await invoke("start_download", {
        req: { model_name: modelName, path },
      });
      appState.addLog("info", `Download started: ${modelName}`);
      appState.addLog(
        "v4",
        "Start Download Response",
        JSON.stringify(res, null, 2),
      );
      await this.refreshDownloads();
      return res;
    } catch (e: any) {
      appState.addLog(
        "error",
        `Failed to start download: ${modelName}`,
        e.toString(),
      );
      this.error = e.toString();
      throw e;
    }
  }

  async cancelDownload(modelName: string) {
    appState.addLog("v1", `Canceling download for model: ${modelName}`);
    try {
      const res = await invoke("cancel_download", {
        req: { model_name: modelName },
      });
      appState.addLog("info", `Download canceled: ${modelName}`);
      appState.addLog(
        "v4",
        "Cancel Download Response",
        JSON.stringify(res, null, 2),
      );
      await this.refreshDownloads();
      return res;
    } catch (e: any) {
      appState.addLog(
        "error",
        `Failed to cancel download: ${modelName}`,
        e.toString(),
      );
      this.error = e.toString();
      throw e;
    }
  }

  async pauseDownload(modelName: string) {
    appState.addLog("v1", `Pausing download for model: ${modelName}`);
    try {
      const res = await invoke("pause_download", {
        req: { model_name: modelName },
      });
      appState.addLog("info", `Download paused: ${modelName}`);
      appState.addLog(
        "v4",
        "Pause Download Response",
        JSON.stringify(res, null, 2),
      );
      await this.refreshDownloads();
      return res;
    } catch (e: any) {
      appState.addLog(
        "error",
        `Failed to pause download: ${modelName}`,
        e.toString(),
      );
      this.error = e.toString();
      throw e;
    }
  }

  async resumeDownload(modelName: string) {
    appState.addLog("v1", `Resuming download for model: ${modelName}`);
    try {
      const res = await invoke("resume_download", {
        req: { model_name: modelName },
      });
      appState.addLog("info", `Download resumed: ${modelName}`);
      appState.addLog(
        "v4",
        "Resume Download Response",
        JSON.stringify(res, null, 2),
      );
      await this.refreshDownloads();
      return res;
    } catch (e: any) {
      appState.addLog(
        "error",
        `Failed to resume download: ${modelName}`,
        e.toString(),
      );
      this.error = e.toString();
      throw e;
    }
  }

  async updateModelConfig(modelPath: string, config: any) {
    appState.addLog("v1", `Updating model config: ${modelPath}`);
    try {
      await invoke("update_model_config", { modelPath, config });
      appState.addLog("info", `Model config updated: ${modelPath}`);
      await this.refreshLocalModels();
    } catch (e: any) {
      appState.addLog(
        "error",
        `Failed to update model config: ${modelPath}`,
        e.toString(),
      );
      this.error = e.toString();
      throw e;
    }
  }

  async deleteLocalModel(modelPath: string) {
    appState.addLog("v1", `Deleting local model: ${modelPath}`);
    try {
      await invoke("delete_local_model", { modelPath });
      appState.addLog("info", `Local model deleted: ${modelPath}`);
      await this.refreshLocalModels();
    } catch (e: any) {
      appState.addLog(
        "error",
        `Failed to delete local model: ${modelPath}`,
        e.toString(),
      );
      this.error = e.toString();
      throw e;
    }
  }

  /**
   * Optimistic model loading — adds the model to the UI instantly as
   * "loading", then after a deliberate delay sends the actual load
   * request to the server and reconciles via the heartbeat.
   *
   * Lifecycle:
   *  1. Model appears in "Loaded in Memory" section with amber "Loading" badge immediately (client-side only).
   *  2. After OPTIMISTIC_LOAD_DELAY_MS (3 s) the actual server request fires in the background.
   *  3. On invoke success → refreshStatus → reconcile → remove optimistic entry (server is authoritative).
   *  4. On invoke failure → mark as "failed" with red badge, auto-dismiss after FAILED_DISPLAY_MS (15 s).
   *  5. If the server never tracks the model within OPTIMISTIC_TIMEOUT_MS (90 s total) → silently revert to "unloaded".
   *  6. Heartbeat + refreshStatus both run reconcileOptimisticLoads() to clean up entries the server now owns.
   */
  async loadModel(req: any) {
    const modelName = req.model_name;

    // skip if already tracked optimistically
    if (this.optimisticLoads[modelName]) {
      appState.addLog(
        "warn",
        `Model "${modelName}" is already being loaded optimistically`,
      );
      return;
    }

    // 1. optimistic entry - ui shows "loading" instantly
    this.optimisticLoads[modelName] = {
      status: "loading",
      modelInfo: {
        name: modelName,
        type: req.model_type || "UNKNOWN",
        path: req.model_path || "",
      },
      addedAt: Date.now(),
    };

    this.clearOptimisticTimers(modelName);

    appState.addLog(
      "v1",
      `Loading model (optimistic, delaying server call by ${this.OPTIMISTIC_LOAD_DELAY_MS}ms)...`,
      JSON.stringify(req, null, 2),
    );

    // 2. delayed server call - wait OPTIMISTIC_LOAD_DELAY_MS before actually hitting the server
    const loadDelay = setTimeout(() => {
      this.executeLoad(modelName, req);
    }, this.OPTIMISTIC_LOAD_DELAY_MS);

    // 3. total timeout - if the server never picks up this model, revert silently
    const timeoutTimer = setTimeout(() => {
      const entry = this.optimisticLoads[modelName];
      if (entry && entry.status === "loading") {
        delete this.optimisticLoads[modelName];
        this.clearOptimisticTimers(modelName);
        appState.addLog(
          "warn",
          `Optimistic load timed out: ${modelName}, reverting to unloaded`,
        );
      }
    }, this.OPTIMISTIC_TIMEOUT_MS);

    this.optimisticTimers[modelName] = {
      loadDelay,
      timeout: timeoutTimer,
    };
  }

  /** Background execution of the load invoke. */
  private async executeLoad(modelName: string, req: any) {
    try {
      const res = await invoke("load_model", { req });
      appState.addLog("info", "Model load invoke completed");
      appState.addLog(
        "v4",
        "Load Model Response",
        JSON.stringify(res, null, 2),
      );
      await this.refreshStatus();
      // attempt reconciliation if server now owns it
      this.reconcileModel(modelName);
    } catch (e: any) {
      appState.addLog("error", "Model load failed", e.toString());
      const entry = this.optimisticLoads[modelName];
      if (entry) {
        entry.status = "failed";
        entry.error = e.toString();
        this.scheduleFailedDismiss(modelName);
      }
      this.error = e.toString();
    }
  }

  /**
   * Check a single optimistic entry against the current server status.
   * If the server now tracks the model → remove optimistic entry (server is authoritative).
   * If the server reports the model as failed → mark as failed + auto-dismiss.
   */
  private reconcileModel(modelName: string) {
    const entry = this.optimisticLoads[modelName];
    if (!entry || entry.status === "failed") return;

    const serverModel = (this.status?.models || []).find(
      (m: any) => m.model_name === modelName,
    );

    if (
      serverModel &&
      (serverModel.status === "loaded" || serverModel.status === "loading")
    ) {
      delete this.optimisticLoads[modelName];
      this.clearOptimisticTimers(modelName);
      appState.addLog("v2", `Optimistic load reconciled: ${modelName}`);
    } else if (
      serverModel &&
      (serverModel.status === "failed" || serverModel.status === "error")
    ) {
      entry.status = "failed";
      entry.error = "Model failed to load on server";
      this.scheduleFailedDismiss(modelName);
    }
  }

  /** Reconcile all optimistic entries against the latest server status. Called by heartbeat + refreshStatus. */
  reconcileOptimisticLoads() {
    for (const name of Object.keys(this.optimisticLoads)) {
      this.reconcileModel(name);
    }
  }

  /** Manually dismiss a failed optimistic entry (e.g. user clicks "Dismiss"). */
  dismissOptimisticLoad(modelName: string) {
    if (this.optimisticLoads[modelName]) {
      delete this.optimisticLoads[modelName];
      this.clearOptimisticTimers(modelName);
      appState.addLog("v2", `Dismissed optimistic load: ${modelName}`);
    }
  }

  /** Schedule auto-dismissal of a "failed" optimistic entry so it silently returns to the unloaded list. */
  private scheduleFailedDismiss(modelName: string) {
    const timers = this.optimisticTimers[modelName];
    if (timers && !timers.failedTimeout) {
      timers.failedTimeout = setTimeout(() => {
        if (this.optimisticLoads[modelName]?.status === "failed") {
          delete this.optimisticLoads[modelName];
          this.clearOptimisticTimers(modelName);
          appState.addLog(
            "v2",
            `Failed optimistic entry auto-dismissed: ${modelName}`,
          );
        }
      }, this.FAILED_DISPLAY_MS);
    }
  }

  /** Clean up all timers (load-delay + timeout + failed-dismiss) for a given model. */
  private clearOptimisticTimers(modelName: string) {
    const timers = this.optimisticTimers[modelName];
    if (timers) {
      clearTimeout(timers.loadDelay);
      clearTimeout(timers.timeout);
      if (timers.failedTimeout) clearTimeout(timers.failedTimeout);
      delete this.optimisticTimers[modelName];
    }
  }

  async unloadModel(req: any) {
    appState.addLog("v1", "Unloading model...", JSON.stringify(req, null, 2));
    try {
      const res = await invoke("unload_model", { req });
      appState.addLog("info", "Model unloaded successfully");
      appState.addLog(
        "v4",
        "Unload Model Response",
        JSON.stringify(res, null, 2),
      );
      await this.refreshStatus();
      return res;
    } catch (e: any) {
      appState.addLog("error", "Failed to unload model", e.toString());
      this.error = e.toString();
      throw e;
    }
  }
}

export const openarc = new OpenArcClient();
