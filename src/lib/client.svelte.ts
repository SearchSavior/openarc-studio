import { invoke } from '@tauri-apps/api/core';
import { appState } from "$lib/state.svelte.js";

export class OpenArcClient {
    status = $state<any>(null);
    version = $state<any>(null);
    metrics = $state<any>(null);
    downloads = $state<any>(null);
    localModels = $state<any>(null);
    error = $state<string | null>(null);
    loading = $state<boolean>(false);

    private pollInterval: ReturnType<typeof setInterval> | null = null;

    async configure(baseUrl: string, apiKey: string) {
        appState.addLog('v2', 'Configuring OpenArc client...', `Base URL: ${baseUrl}`);
        this.loading = true;
        this.error = null;
        try {
            await invoke('configure_client', { baseUrl, apiKey });
            appState.addLog('info', 'Client configured successfully');
            await this.refreshStatus();
            await this.refreshVersion();
            await this.refreshMetrics();
            await this.refreshLocalModels();
            await this.refreshDownloads();
            
            this.startPolling();
        } catch (e: any) {
            appState.addLog('error', 'Failed to configure client', e.toString());
            this.error = e.toString();
        } finally {
            this.loading = false;
        }
    }

    startPolling(intervalMs: number = 2000) {
        this.stopPolling();
        appState.addLog('info', `Starting client polling loop (${intervalMs}ms)`);
        this.pollInterval = setInterval(async () => {
            appState.addLog('v3', 'Executing client polling loop...');
            await this.refreshStatus();
            await this.refreshMetrics();
            await this.refreshDownloads();
            await this.refreshLocalModels();
        }, intervalMs);
    }

    stopPolling() {
        if (this.pollInterval) {
            appState.addLog('info', 'Stopping client polling loop');
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    async refreshStatus() {
        appState.addLog('v2', 'Refreshing server status...');
        try {
            this.status = await invoke('get_server_status');
            appState.addLog('v4', 'Server Status Payload', JSON.stringify(this.status, null, 2));
        } catch (e: any) {
            appState.addLog('error', 'Failed to refresh server status', e.toString());
            this.error = e.toString();
        }
    }

    async refreshVersion() {
        appState.addLog('v2', 'Refreshing server version...');
        try {
            this.version = await invoke('get_version');
            appState.addLog('v4', 'Server Version Payload', JSON.stringify(this.version, null, 2));
        } catch (e: any) {
            appState.addLog('error', 'Failed to refresh server version', e.toString());
            this.error = e.toString();
        }
    }

    async refreshMetrics() {
        appState.addLog('v2', 'Refreshing server metrics...');
        try {
            this.metrics = await invoke('get_metrics');
            appState.addLog('v4', 'Server Metrics Payload', JSON.stringify(this.metrics, null, 2));
        } catch (e: any) {
            appState.addLog('error', 'Failed to refresh server metrics', e.toString());
            this.error = e.toString();
        }
    }

    async refreshLocalModels(path?: string) {
        appState.addLog('v2', 'Refreshing local models...', path ? `Path: ${path}` : undefined);
        try {
            this.localModels = await invoke('get_local_models', { path });
            appState.addLog('v4', 'Local Models Payload', JSON.stringify(this.localModels, null, 2));
        } catch (e: any) {
            appState.addLog('error', 'Failed to refresh local models', e.toString());
            this.error = e.toString();
        }
    }

    async refreshDownloads() {
        appState.addLog('v2', 'Refreshing downloads list...');
        try {
            this.downloads = await invoke('list_downloads');
            appState.addLog('v4', 'Downloads List Payload', JSON.stringify(this.downloads, null, 2));
        } catch (e: any) {
            appState.addLog('error', 'Failed to refresh downloads', e.toString());
            this.error = e.toString();
        }
    }

    async startDownload(modelName: string, path?: string) {
        appState.addLog('v1', `Starting download for model: ${modelName}`, path ? `Path: ${path}` : undefined);
        try {
            const res = await invoke('start_download', { req: { model_name: modelName, path } });
            appState.addLog('info', `Download started: ${modelName}`);
            appState.addLog('v4', 'Start Download Response', JSON.stringify(res, null, 2));
            await this.refreshDownloads();
            return res;
        } catch (e: any) {
            appState.addLog('error', `Failed to start download: ${modelName}`, e.toString());
            this.error = e.toString();
            throw e;
        }
    }

    async cancelDownload(modelName: string) {
        appState.addLog('v1', `Canceling download for model: ${modelName}`);
        try {
            const res = await invoke('cancel_download', { req: { model_name: modelName } });
            appState.addLog('info', `Download canceled: ${modelName}`);
            appState.addLog('v4', 'Cancel Download Response', JSON.stringify(res, null, 2));
            await this.refreshDownloads();
            return res;
        } catch (e: any) {
            appState.addLog('error', `Failed to cancel download: ${modelName}`, e.toString());
            this.error = e.toString();
            throw e;
        }
    }

    async pauseDownload(modelName: string) {
        appState.addLog('v1', `Pausing download for model: ${modelName}`);
        try {
            const res = await invoke('pause_download', { req: { model_name: modelName } });
            appState.addLog('info', `Download paused: ${modelName}`);
            appState.addLog('v4', 'Pause Download Response', JSON.stringify(res, null, 2));
            await this.refreshDownloads();
            return res;
        } catch (e: any) {
            appState.addLog('error', `Failed to pause download: ${modelName}`, e.toString());
            this.error = e.toString();
            throw e;
        }
    }

    async resumeDownload(modelName: string) {
        appState.addLog('v1', `Resuming download for model: ${modelName}`);
        try {
            const res = await invoke('resume_download', { req: { model_name: modelName } });
            appState.addLog('info', `Download resumed: ${modelName}`);
            appState.addLog('v4', 'Resume Download Response', JSON.stringify(res, null, 2));
            await this.refreshDownloads();
            return res;
        } catch (e: any) {
            appState.addLog('error', `Failed to resume download: ${modelName}`, e.toString());
            this.error = e.toString();
            throw e;
        }
    }

    async updateModelConfig(modelPath: string, config: any) {
        appState.addLog('v1', `Updating model config: ${modelPath}`);
        try {
            await invoke('update_model_config', { modelPath, config });
            appState.addLog('info', `Model config updated: ${modelPath}`);
            await this.refreshLocalModels();
        } catch (e: any) {
            appState.addLog('error', `Failed to update model config: ${modelPath}`, e.toString());
            this.error = e.toString();
            throw e;
        }
    }

    async deleteLocalModel(modelPath: string) {
        appState.addLog('v1', `Deleting local model: ${modelPath}`);
        try {
            await invoke('delete_local_model', { modelPath });
            appState.addLog('info', `Local model deleted: ${modelPath}`);
            await this.refreshLocalModels();
        } catch (e: any) {
            appState.addLog('error', `Failed to delete local model: ${modelPath}`, e.toString());
            this.error = e.toString();
            throw e;
        }
    }

    async loadModel(req: any) {
        appState.addLog('v1', 'Loading model...', JSON.stringify(req, null, 2));
        try {
            const res = await invoke('load_model', { req });
            appState.addLog('info', 'Model loaded successfully');
            appState.addLog('v4', 'Load Model Response', JSON.stringify(res, null, 2));
            await this.refreshStatus();
            return res;
        } catch (e: any) {
            appState.addLog('error', 'Failed to load model', e.toString());
            this.error = e.toString();
            throw e;
        }
    }

    async unloadModel(req: any) {
        appState.addLog('v1', 'Unloading model...', JSON.stringify(req, null, 2));
        try {
            const res = await invoke('unload_model', { req });
            appState.addLog('info', 'Model unloaded successfully');
            appState.addLog('v4', 'Unload Model Response', JSON.stringify(res, null, 2));
            await this.refreshStatus();
            return res;
        } catch (e: any) {
            appState.addLog('error', 'Failed to unload model', e.toString());
            this.error = e.toString();
            throw e;
        }
    }
}

export const openarc = new OpenArcClient();
