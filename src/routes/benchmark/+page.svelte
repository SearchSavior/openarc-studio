<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { invoke } from '@tauri-apps/api/core';
    import { Play, Loader2, Server, Box, Zap, Clock, Activity, AlertCircle, Plus, Trash2, CheckCircle2, XCircle, ArrowRight, Download, Eye, ChevronsUpDown, Check, Gauge, History, Sliders, Layers, FlaskConical, BarChart3 } from '@lucide/svelte';

    import * as Card from '$lib/components/ui/card';
    import { Button } from '$lib/components/ui/button';
    import { Label } from '$lib/components/ui/label';
    import * as Select from '$lib/components/ui/select';
    import { Slider } from '$lib/components/ui/slider';
    import { ScrollArea } from '$lib/components/ui/scroll-area';
    import { Switch } from '$lib/components/ui/switch';
    import * as Dialog from '$lib/components/ui/dialog';
    import * as Table from '$lib/components/ui/table';
    import * as Popover from '$lib/components/ui/popover';
    import * as Command from '$lib/components/ui/command';
    import { appState } from '$lib/state.svelte.js';
    import { openarc } from '$lib/client.svelte.js';
    import { cn } from '$lib/utils.js';
    import { getArchAccent, getArchColor, resolveModelType, detectModelType } from '$lib/model-types';

    import { Input } from '$lib/components/ui/input';

    let promptPower = $state([7]); // 128
    let maxPower = $state([7]); // 128
    let temperature = $state([0.7]);
    let topP = $state([0.9]);
    let iterations = $state([1]);

    let isRunningQueue = $state(false);
    let queueIndex = $state(0);

    let selectedHistoryItem = $state<HistoryItem | null>(null);
    let isHistoryDialogOpen = $state(false);

    let loadedModels = $derived((openarc.status?.models || []).filter((m: any) => m.model_type === 'llm' || m.model_type === 'vlm'));
    let localModels = $derived((openarc.localModels?.models || []).filter((m: any) => m.model_type === 'LLM' || m.model_type === 'VLM'));
    let serverVersion = $derived(openarc.version?.version || "Unknown");

    type RunMetric = { pp: number; tg: number; time: number; };

    type QueueItem = {
        id: string;
        modelPath: string;
        modelName: string;
        modelType: string;
        engine: string;
        device: string;
        loadBefore: boolean;
        unloadAfter: boolean;
        status: 'idle' | 'loading' | 'benchmarking' | 'unloading' | 'completed' | 'error';
        result?: {
            avg_pp: number;
            avg_tg: number;
            avg_time: number;
            runs: RunMetric[];
        };
        error?: string;
    };

    let queue = $state<QueueItem[]>([]);

    type HistoryItem = {
        id: string;
        modelName: string;
        version: string;
        avg_pp: number;
        avg_tg: number;
        date: Date;
        runs: RunMetric[];
    };

    let history = $state<HistoryItem[]>([]);

    let selectedLocalModelPath = $state("");
    let addLoadBefore = $state(true);
    let addUnloadAfter = $state(true);
    let addDeviceMode = $state("AUTO");
    let customDevice = $state("");
    let isHeteroDialogOpen = $state(false);
    let heteroSelectedDevices = $state<string[]>([]);

    let modelComboboxOpen = $state(false);

    let heteroDeviceString = $derived(
        heteroSelectedDevices.length > 0
            ? `HETERO:${heteroSelectedDevices.join(',')}`
            : "HETERO:CPU"
    );

    let availableDevices = $derived.by(() => {
        const devices = [
            { value: "AUTO", label: "AUTO" },
            { value: "CPU", label: "CPU" }
        ];
        if (openarc.metrics?.gpus && openarc.metrics.gpus.length > 0) {
            openarc.metrics.gpus.forEach((gpu: any, i: number) => {
                devices.push({ value: `GPU.${i}`, label: `GPU.${i} (${gpu.name})` });
            });
        } else {
            devices.push({ value: "GPU", label: "GPU" });
        }
        if (openarc.metrics?.npus && openarc.metrics.npus.length > 0) {
            openarc.metrics.npus.forEach((npu: any, i: number) => {
                devices.push({ value: `NPU.${i}`, label: `NPU.${i} (${npu.name})` });
            });
        } else {
            devices.push({ value: "NPU", label: "NPU" });
        }
        devices.push({ value: "HETERO", label: "HETERO" });
        devices.push({ value: "CUSTOM", label: "CUSTOM" });
        return devices;
    });

    function getQueueItemAccent(item: QueueItem) {
        return getArchAccent(item.modelType);
    }

    function getHistoryAccent(item: HistoryItem) {
        const inferred = resolveModelType(detectModelType(item.modelName)) ?? resolveModelType('llm')!;
        return getArchAccent(inferred.label);
    }

    onMount(async () => {
        try {
            const stored = localStorage.getItem('openarc_benchmark_history');
            if (stored) {
                const parsed = JSON.parse(stored);
                history = parsed.map((item: any) => ({
                    ...item,
                    date: new Date(item.date)
                }));
            }
        } catch (e) {
            console.error("Failed to parse history from local storage", e);
        }

        await openarc.refreshStatus();
        await openarc.refreshLocalModels();
        await openarc.refreshVersion();
        await openarc.refreshMetrics();
    });

    function saveHistory() {
        try {
            localStorage.setItem('openarc_benchmark_history', JSON.stringify(history));
        } catch (e) {
            console.error("Failed to save history to local storage", e);
        }
    }

    $effect(() => {
        if (localModels.length > 0 && !selectedLocalModelPath) {
            selectedLocalModelPath = localModels[0].path;
        }
    });

    function addToQueue() {
        const model = localModels.find((m: any) => m.path === selectedLocalModelPath);
        if (!model) return;

        let finalDevice = addDeviceMode;
        if (addDeviceMode === "CUSTOM") {
            finalDevice = customDevice;
        } else if (addDeviceMode === "HETERO") {
            finalDevice = heteroDeviceString;
        }

        queue.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            modelPath: model.path,
            modelName: model.model_name || "Unknown Model",
            modelType: model.model_type || "LLM",
            engine: model.engine || "ovgenai",
            device: finalDevice || "AUTO",
            loadBefore: addLoadBefore,
            unloadAfter: addUnloadAfter,
            status: 'idle'
        });
    }

    function removeFromQueue(id: string) {
        if (isRunningQueue) return;
        queue = queue.filter(item => item.id !== id);
    }

    function viewHistoryDetails(item: HistoryItem) {
        selectedHistoryItem = item;
        isHistoryDialogOpen = true;
    }

    function clearHistory() {
        history = [];
        saveHistory();
        appState.addLog('info', 'Cleared benchmark history');
    }

    function exportToCsv() {
        if (history.length === 0) return;
        const headers = ['Model', 'Date', 'Time', 'Avg PP (t/s)', 'Avg TG (t/s)', 'Iterations'];
        const rows = history.map(h => [
            `"${h.modelName}"`,
            h.date.toLocaleDateString(),
            h.date.toLocaleTimeString(),
            h.avg_pp.toFixed(2),
            h.avg_tg.toFixed(2),
            h.runs.length
        ]);
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `openarc_benchmark_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        appState.addLog('info', 'Exported benchmark history to CSV');
    }

    async function runQueue() {
        if (queue.length === 0 || isRunningQueue) return;

        appState.addLog('v1', `Starting benchmark queue with ${queue.length} items`);
        isRunningQueue = true;

        queue.forEach(item => {
            if (item.status === 'error' || item.status === 'completed') {
                item.status = 'idle';
                item.result = undefined;
                item.error = undefined;
            }
        });

        for (let i = 0; i < queue.length; i++) {
            queueIndex = i;
            let item = queue[i];
            appState.addLog('v2', `Processing queue item ${i + 1}/${queue.length}: ${item.modelName}`);
            item.status = 'loading';

            try {
                // load model if need
                if (item.loadBefore) {
                    const isAlreadyLoaded = openarc.status?.models?.find((m: any) => m.model_name === item.modelName && m.status === 'loaded');
                    if (!isAlreadyLoaded) {
                        appState.addLog('v3', `Queue: Loading model ${item.modelName} into VRAM...`);
                        const loadReq = {
                            model_path: item.modelPath,
                            model_name: item.modelName,
                            model_type: item.modelType.toLowerCase(),
                            engine: item.engine.toLowerCase(),
                            device: item.device,
                            runtime_config: {}
                        };
                        try {
                            await invoke("load_model", { req: loadReq });
                        } catch (e: any) {
                            appState.addLog('warn', `Warning from load_model invoke for ${item.modelName}`, e.toString());
                            console.error("Error from load_model invoke:", e);
                        }
                    } else {
                        appState.addLog('v3', `Queue: Model ${item.modelName} already loaded, skipping load step.`);
                    }

                    let isLoaded = false;
                    for (let pollCount = 0; pollCount < 300; pollCount++) { // max 5 min
                        await openarc.refreshStatus();
                        const mStatus = openarc.status?.models?.find((m: any) => m.model_name === item.modelName);
                        if (mStatus) {
                            if (mStatus.status === 'loaded') {
                                isLoaded = true;
                                appState.addLog('v3', `Queue: Model ${item.modelName} successfully loaded into VRAM.`);
                                break;
                            } else if (mStatus.status === 'failed') {
                                throw new Error(mStatus.error_message || "Model failed to load");
                            }
                        }
                        await new Promise(r => setTimeout(r, 1000));
                    }

                    if (!isLoaded) {
                        throw new Error("Timeout waiting for model to load (5 minutes)");
                    }
                }

                // run benchmark
                item.status = 'benchmarking';
                const currentPromptTokens = Math.pow(2, promptPower[0]);
                const currentMaxTokens = Math.pow(2, maxPower[0]);
                const numIterations = iterations[0];

                appState.addLog('v2', `Starting benchmark for ${item.modelName}`, `Prompt: ${currentPromptTokens}, Max: ${currentMaxTokens}, Iterations: ${numIterations}`);

                const input_ids = Array.from({ length: currentPromptTokens }, (_, idx) => idx + 1);
                const benchReq = {
                    model: item.modelName,
                    input_ids,
                    max_tokens: currentMaxTokens,
                    temperature: temperature[0],
                    top_p: topP[0],
                    top_k: 50,
                    repetition_penalty: 1.1
                };

                let runs: RunMetric[] = [];
                let total_pp = 0;
                let total_tg = 0;
                let total_time = 0;

                for (let iter = 0; iter < numIterations; iter++) {
                    appState.addLog('v3', `Running iteration ${iter + 1}/${numIterations} for ${item.modelName}...`);
                    const res: any = await invoke("benchmark_model", { req: benchReq });

                    const tg = res.metrics.decode_throughput || 0;
                    const pp = res.metrics.prefill_throughput || 0;
                    const time_taken = res.metrics.decode_duration || 0;

                    runs.push({ pp, tg, time: time_taken });
                    total_pp += pp;
                    total_tg += tg;
                    total_time += time_taken;
                }

                const avg_pp = total_pp / numIterations;
                const avg_tg = total_tg / numIterations;
                const avg_time = total_time / numIterations;

                appState.addLog('info', `Benchmark completed for ${item.modelName}`, `Avg PP: ${avg_pp.toFixed(2)}, Avg TG: ${avg_tg.toFixed(2)}`);

                item.result = {
                    avg_pp,
                    avg_tg,
                    avg_time,
                    runs
                };

                history = [{
                    id: Date.now().toString(),
                    modelName: item.modelName,
                    version: serverVersion,
                    avg_pp,
                    avg_tg,
                    date: new Date(),
                    runs
                }, ...history];
                saveHistory();

                item.status = 'completed';

            } catch (e: any) {
                item.status = 'error';
                item.error = e.toString();
                appState.addLog('error', `Benchmark queue failed for ${item.modelName}`, e.toString());
                console.error(`Benchmark failed for ${item.modelName}`, e);
            } finally {
                // unload model if need even if fail
                if (item.unloadAfter) {
                    appState.addLog('v3', `Queue: Unloading model ${item.modelName}...`);
                    const currentStatus = item.status;
                    item.status = 'unloading';
                    try {
                        await invoke("unload_model", { req: { model_name: item.modelName } });
                    } catch(err: any) {
                        appState.addLog('error', `Failed to invoke unload_model for ${item.modelName}`, err.toString());
                        console.error(`Failed to invoke unload_model for ${item.modelName}:`, err);
                    }

                    let isUnloaded = false;
                    for (let pollCount = 0; pollCount < 60; pollCount++) { // 60 secs max
                        await openarc.refreshStatus();
                        const mStatus = openarc.status?.models?.find((m: any) => m.model_name === item.modelName);
                        if (!mStatus) {
                            isUnloaded = true;
                            appState.addLog('v3', `Queue: Model ${item.modelName} successfully unloaded.`);
                            break;
                        }
                        await new Promise(r => setTimeout(r, 1000));
                    }
                    if (!isUnloaded) {
                        appState.addLog('warn', `Timeout waiting for model ${item.modelName} to unload`);
                        console.error(`Timeout waiting for model ${item.modelName} to unload`);
                    }

                    item.status = currentStatus;
                }
            }
        }

        appState.addLog('v1', 'Benchmark queue finished');
        isRunningQueue = false;
        queueIndex = -1;
    }
</script>

<div class="flex h-full w-full overflow-hidden bg-background">
    {#if appState.leftPanelOpen}
    <aside class="w-[450px] shrink-0 border-r bg-muted/10 flex flex-col h-full overflow-hidden transition-all duration-200">
        <div class="shrink-0 px-4 pt-4 pb-3 border-b bg-gradient-to-b from-muted/30 to-transparent">
            <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <History class="w-4 h-4 text-primary" />
                </div>
                <div class="min-w-0 flex-1">
                    <div class="font-bold text-sm tracking-tight leading-tight">Previous runs</div>
                    <div class="text-[11px] text-muted-foreground leading-tight mt-0.5">
                        {history.length} benchmark{history.length !== 1 ? 's' : ''} recorded
                    </div>
                </div>
            </div>
        </div>

        <div class="shrink-0 px-4 py-2.5 border-b flex items-center gap-2">
            <div class="h-[2px] w-3 rounded-full bg-primary/60"></div>
            <span class="text-[10px] font-bold uppercase tracking-widest text-foreground/80">History</span>
            <span class="ml-auto text-[10px] text-muted-foreground tabular-nums">{history.length}</span>
        </div>

        <ScrollArea class="flex-1 min-h-0">
            {#if history.length === 0}
                <div class="flex flex-col items-center justify-center text-center p-8 mt-8">
                    <div class="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center mb-4">
                        <BarChart3 class="w-7 h-7 text-primary/40" />
                    </div>
                    <p class="text-sm font-semibold text-foreground">No benchmarks yet</p>
                    <p class="text-[11px] mt-1.5 max-w-[240px] text-muted-foreground leading-relaxed">
                        Completed runs will appear here with their average throughput metrics.
                    </p>
                </div>
            {:else}
                <div class="p-3 space-y-1.5">
                    {#each history as item}
                        {@const accent = getHistoryAccent(item)}
                        <button
                            class="group w-full flex items-stretch gap-2.5 p-2.5 rounded-lg border border-transparent bg-transparent hover:bg-muted/40 hover:border-border transition-all text-left"
                            onclick={() => viewHistoryDetails(item)}
                        >
                            <div class="w-1 self-stretch rounded-full {accent}"></div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-start justify-between gap-2">
                                    <div class="text-sm font-semibold truncate" title={item.modelName}>{item.modelName}</div>
                                    <Eye class="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0 mt-0.5" />
                                </div>
                                <div class="text-[10.5px] text-muted-foreground mt-0.5">
                                    {item.date.toLocaleDateString()} {item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {item.runs.length} run{item.runs.length !== 1 ? 's' : ''}
                                </div>
                                <div class="flex items-center gap-1.5 mt-2 flex-wrap">
                                    <span class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border">
                                        <Zap class="w-3 h-3 text-amber-500" />
                                        <span class="tabular-nums">{item.avg_pp.toFixed(1)}</span>
                                        <span class="text-muted-foreground">PP</span>
                                    </span>
                                    <span class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border">
                                        <Gauge class="w-3 h-3 text-primary" />
                                        <span class="tabular-nums font-semibold">{item.avg_tg.toFixed(1)}</span>
                                        <span class="text-muted-foreground">TG</span>
                                    </span>
                                </div>
                            </div>
                        </button>
                    {/each}
                </div>
            {/if}
        </ScrollArea>

        {#if history.length > 0}
            <div class="shrink-0 p-3 border-t flex gap-2 bg-background/50">
                <Button variant="outline" size="sm" class="flex-1 text-xs h-8" onclick={exportToCsv}>
                    <Download class="w-3.5 h-3.5 mr-1.5" /> Export CSV
                </Button>
                <Button variant="outline" size="sm" class="flex-1 text-xs h-8 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40" onclick={clearHistory}>
                    <Trash2 class="w-3.5 h-3.5 mr-1.5" /> Clear
                </Button>
            </div>
        {/if}
    </aside>
    {/if}

    <main class="flex-1 h-full flex flex-col min-w-0 bg-background overflow-hidden">
        <header class="shrink-0 flex items-center justify-between px-6 py-4 border-b bg-gradient-to-b from-muted/20 to-background">
            <div class="flex items-center gap-3 min-w-0">
                <div class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Activity class="w-4 h-4 text-primary" />
                </div>
                <div class="min-w-0">
                    <h1 class="text-base font-bold tracking-tight leading-tight">Benchmark runner</h1>
                    <p class="text-xs text-muted-foreground leading-tight mt-0.5">
                        Queue models and measure prefill / decode throughput
                    </p>
                </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
                <span class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border">
                    <Layers class="w-3 h-3 text-muted-foreground" />
                    <span class="tabular-nums">{queue.length}</span>
                    <span class="text-muted-foreground">queued</span>
                </span>
                <span class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border">
                    <Server class="w-3 h-3 text-muted-foreground" />
                    <span class="text-muted-foreground">v</span>
                    <span class="tabular-nums">{serverVersion}</span>
                </span>
            </div>
        </header>

        <ScrollArea class="flex-1 min-h-0">
            <div class="max-w-3xl w-full mx-auto p-6 space-y-6">
                <!-- Generation parameters -->
                <section>
                    <div class="flex items-center gap-2 px-1 pb-2.5">
                        <div class="h-[2px] w-3 rounded-full bg-primary/60"></div>
                        <span class="text-[10px] font-bold uppercase tracking-widest text-foreground/80">Generation parameters</span>
                        <span class="ml-auto text-[10px] text-muted-foreground">Applied to every run</span>
                    </div>

                    <div class="rounded-xl border bg-card overflow-hidden">
                        <div class="flex items-center gap-3 px-4 py-3 border-b bg-gradient-to-b from-muted/20 to-background">
                            <div class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                <Sliders class="w-4 h-4 text-primary" />
                            </div>
                            <div class="min-w-0">
                                <div class="text-sm font-semibold tracking-tight">Inference knobs</div>
                                <div class="text-[10.5px] text-muted-foreground mt-0.5">Shared across the entire queue</div>
                            </div>
                        </div>

                        <div class="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div class="space-y-2.5">
                                <div class="flex justify-between items-center">
                                    <Label class="text-xs font-semibold">Prompt length</Label>
                                    <span class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-0.5 rounded-md border tabular-nums">
                                        {Math.pow(2, promptPower[0])} tok
                                    </span>
                                </div>
                                <Slider type="multiple" bind:value={promptPower} max={14} min={6} step={1} disabled={isRunningQueue} />
                                <p class="text-[10.5px] text-muted-foreground leading-relaxed">Context length for the pre-fill phase.</p>
                            </div>

                            <div class="space-y-2.5">
                                <div class="flex justify-between items-center">
                                    <Label class="text-xs font-semibold">Generation length</Label>
                                    <span class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-0.5 rounded-md border tabular-nums">
                                        {Math.pow(2, maxPower[0])} tok
                                    </span>
                                </div>
                                <Slider type="multiple" bind:value={maxPower} max={14} min={6} step={1} disabled={isRunningQueue} />
                                <p class="text-[10.5px] text-muted-foreground leading-relaxed">Tokens to produce during decode.</p>
                            </div>

                            <div class="space-y-2.5">
                                <div class="flex justify-between items-center">
                                    <Label class="text-xs font-semibold">Iterations</Label>
                                    <span class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-0.5 rounded-md border tabular-nums">
                                        {iterations[0]}x
                                    </span>
                                </div>
                                <Slider type="multiple" bind:value={iterations} max={10} min={1} step={1} disabled={isRunningQueue} />
                                <p class="text-[10.5px] text-muted-foreground leading-relaxed">Repeats per queue item, metrics averaged.</p>
                            </div>

                            <div class="space-y-2.5">
                                <div class="flex justify-between items-center">
                                    <Label class="text-xs font-semibold">Temperature</Label>
                                    <span class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-0.5 rounded-md border tabular-nums">
                                        {temperature[0]}
                                    </span>
                                </div>
                                <Slider type="multiple" bind:value={temperature} max={2} min={0} step={0.1} disabled={isRunningQueue} />
                                <p class="text-[10.5px] text-muted-foreground leading-relaxed">Sampling temperature, 0 = deterministic.</p>
                            </div>
                        </div>

                        <div class="border-t bg-muted/10 p-4">
                            <Button
                                class="w-full gap-2"
                                size="lg"
                                onclick={runQueue}
                                disabled={isRunningQueue || queue.length === 0}
                            >
                                {#if isRunningQueue}
                                    <Loader2 class="w-5 h-5 animate-spin" />
                                    Running queue ({queueIndex + 1} of {queue.length})
                                {:else}
                                    <Play class="w-5 h-5 fill-current" />
                                    {queue.length === 0 ? 'Queue is empty' : `Run queue (${queue.length} model${queue.length !== 1 ? 's' : ''})`}
                                {/if}
                            </Button>
                        </div>
                    </div>
                </section>

                <!-- Active run surface -->
                {#if isRunningQueue && queue[queueIndex]}
                    {@const activeItem = queue[queueIndex]}
                    {@const accent = getQueueItemAccent(activeItem)}
                    <section>
                        <div class="flex items-center gap-2 px-1 pb-2.5">
                            <div class="h-[2px] w-3 rounded-full bg-amber-500"></div>
                            <span class="text-[10px] font-bold uppercase tracking-widest text-foreground/80">Live</span>
                            <span class="ml-auto inline-flex items-center gap-1.5 text-[10px] text-amber-500 font-semibold">
                                <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                In progress
                            </span>
                        </div>

                        <div class="rounded-xl border border-primary/50 bg-muted/40 shadow-sm ring-1 ring-primary/20 overflow-hidden">
                            <div class="flex items-stretch gap-4 p-5">
                                <div class="w-1 self-stretch rounded-full {accent}"></div>
                                <div class="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                    {#if activeItem.status === 'loading'}
                                        <Loader2 class="w-6 h-6 text-primary animate-spin" />
                                    {:else if activeItem.status === 'benchmarking'}
                                        <Zap class="w-6 h-6 text-primary animate-pulse" />
                                    {:else if activeItem.status === 'unloading'}
                                        <ArrowRight class="w-6 h-6 text-primary" />
                                    {:else}
                                        <Loader2 class="w-6 h-6 text-primary animate-spin" />
                                    {/if}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="text-sm font-semibold tracking-tight truncate">{activeItem.modelName}</div>
                                    <div class="text-[11px] uppercase tracking-widest text-primary font-semibold mt-1">
                                        {activeItem.status === 'loading' ? 'Loading model into VRAM' :
                                         activeItem.status === 'benchmarking' ? 'Running benchmark' :
                                         activeItem.status === 'unloading' ? 'Unloading model' : 'Processing'}
                                    </div>
                                    <div class="flex items-center gap-1.5 mt-2.5 flex-wrap">
                                        <span class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border">
                                            <Box class="w-3 h-3 text-muted-foreground" />
                                            <span class="uppercase tracking-wide">{activeItem.modelType}</span>
                                        </span>
                                        <span class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border">
                                            <Server class="w-3 h-3 text-muted-foreground" />
                                            <span class="font-mono truncate max-w-[180px]">{activeItem.device}</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                {/if}

                <!-- Tips / empty-state when no queue and idle -->
                {#if queue.length === 0 && !isRunningQueue}
                    <section>
                        <div class="rounded-xl border border-dashed bg-muted/10 p-8 flex flex-col items-center text-center">
                            <div class="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center mb-4">
                                <FlaskConical class="w-7 h-7 text-primary/40" />
                            </div>
                            <p class="text-sm font-semibold text-foreground">Queue is empty</p>
                            <p class="text-xs mt-1.5 max-w-sm text-muted-foreground leading-relaxed">
                                Use the queue panel on the right to pick a local LLM or VLM, choose a device, and enqueue it.
                                Adjust the parameters above and hit run.
                            </p>
                        </div>
                    </section>
                {/if}
            </div>
        </ScrollArea>
    </main>

    {#if appState.rightPanelOpen}
    <aside class="w-[450px] shrink-0 border-l bg-muted/10 flex flex-col h-full overflow-hidden transition-all duration-200">
        <div class="shrink-0 px-4 pt-4 pb-3 border-b bg-gradient-to-b from-muted/30 to-transparent">
            <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Layers class="w-4 h-4 text-primary" />
                </div>
                <div class="min-w-0 flex-1">
                    <div class="font-bold text-sm tracking-tight leading-tight">Benchmark queue</div>
                    <div class="text-[11px] text-muted-foreground leading-tight mt-0.5">
                        {queue.length} model{queue.length !== 1 ? 's' : ''} ready to run
                    </div>
                </div>
            </div>
        </div>

        <!-- Add to queue section -->
        <div class="shrink-0 border-b bg-background/60">
            <div class="px-4 py-2.5 flex items-center gap-2">
                <div class="h-[2px] w-3 rounded-full bg-primary/60"></div>
                <span class="text-[10px] font-bold uppercase tracking-widest text-foreground/80">Add to queue</span>
            </div>

            <div class="px-4 pb-4 space-y-3">
                <div class="space-y-1.5">
                    <Label class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Local model</Label>
                    <Popover.Root bind:open={modelComboboxOpen}>
                        <Popover.Trigger>
                            {#snippet child({ props })}
                                <Button
                                    {...props}
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={modelComboboxOpen}
                                    class="w-full h-9 text-xs justify-between bg-background"
                                    disabled={localModels.length === 0 || isRunningQueue}
                                >
                                    {#if selectedLocalModelPath}
                                        {@const m = localModels.find((x:any) => x.path === selectedLocalModelPath)}
                                        <span class="truncate">{m?.model_name || "Select model"}</span>
                                    {:else}
                                        <span class="text-muted-foreground">No local models found</span>
                                    {/if}
                                    <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            {/snippet}
                        </Popover.Trigger>
                        <Popover.Content class="w-[418px] p-0" side="bottom" align="start">
                            <Command.Root>
                                <Command.Input placeholder="Search local models..." class="text-xs" />
                                <Command.List>
                                    <Command.Empty>No model found.</Command.Empty>
                                    <Command.Group>
                                        {#each localModels as model}
                                            <Command.Item
                                                value={model.model_name}
                                                onSelect={() => {
                                                    selectedLocalModelPath = model.path;
                                                    modelComboboxOpen = false;
                                                }}
                                                class="text-xs cursor-pointer"
                                            >
                                                <Check
                                                    class={cn(
                                                        "mr-2 h-4 w-4",
                                                        selectedLocalModelPath === model.path ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                <div class="w-1 self-stretch rounded-full mr-2 {getArchAccent(model.model_type)}" style="height:14px"></div>
                                                <span class="truncate">{model.model_name}</span>
                                            </Command.Item>
                                        {/each}
                                    </Command.Group>
                                </Command.List>
                            </Command.Root>
                        </Popover.Content>
                    </Popover.Root>
                </div>

                <div class="space-y-1.5">
                    <Label class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Device</Label>
                    <div class="flex gap-2">
                        <Select.Root type="single" bind:value={addDeviceMode} disabled={isRunningQueue}>
                            <Select.Trigger class="h-9 text-xs flex-1 bg-background">
                                {#if addDeviceMode}
                                    {@const activeDevice = availableDevices.find((d:any) => d.value === addDeviceMode)}
                                    <span class="truncate">{activeDevice?.label || addDeviceMode}</span>
                                {:else}
                                    Select Device
                                {/if}
                            </Select.Trigger>
                            <Select.Content>
                                {#each availableDevices as dev}
                                    <Select.Item value={dev.value} label={dev.label}>{dev.label}</Select.Item>
                                {/each}
                            </Select.Content>
                        </Select.Root>

                        {#if addDeviceMode === "CUSTOM"}
                            <Input
                                bind:value={customDevice}
                                placeholder="e.g. GPU.1"
                                class="h-9 text-xs flex-1 bg-background"
                                disabled={isRunningQueue}
                            />
                        {:else if addDeviceMode === "HETERO"}
                            <div class="flex gap-2 flex-1">
                                <Input
                                    value={heteroDeviceString}
                                    readonly
                                    class="h-9 text-xs flex-1 min-w-[120px] bg-muted/40 font-mono"
                                    disabled={isRunningQueue}
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    class="h-9 text-xs px-2.5"
                                    onclick={() => isHeteroDialogOpen = true}
                                    disabled={isRunningQueue}
                                >
                                    Config
                                </Button>
                            </div>
                        {/if}
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <label class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border bg-background cursor-pointer">
                        <span class="text-[11px] font-medium">Load before</span>
                        <Switch bind:checked={addLoadBefore} disabled={isRunningQueue} />
                    </label>
                    <label class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border bg-background cursor-pointer">
                        <span class="text-[11px] font-medium">Unload after</span>
                        <Switch bind:checked={addUnloadAfter} disabled={isRunningQueue} />
                    </label>
                </div>

                <Button
                    class="w-full h-9 text-xs gap-1.5"
                    onclick={addToQueue}
                    disabled={!selectedLocalModelPath || isRunningQueue || (addDeviceMode === 'CUSTOM' && !customDevice) || (addDeviceMode === 'HETERO' && heteroSelectedDevices.length === 0)}
                >
                    <Plus class="w-3.5 h-3.5" /> Enqueue model
                </Button>
            </div>
        </div>

        <div class="shrink-0 px-4 py-2.5 border-b flex items-center gap-2">
            <div class="h-[2px] w-3 rounded-full bg-primary/60"></div>
            <span class="text-[10px] font-bold uppercase tracking-widest text-foreground/80">Queue</span>
            <span class="ml-auto text-[10px] text-muted-foreground tabular-nums">{queue.length}</span>
        </div>

        <ScrollArea class="flex-1 min-h-0">
            {#if queue.length === 0}
                <div class="flex flex-col items-center justify-center text-center p-8 mt-4">
                    <div class="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center mb-4">
                        <Layers class="w-7 h-7 text-primary/40" />
                    </div>
                    <p class="text-sm font-semibold text-foreground">Queue is empty</p>
                    <p class="text-[11px] mt-1.5 max-w-[240px] text-muted-foreground leading-relaxed">
                        Enqueue a local LLM or VLM above to build a batch benchmark.
                    </p>
                </div>
            {:else}
                <div class="p-3 space-y-1.5">
                    {#each queue as item, i}
                        {@const accent = getQueueItemAccent(item)}
                        {@const isActive = isRunningQueue && i === queueIndex}
                        <div
                            class="relative flex items-stretch gap-2.5 p-2.5 rounded-lg border transition-all
                                {isActive ? 'bg-muted/40 border-primary/50 shadow-sm ring-1 ring-primary/20' :
                                 item.status === 'error' ? 'bg-destructive/5 border-destructive/30' :
                                 item.status === 'completed' ? 'bg-emerald-500/5 border-emerald-500/30' :
                                 'bg-transparent border-border hover:bg-muted/30'}"
                        >
                            <div class="w-1 self-stretch rounded-full {accent}"></div>
                            <div class="flex items-center justify-center w-6 h-6 shrink-0 rounded-md bg-muted/60 text-[10px] font-bold text-muted-foreground tabular-nums">
                                {i + 1}
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-start justify-between gap-2">
                                    <div class="text-sm font-semibold truncate" title={item.modelName}>{item.modelName}</div>
                                    {#if !isRunningQueue && item.status !== 'completed'}
                                        <button
                                            class="shrink-0 p-0.5 text-muted-foreground/60 hover:text-destructive transition-colors"
                                            onclick={() => removeFromQueue(item.id)}
                                            aria-label="Remove from queue"
                                        >
                                            <Trash2 class="w-3.5 h-3.5" />
                                        </button>
                                    {/if}
                                </div>
                                <div class="text-[10.5px] text-muted-foreground mt-0.5 truncate">
                                    <span class="font-mono">{item.device}</span>
                                    <span class="opacity-60"> · </span>
                                    <span>{item.loadBefore ? 'Load' : 'No-load'} / {item.unloadAfter ? 'Unload' : 'Keep'}</span>
                                </div>
                                <div class="flex items-center gap-1.5 mt-2 flex-wrap">
                                    {#if item.status === 'loading'}
                                        <span class="inline-flex items-center gap-1.5 text-[11px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-1 rounded-md border border-amber-500/30">
                                            <Loader2 class="w-3 h-3 animate-spin" /> Loading
                                        </span>
                                    {:else if item.status === 'benchmarking'}
                                        <span class="inline-flex items-center gap-1.5 text-[11px] bg-primary/10 text-primary px-2 py-1 rounded-md border border-primary/30">
                                            <Zap class="w-3 h-3 animate-pulse" /> Benchmarking
                                        </span>
                                    {:else if item.status === 'unloading'}
                                        <span class="inline-flex items-center gap-1.5 text-[11px] bg-blue-500/10 text-blue-500 px-2 py-1 rounded-md border border-blue-500/30">
                                            <Loader2 class="w-3 h-3 animate-spin" /> Unloading
                                        </span>
                                    {:else if item.status === 'completed' && item.result}
                                        <span class="inline-flex items-center gap-1.5 text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-md border border-emerald-500/30">
                                            <CheckCircle2 class="w-3 h-3" /> Done
                                        </span>
                                        <span class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border" title="Average prefill throughput">
                                            <Zap class="w-3 h-3 text-amber-500" />
                                            <span class="tabular-nums">{item.result.avg_pp.toFixed(1)}</span>
                                            <span class="text-muted-foreground">PP</span>
                                        </span>
                                        <span class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border" title="Average decode throughput">
                                            <Gauge class="w-3 h-3 text-primary" />
                                            <span class="tabular-nums font-semibold">{item.result.avg_tg.toFixed(1)}</span>
                                            <span class="text-muted-foreground">TG</span>
                                        </span>
                                    {:else if item.status === 'error'}
                                        <span class="inline-flex items-center gap-1.5 text-[11px] bg-destructive/10 text-destructive px-2 py-1 rounded-md border border-destructive/30 max-w-full truncate" title={item.error}>
                                            <XCircle class="w-3 h-3 shrink-0" />
                                            <span class="truncate">Failed</span>
                                        </span>
                                    {:else}
                                        <span class="inline-flex items-center gap-1.5 text-[11px] bg-muted/30 text-muted-foreground px-2 py-1 rounded-md border">
                                            <Play class="w-3 h-3" /> Idle
                                        </span>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </ScrollArea>
    </aside>
    {/if}
</div>

<Dialog.Root bind:open={isHistoryDialogOpen}>
    <Dialog.Content class="max-w-2xl">
        <Dialog.Header>
            <Dialog.Title>Benchmark details</Dialog.Title>
            <Dialog.Description>
                {selectedHistoryItem?.modelName}
            </Dialog.Description>
        </Dialog.Header>

        <div class="my-4">
            {#if selectedHistoryItem}
            <div class="flex gap-3 mb-4">
                <div class="flex-1 rounded-xl border bg-card p-4">
                    <div class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        <Zap class="w-3 h-3 text-amber-500" /> Avg prefill (PP)
                    </div>
                    <div class="text-2xl font-bold text-foreground mt-2 tabular-nums">
                        {selectedHistoryItem.avg_pp.toFixed(2)}
                        <span class="text-sm font-medium text-muted-foreground">t/s</span>
                    </div>
                </div>
                <div class="flex-1 rounded-xl border bg-card p-4">
                    <div class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        <Gauge class="w-3 h-3 text-primary" /> Avg decode (TG)
                    </div>
                    <div class="text-2xl font-bold text-primary mt-2 tabular-nums">
                        {selectedHistoryItem.avg_tg.toFixed(2)}
                        <span class="text-sm font-medium text-muted-foreground">t/s</span>
                    </div>
                </div>
            </div>

            <div class="rounded-xl border overflow-hidden">
                <Table.Root>
                    <Table.Header>
                        <Table.Row>
                            <Table.Head class="w-[80px] text-[10px] font-bold uppercase tracking-wider">Run</Table.Head>
                            <Table.Head class="text-[10px] font-bold uppercase tracking-wider">Prefill (PP)</Table.Head>
                            <Table.Head class="text-[10px] font-bold uppercase tracking-wider">Decode (TG)</Table.Head>
                            <Table.Head class="text-right text-[10px] font-bold uppercase tracking-wider">Duration</Table.Head>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {#each selectedHistoryItem.runs as run, i}
                        <Table.Row>
                            <Table.Cell class="font-medium text-muted-foreground tabular-nums">#{i + 1}</Table.Cell>
                            <Table.Cell class="tabular-nums">{run.pp.toFixed(2)} <span class="text-muted-foreground">t/s</span></Table.Cell>
                            <Table.Cell class="tabular-nums font-semibold">{run.tg.toFixed(2)} <span class="text-muted-foreground font-normal">t/s</span></Table.Cell>
                            <Table.Cell class="text-right tabular-nums">{run.time.toFixed(2)} <span class="text-muted-foreground">s</span></Table.Cell>
                        </Table.Row>
                        {/each}
                    </Table.Body>
                </Table.Root>
            </div>
            {/if}
        </div>

        <Dialog.Footer>
            <Button variant="outline" onclick={() => isHistoryDialogOpen = false}>Close</Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={isHeteroDialogOpen}>
    <Dialog.Content class="sm:max-w-xl">
        <Dialog.Header>
            <Dialog.Title>Configure HETERO device</Dialog.Title>
            <Dialog.Description>
                Select multiple devices to split the workload. Order matters (e.g. GPU.0,CPU prefers GPU.0 first).
            </Dialog.Description>
        </Dialog.Header>

        <div class="space-y-3 my-4">
            <div class="flex items-center gap-2 px-1">
                <div class="h-[2px] w-3 rounded-full bg-primary/60"></div>
                <span class="text-[10px] font-bold uppercase tracking-widest text-foreground/80">Available devices</span>
            </div>
            <div class="flex flex-col gap-2">
                {#each availableDevices.filter(d => d.value !== 'AUTO' && d.value !== 'CUSTOM' && d.value !== 'HETERO') as dev}
                    {@const active = heteroSelectedDevices.includes(dev.value)}
                    <label
                        for={`hetero-${dev.value}`}
                        class="flex items-stretch gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all
                            {active ? 'bg-muted/40 border-primary/50 shadow-sm ring-1 ring-primary/20' : 'bg-transparent border-border hover:bg-muted/30'}"
                    >
                        <div class="w-1 self-stretch rounded-full {active ? 'bg-primary' : 'bg-muted-foreground/30'}"></div>
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-semibold truncate">{dev.label}</div>
                            <div class="text-[10.5px] text-muted-foreground font-mono mt-0.5">{dev.value}</div>
                        </div>
                        <Switch
                            id={`hetero-${dev.value}`}
                            checked={active}
                            onCheckedChange={(v: boolean) => {
                                if (v) {
                                    heteroSelectedDevices = [...heteroSelectedDevices, dev.value];
                                } else {
                                    heteroSelectedDevices = heteroSelectedDevices.filter(d => d !== dev.value);
                                }
                            }}
                        />
                    </label>
                {/each}
            </div>

            {#if heteroSelectedDevices.length > 0}
            <div class="rounded-xl border bg-muted/20 p-3">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Resulting string</span>
                </div>
                <div class="font-mono text-sm text-primary break-all">{heteroDeviceString}</div>
                <p class="text-[10.5px] text-muted-foreground mt-2 leading-relaxed">
                    To change priority order, unselect and re-select devices in your preferred order.
                </p>
            </div>
            {/if}
        </div>

        <Dialog.Footer>
            <Button onclick={() => isHeteroDialogOpen = false}>Done</Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
