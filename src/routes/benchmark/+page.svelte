<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { invoke } from '@tauri-apps/api/core';
    import { Play, Loader2, Server, Box, Zap, Clock, Activity, AlertCircle, Plus, Trash2, CheckCircle2, XCircle, ArrowRight, Download, Eye, ChevronsUpDown, Check } from '@lucide/svelte';
    
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
    <aside class="w-[450px] shrink-0 border-r bg-muted/20 flex flex-col h-full transition-all duration-200">
        <div class="p-4 border-b font-bold text-lg flex items-center gap-2">
            <Activity class="w-5 h-5" /> Benchmark
        </div>
        <div class="p-3 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/10">
            Previous Runs
        </div>
        <ScrollArea class="flex-1">
            {#if history.length === 0}
                <div class="p-6 text-center text-sm text-muted-foreground">
                    No previous benchmarks found in this session.
                </div>
            {:else}
                <Table.Root>
                    <Table.Header>
                        <Table.Row>
                            <Table.Head class="w-[160px]">Model</Table.Head>
                            <Table.Head class="text-right text-[11px] uppercase">Runs</Table.Head>
                            <Table.Head class="text-right text-[11px] uppercase">Avg PP</Table.Head>
                            <Table.Head class="text-right text-[11px] uppercase">Avg TG</Table.Head>
                            <Table.Head class="w-[30px]"></Table.Head>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {#each history as item}
                            <Table.Row class="cursor-pointer hover:bg-muted/50 transition-colors group" onclick={() => viewHistoryDetails(item)}>
                                <Table.Cell class="max-w-[160px] truncate" title={item.modelName}>
                                    <div class="font-medium truncate">{item.modelName}</div>
                                    <div class="text-[10px] text-muted-foreground mt-0.5">
                                        {item.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </div>
                                </Table.Cell>
                                <Table.Cell class="text-right text-xs">{item.runs.length}</Table.Cell>
                                <Table.Cell class="text-right text-xs">{item.avg_pp.toFixed(1)}</Table.Cell>
                                <Table.Cell class="text-right text-xs font-semibold text-primary">{item.avg_tg.toFixed(1)}</Table.Cell>
                                <Table.Cell class="text-right p-2">
                                    <Eye class="w-4 h-4 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity" />
                                </Table.Cell>
                            </Table.Row>
                        {/each}
                    </Table.Body>
                </Table.Root>
            {/if}
        </ScrollArea>

        {#if history.length > 0}
            <div class="p-4 border-t flex gap-2 bg-background/50">
                <Button variant="outline" class="flex-1 text-xs" onclick={exportToCsv}>
                    <Download class="w-4 h-4 mr-2" /> Export CSV
                </Button>
                <Button variant="destructive" class="flex-1 text-xs" onclick={clearHistory}>
                    <Trash2 class="w-4 h-4 mr-2" /> Clear
                </Button>
            </div>
        {/if}
    </aside>
    {/if}

    <main class="flex flex-col flex-1 h-full min-w-0 relative overflow-y-auto">
        <div class="max-w-3xl w-full mx-auto p-6 space-y-6">
            <div>
                <h1 class="text-2xl font-semibold tracking-tight">Benchmark Queue Execution</h1>
                <p class="text-sm text-muted-foreground mt-1">Configure generation parameters and run your queued models.</p>
            </div>
            
            <Card.Root>
                <Card.Header>
                    <Card.Title>Generation Parameters</Card.Title>
                    <Card.Description>These parameters will be applied to all models in the queue.</Card.Description>
                </Card.Header>
                <Card.Content class="space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="space-y-3">
                            <div class="flex justify-between items-center">
                                <Label>Prompt Length (Tokens)</Label>
                                <span class="text-xs font-medium bg-muted px-2 py-0.5 rounded">{Math.pow(2, promptPower[0])}</span>
                            </div>
                            <Slider type="multiple" bind:value={promptPower} max={14} min={6} step={1} disabled={isRunningQueue} />
                            <p class="text-xs text-muted-foreground">Context length for the pre-fill phase.</p>
                        </div>

                        <div class="space-y-3">
                            <div class="flex justify-between items-center">
                                <Label>Generation Length (Tokens)</Label>
                                <span class="text-xs font-medium bg-muted px-2 py-0.5 rounded">{Math.pow(2, maxPower[0])}</span>
                            </div>
                            <Slider type="multiple" bind:value={maxPower} max={14} min={6} step={1} disabled={isRunningQueue} />
                            <p class="text-xs text-muted-foreground">Tokens to generate during decode.</p>
                        </div>

                        <div class="space-y-3">
                            <div class="flex justify-between items-center">
                                <Label>Iterations (Reruns)</Label>
                                <span class="text-xs font-medium bg-muted px-2 py-0.5 rounded">{iterations[0]}</span>
                            </div>
                            <Slider type="multiple" bind:value={iterations} max={10} min={1} step={1} disabled={isRunningQueue} />
                            <p class="text-xs text-muted-foreground">Runs multiple times per queue item and averages the metrics.</p>
                        </div>

                        <div class="space-y-3">
                            <div class="flex justify-between items-center">
                                <Label>Temperature</Label>
                                <span class="text-xs font-medium bg-muted px-2 py-0.5 rounded">{temperature[0]}</span>
                            </div>
                            <Slider type="multiple" bind:value={temperature} max={2} min={0} step={0.1} disabled={isRunningQueue} />
                        </div>
                    </div>
                </Card.Content>
                <Card.Footer class="border-t bg-muted/10 p-4">
                    <Button 
                        class="w-full gap-2" 
                        size="lg"
                        onclick={runQueue} 
                        disabled={isRunningQueue || queue.length === 0}
                    >
                        {#if isRunningQueue}
                            <Loader2 class="w-5 h-5 animate-spin" />
                            Running Queue ({queueIndex + 1}/{queue.length})...
                        {:else}
                            <Play class="w-5 h-5 fill-current" />
                            Run Queue ({queue.length} models)
                        {/if}
                    </Button>
                </Card.Footer>
            </Card.Root>

            {#if isRunningQueue && queue[queueIndex]}
                {@const activeItem = queue[queueIndex]}
                <Card.Root class="border-primary/50 shadow-md">
                    <Card.Content class="p-6">
                        <div class="flex flex-col items-center justify-center text-center space-y-4">
                            <div class="relative">
                                <div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                                    {#if activeItem.status === 'loading'}
                                        <Loader2 class="w-8 h-8 text-primary animate-spin" />
                                    {:else if activeItem.status === 'benchmarking'}
                                        <Zap class="w-8 h-8 text-primary animate-pulse" />
                                    {:else if activeItem.status === 'unloading'}
                                        <ArrowRight class="w-8 h-8 text-primary" />
                                    {/if}
                                </div>
                            </div>
                            <div>
                                <h3 class="text-lg font-semibold">{activeItem.modelName}</h3>
                                <p class="text-sm text-primary font-medium mt-1 uppercase tracking-widest">
                                    {activeItem.status === 'loading' ? 'Loading Model into VRAM...' : 
                                     activeItem.status === 'benchmarking' ? 'Running Benchmark...' : 
                                     activeItem.status === 'unloading' ? 'Unloading Model...' : 'Processing...'}
                                </p>
                            </div>
                        </div>
                    </Card.Content>
                </Card.Root>
            {/if}

        </div>
    </main>

    {#if appState.rightPanelOpen}
    <aside class="w-[450px] shrink-0 border-l bg-muted/20 flex flex-col h-full transition-all duration-200">
        <div class="p-4 border-b font-bold text-lg">Benchmark Queue</div>
        
        <div class="p-4 border-b bg-background space-y-4">
            <h3 class="text-sm font-semibold">Add to Queue</h3>
            <div class="space-y-3">
                <div class="space-y-1.5">
                    <Label class="text-xs">Select Local Model</Label>
                    <Popover.Root bind:open={modelComboboxOpen}>
                        <Popover.Trigger>
                            {#snippet child({ props })}
                                <Button
                                    {...props}
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={modelComboboxOpen}
                                    class="w-full h-8 text-xs justify-between"
                                    disabled={localModels.length === 0 || isRunningQueue}
                                >
                                    {#if selectedLocalModelPath}
                                        {@const m = localModels.find((x:any) => x.path === selectedLocalModelPath)}
                                        <span class="truncate">{m?.model_name || "Select model"}</span>
                                    {:else}
                                        "No local models found"
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
                    <Label class="text-xs">Device</Label>
                    <div class="flex gap-2">
                        <Select.Root type="single" bind:value={addDeviceMode} disabled={isRunningQueue}>
                            <Select.Trigger class="h-8 text-xs flex-1">
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
                                class="h-8 text-xs flex-1" 
                                disabled={isRunningQueue} 
                            />
                        {:else if addDeviceMode === "HETERO"}
                            <div class="flex gap-2 flex-1">
                                <Input 
                                    value={heteroDeviceString} 
                                    readonly 
                                    class="h-8 text-xs flex-1 min-w-[120px]" 
                                    disabled={isRunningQueue} 
                                />
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    class="h-8 text-xs px-2" 
                                    onclick={() => isHeteroDialogOpen = true}
                                    disabled={isRunningQueue}
                                >
                                    Config
                                </Button>
                            </div>
                        {/if}
                    </div>
                </div>

                <div class="flex items-center justify-between">
                    <Label class="text-xs cursor-pointer" for="load-before">Load Before Run</Label>
                    <Switch id="load-before" bind:checked={addLoadBefore} disabled={isRunningQueue} />
                </div>
                
                <div class="flex items-center justify-between">
                    <Label class="text-xs cursor-pointer" for="unload-after">Unload After Run</Label>
                    <Switch id="unload-after" bind:checked={addUnloadAfter} disabled={isRunningQueue} />
                </div>

                <Button class="w-full h-8 text-xs gap-1.5" onclick={addToQueue} disabled={!selectedLocalModelPath || isRunningQueue || (addDeviceMode === 'CUSTOM' && !customDevice) || (addDeviceMode === 'HETERO' && heteroSelectedDevices.length === 0)}>
                    <Plus class="w-3.5 h-3.5" /> Enqueue Model
                </Button>
            </div>
        </div>

        <ScrollArea class="flex-1">
            {#if queue.length === 0}
                <div class="text-center text-xs text-muted-foreground p-6">
                    The queue is empty. Add local models to run a batch benchmark.
                </div>
            {:else}
                <Table.Root>
                    <Table.Header>
                        <Table.Row>
                            <Table.Head class="w-[30px] font-semibold text-center">#</Table.Head>
                            <Table.Head class="font-semibold">Model</Table.Head>
                            <Table.Head class="font-semibold text-xs">Config</Table.Head>
                            <Table.Head class="font-semibold text-xs">Status</Table.Head>
                            <Table.Head class="w-[40px]"></Table.Head>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {#each queue as item, i}
                            <Table.Row class={item.status === 'benchmarking' ? 'bg-primary/5' : item.status === 'error' ? 'bg-destructive/5' : item.status === 'completed' ? 'bg-emerald-500/5' : ''}>
                                <Table.Cell class="text-xs text-muted-foreground text-center font-medium">{i + 1}</Table.Cell>
                                <Table.Cell class="max-w-[120px] truncate" title={item.modelName}>
                                    <div class="font-semibold truncate text-xs">{item.modelName}</div>
                                </Table.Cell>
                                <Table.Cell class="text-[10px] text-muted-foreground whitespace-nowrap">
                                    <div class="font-medium">{item.device}</div>
                                    <div>{item.loadBefore?'Load':'-'} / {item.unloadAfter?'Unload':'-'}</div>
                                </Table.Cell>
                                <Table.Cell class="text-xs whitespace-nowrap">
                                    {#if item.status === 'loading'}
                                        <span class="text-amber-500 flex items-center gap-1"><Loader2 class="w-3 h-3 animate-spin" /> Load</span>
                                    {:else if item.status === 'benchmarking'}
                                        <span class="text-primary flex items-center gap-1"><Zap class="w-3 h-3 animate-pulse" /> Bench</span>
                                    {:else if item.status === 'unloading'}
                                        <span class="text-blue-500 flex items-center gap-1"><Loader2 class="w-3 h-3 animate-spin" /> Unload</span>
                                    {:else if item.status === 'completed' && item.result}
                                        <span class="text-emerald-500 flex items-center gap-1 font-semibold" title={`Avg PP: ${item.result.avg_pp.toFixed(1)} | Avg TG: ${item.result.avg_tg.toFixed(1)}`}>
                                            <CheckCircle2 class="w-3 h-3" /> {item.result.avg_pp.toFixed(0)}/{item.result.avg_tg.toFixed(0)}
                                        </span>
                                    {:else if item.status === 'error'}
                                        <span class="text-destructive flex items-center gap-1 truncate max-w-[50px]" title={item.error}>
                                            <XCircle class="w-3 h-3 shrink-0" /> Err
                                        </span>
                                    {:else}
                                        <span class="text-muted-foreground opacity-50">Idle</span>
                                    {/if}
                                </Table.Cell>
                                <Table.Cell class="p-2 text-right">
                                    {#if !isRunningQueue && item.status !== 'completed'}
                                        <button class="text-muted-foreground hover:text-destructive transition-colors" onclick={() => removeFromQueue(item.id)}>
                                            <Trash2 class="w-4 h-4" />
                                        </button>
                                    {/if}
                                </Table.Cell>
                            </Table.Row>
                        {/each}
                    </Table.Body>
                </Table.Root>
            {/if}
        </ScrollArea>
    </aside>
    {/if}
</div>

<Dialog.Root bind:open={isHistoryDialogOpen}>
    <Dialog.Content class="max-w-2xl">
        <Dialog.Header>
            <Dialog.Title>Benchmark Details</Dialog.Title>
            <Dialog.Description>
                Model: {selectedHistoryItem?.modelName}
            </Dialog.Description>
        </Dialog.Header>
        
        <div class="my-4">
            {#if selectedHistoryItem}
            <div class="flex gap-4 mb-4">
                <div class="bg-muted/50 p-3 rounded-lg flex-1 text-center">
                    <div class="text-xs text-muted-foreground uppercase font-semibold">Avg Prefill (PP)</div>
                    <div class="text-lg font-bold text-primary">{selectedHistoryItem.avg_pp.toFixed(2)} t/s</div>
                </div>
                <div class="bg-muted/50 p-3 rounded-lg flex-1 text-center">
                    <div class="text-xs text-muted-foreground uppercase font-semibold">Avg Decode (TG)</div>
                    <div class="text-lg font-bold text-primary">{selectedHistoryItem.avg_tg.toFixed(2)} t/s</div>
                </div>
            </div>
            
            <div class="border rounded-md">
                <Table.Root>
                    <Table.Header>
                        <Table.Row>
                            <Table.Head class="w-[80px] font-semibold">Run #</Table.Head>
                            <Table.Head class="font-semibold">Prefill (PP)</Table.Head>
                            <Table.Head class="font-semibold">Decode (TG)</Table.Head>
                            <Table.Head class="text-right font-semibold">Duration</Table.Head>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {#each selectedHistoryItem.runs as run, i}
                        <Table.Row>
                            <Table.Cell class="font-medium text-muted-foreground">{i + 1}</Table.Cell>
                            <Table.Cell>{run.pp.toFixed(2)} t/s</Table.Cell>
                            <Table.Cell>{run.tg.toFixed(2)} t/s</Table.Cell>
                            <Table.Cell class="text-right">{run.time.toFixed(2)} s</Table.Cell>
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
            <Dialog.Title>Configure HETERO Device</Dialog.Title>
            <Dialog.Description>
                Select multiple devices to split the workload. The order matters (e.g., GPU.0,CPU will prefer GPU.0 first).
            </Dialog.Description>
        </Dialog.Header>
        
        <div class="space-y-4 my-4">
            <div class="text-xs font-semibold uppercase text-muted-foreground mb-2">Available Devices</div>
            <div class="flex flex-col gap-3">
                {#each availableDevices.filter(d => d.value !== 'AUTO' && d.value !== 'CUSTOM' && d.value !== 'HETERO') as dev}
                    <div class="flex items-center justify-between p-2 rounded-md border hover:bg-muted/50 transition-colors">
                        <Label class="flex-1 cursor-pointer font-medium text-sm" for={`hetero-${dev.value}`}>{dev.label}</Label>
                        <Switch 
                            id={`hetero-${dev.value}`}
                            checked={heteroSelectedDevices.includes(dev.value)}
                            onCheckedChange={(v: boolean) => {
                                if (v) {
                                    heteroSelectedDevices = [...heteroSelectedDevices, dev.value];
                                } else {
                                    heteroSelectedDevices = heteroSelectedDevices.filter(d => d !== dev.value);
                                }
                            }}
                        />
                    </div>
                {/each}
            </div>

            {#if heteroSelectedDevices.length > 0}
            <div class="mt-4 p-3 bg-muted/30 rounded-md text-sm border border-border/50">
                <span class="font-semibold text-muted-foreground mr-2">Result:</span> 
                <span class="text-primary font-mono">{heteroDeviceString}</span>
                <p class="text-xs text-muted-foreground mt-2">
                    To change the priority order, unselect and re-select devices in your preferred order.
                </p>
            </div>
            {/if}
        </div>
        
        <Dialog.Footer>
            <Button onclick={() => isHeteroDialogOpen = false}>Done</Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>