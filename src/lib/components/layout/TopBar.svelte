<script lang="ts">
    import * as Dialog from "$lib/components/ui/dialog";
    import * as Table from "$lib/components/ui/table";
    import { Button } from "$lib/components/ui/button";
    import { ScrollArea } from "$lib/components/ui/scroll-area";
    import { Switch } from "$lib/components/ui/switch";
    import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Search, LogOut, Download, Pause, Play, X, Cpu, HardDrive, Sparkles, AlertTriangle, CheckCircle2, ChevronDown } from "@lucide/svelte";
    import { appState } from "$lib/state.svelte.js";
    import { openarc } from "$lib/client.svelte.js";
    import ModelConfigModal from "./ModelConfigModal.svelte";
    import DeviceSelectionModal from "./DeviceSelectionModal.svelte";
    import { onMount } from "svelte";

    onMount(() => {
        appState.addLog('info', 'TopBar component initialized');
    });

    let dialogOpen = $state(false);
    let downloadsOpen = $state(false);
    let configModalOpen = $state(false);
    let deviceModalOpen = $state(false);
    let selectedModelForConfig = $state<any>(null);
    let selectedModelForLoad = $state<any>(null);
    let useDefaultValues = $state(true);

    const loadedModels = $derived((openarc.status?.models || []).map((info: any) => ({
        id: info.model_name,
        name: info.model_name,
        type: info.model_type || "UNKNOWN",
        context: "-",
        size: "-",
        status: info.status
    })));

    const availableModels = $derived(openarc.localModels?.models?.map((m: any) => ({
        id: m.id,
        name: m.model_name || m.id,
        type: m.model_type || "UNKNOWN",
        context: "-",
        size: "-",
        status: "Ready",
        path: m.path,
        hasConfig: m.has_config
    })) || []);

    const unifiedModels = $derived.by(() => {
        const map = new Map();
        availableModels.forEach((m: any) => map.set(m.name, { ...m, isLoaded: false }));
        loadedModels.forEach((m: any) => {
            if (map.has(m.name)) {
                map.set(m.name, { ...map.get(m.name), ...m, isLoaded: true });
            } else {
                map.set(m.name, { ...m, isLoaded: true, hasConfig: true });
            }
        });
        return Array.from(map.values()).sort((a: any, b: any) => {
            if (a.isLoaded && !b.isLoaded) return -1;
            if (!a.isLoaded && b.isLoaded) return 1;
            return a.name.localeCompare(b.name);
        });
    });

    let activeModels = $state<{ llm: any; stt: any; tts: any }>({ llm: null, stt: null, tts: null });

    $effect(() => {
        if (activeModels.llm && !loadedModels.find((m: any) => m.name === activeModels.llm.name && (m.status === "loaded" || m.status === "loading"))) {
            activeModels.llm = null;
        }
        if (activeModels.stt && !loadedModels.find((m: any) => m.name === activeModels.stt.name && (m.status === "loaded" || m.status === "loading"))) {
            activeModels.stt = null;
        }
        if (activeModels.tts && !loadedModels.find((m: any) => m.name === activeModels.tts.name && (m.status === "loaded" || m.status === "loading"))) {
            activeModels.tts = null;
        }
        
        if (!activeModels.llm) {
            const llm = loadedModels.find((m: any) => ["LLM", "VLM"].includes((m.type || "").toUpperCase()) && (m.status === "loaded" || m.status === "loading"));
            if (llm) activeModels.llm = llm;
        }
        if (!activeModels.stt) {
            const stt = loadedModels.find((m: any) => ["STT", "WHISPER"].includes((m.type || "").toUpperCase()) && (m.status === "loaded" || m.status === "loading"));
            if (stt) activeModels.stt = stt;
        }
        if (!activeModels.tts) {
            const tts = loadedModels.find((m: any) => ["TTS", "KOKORO"].includes((m.type || "").toUpperCase()) && (m.status === "loaded" || m.status === "loading"));
            if (tts) activeModels.tts = tts;
        }
    });

    const handleLoad = async (model: any, device: string = "AUTO") => {
        let modelType = "llm";
        let engine = "ovgenai";
        
        const arch = (model.type || model.architecture || "LLM").toUpperCase();
        if (arch === "VLM") {
            modelType = "vlm";
            engine = "ovgenai";
        } else if (arch === "STT" || arch === "WHISPER") {
            modelType = "whisper";
            engine = "optimum";
        } else if (arch === "TTS" || arch === "KOKORO") {
            modelType = "kokoro";
            engine = "openvino";
        } else if (arch === "EMBEDDING" || arch === "EMB") {
            modelType = "emb";
            engine = "optimum";
        } else if (arch === "RERANKER" || arch === "RERANK") {
            modelType = "rerank";
            engine = "optimum";
        }

        try {
            appState.addLog('v1', `Requesting load for model: ${model.name}`, `Device: ${device}, Engine: ${engine}`);
            await openarc.loadModel({
                model_path: model.path,
                model_name: model.name,
                model_type: modelType,
                engine: engine,
                device: device,
                runtime_config: {}
            });
        } catch(e) {
            console.error("Failed to load model:", e);
        }
    };

    const initiateLoad = (model: any) => {
        appState.addLog('v2', `Initiating load for model: ${model.name}`);
        dialogOpen = false; // Close the model selector dialog
        setTimeout(() => {
            if (!model.hasConfig || model.type === "UNKNOWN") {
                selectedModelForConfig = model;
                configModalOpen = true;
                return;
            }
            selectedModelForLoad = model;
            deviceModalOpen = true;
        }, 10);
    };
    
    const selectLoadedModel = (model: any) => {
        if (model.status === 'loaded') {
            const arch = (model.type || "LLM").toUpperCase();
            if (["STT", "WHISPER"].includes(arch)) {
                activeModels.stt = model;
            } else if (["TTS", "KOKORO"].includes(arch)) {
                activeModels.tts = model;
            } else {
                activeModels.llm = model;
            }
        }
    };
    
    const handleUnload = async (name: string) => {
        appState.addLog('v1', `Requesting unload for model: ${name}`);
        try {
            await openarc.unloadModel({ model_name: name });
        } catch (e) {
            appState.addLog('error', `Failed to unload model ${name}`, String(e));
            console.error(e);
        }
    };
</script>

<header class="h-12 border-b flex items-center justify-between px-4 bg-background relative">
    <div class="flex items-center w-[120px] z-10">
        <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground hover:text-foreground" onclick={() => { appState.leftPanelOpen = !appState.leftPanelOpen; appState.addLog('v2', 'Toggled left panel', `State: ${appState.leftPanelOpen}`); }}>
            {#if appState.leftPanelOpen}
                <PanelLeftClose class="w-4 h-4" />
            {:else}
                <PanelLeftOpen class="w-4 h-4" />
            {/if}
        </Button>
    </div>

    <div class="absolute left-1/2 -translate-x-1/2 flex justify-center z-10">
        <Dialog.Root bind:open={dialogOpen}>
            <Dialog.Trigger>
                {#snippet child({ props })}
                    <div class="relative w-[520px] group">
                        {#if dialogOpen}
                            <div class="absolute -inset-0.5 bg-primary/20 blur-xl rounded-lg animate-pulse z-0 pointer-events-none transition-all duration-700"></div>
                        {/if}
                        <Button
                            {...props}
                            variant="outline"
                            class="w-full justify-between shadow-sm relative z-10 transition-all duration-300 border-muted/50 hover:border-primary/50 hover:bg-muted/30 h-10 px-3 {dialogOpen ? 'border-primary/50 bg-muted/40 ring-2 ring-primary/20' : 'bg-background/50 backdrop-blur-sm'}"
                        >
                            <div class="flex items-center gap-2.5 overflow-hidden">
                                <div class="flex items-center justify-center w-6 h-6 rounded bg-primary/10 text-primary shrink-0 transition-colors group-hover:bg-primary/20">
                                    <Sparkles class="w-3.5 h-3.5" />
                                </div>
                                <div class="flex flex-col items-start overflow-hidden">
                                    <span class="text-[10px] font-bold tracking-wider uppercase text-muted-foreground leading-none mb-0.5">Active Models</span>
                                    <span class="font-semibold text-[13px] truncate max-w-[440px] leading-tight flex items-center gap-2">
                                        {#if activeModels.llm || activeModels.stt || activeModels.tts}
                                            {[
                                                activeModels.llm?.name, 
                                                activeModels.stt?.name, 
                                                activeModels.tts?.name
                                            ].filter(Boolean).join(" • ")}
                                        {:else}
                                            No Models Active
                                        {/if}
                                        
                                        {#if activeModels.llm?.status === 'loading' || activeModels.stt?.status === 'loading' || activeModels.tts?.status === 'loading'}
                                            <span class="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                                                <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                                Loading
                                            </span>
                                        {/if}
                                    </span>
                                </div>
                            </div>
                            <ChevronDown class="w-4 h-4 text-muted-foreground transition-transform duration-300 group-hover:text-foreground {dialogOpen ? 'rotate-180 text-foreground' : ''}" />
                        </Button>
                    </div>
                {/snippet}
            </Dialog.Trigger>

            <Dialog.Content showCloseButton={false} class="sm:max-w-[850px] p-0 top-[10%] left-1/2 -translate-x-1/2 translate-y-0 gap-0 overflow-hidden flex flex-col h-auto max-h-[80vh] shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] border-muted/50 bg-background/95 backdrop-blur-2xl rounded-2xl ring-1 ring-inset ring-white/10">
                <Dialog.Title class="sr-only">Model Selector</Dialog.Title>

                <div class="h-16 flex items-center gap-4 bg-muted/20 border-b border-white/5 relative px-5 shrink-0 z-10 backdrop-blur-md">
                    <div class="flex items-center justify-center w-8 h-8 rounded-full bg-background/80 shadow-sm border border-muted/50">
                        <Search class="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                    <input 
                        placeholder="Search models by name, architecture, or size..." 
                        class="flex-1 bg-transparent border-0 outline-none text-[15px] font-medium placeholder:text-muted-foreground/50 focus:ring-0 pr-8 h-full"
                    />
                    <div class="flex items-center gap-3">
                        <select class="bg-background/80 border border-muted/50 rounded-lg text-xs font-semibold uppercase tracking-wider text-muted-foreground focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer h-9 px-3 shadow-sm hover:bg-muted/50 transition-colors">
                            <option>All Types</option>
                            <option>LLM</option>
                            <option>VLM</option>
                            <option>Audio</option>
                        </select>
                        <div class="w-px h-6 bg-border/50 mx-1"></div>
                        <Dialog.Close class="flex items-center justify-center h-9 w-9 rounded-full bg-background/50 hover:bg-destructive/10 text-muted-foreground hover:text-destructive border border-transparent hover:border-destructive/20 transition-all">
                            <X class="w-4 h-4" />
                        </Dialog.Close>
                    </div>
                </div>

                <ScrollArea class="flex-1 min-h-0 bg-background overflow-hidden" orientation="vertical">
                    <table class="w-full table-fixed border-collapse m-0 p-0">
                        <thead class="bg-muted/30 border-b border-white/5 sticky top-0 z-10 backdrop-blur-sm text-left">
                            <tr class="hover:bg-transparent border-none">
                                <th class="h-8 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 px-3 w-[42%] font-medium">Model</th>
                                <th class="h-8 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 px-3 w-[13%] font-medium">Type</th>
                                <th class="h-8 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 px-3 w-[15%] font-medium">Context</th>
                                <th class="h-8 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 px-3 w-[15%] font-medium">Size</th>
                                <th class="h-8 px-3 text-right w-[15%]"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {#if loadedModels.length > 0}
                                <tr class="bg-muted/10 hover:bg-muted/10 border-b border-white/5">
                                    <td colspan="5" class="py-1 px-3">
                                        <div class="flex items-center gap-2.5">
                                            <div class="flex items-center justify-center w-5 h-5 rounded bg-primary/10 border border-primary/20">
                                                <Cpu class="w-3 h-3 text-primary" />
                                            </div>
                                            <h3 class="text-[9px] font-bold uppercase tracking-widest text-foreground flex items-center gap-1.5">
                                                Loaded in Memory
                                                <span class="inline-flex items-center justify-center bg-primary/20 text-primary text-[8px] h-3 w-3 rounded-full font-black">
                                                    {loadedModels.length}
                                                </span>
                                            </h3>
                                        </div>
                                    </td>
                                </tr>
                                {#each loadedModels as model}
                                    <tr 
                                        class="group border-b border-white/5 last:border-0 hover:bg-muted/30 transition-all cursor-pointer {(activeModels.llm?.name === model.name || activeModels.stt?.name === model.name || activeModels.tts?.name === model.name) ? 'bg-primary/5 hover:bg-primary/10' : ''}"
                                        onclick={() => selectLoadedModel(model)}
                                    >
                                        <td class="py-1.5 px-3 overflow-hidden">
                                            <div class="flex items-center gap-2 overflow-hidden w-full">
                                                <span class="font-bold text-foreground text-[13px] truncate">{model.name}</span>
                                                {#if model.status === 'loading'}
                                                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[9px] font-bold uppercase tracking-wider shrink-0">
                                                        <span class="relative flex h-1 w-1">
                                                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                            <span class="relative inline-flex rounded-full h-1 w-1 bg-amber-500"></span>
                                                        </span>
                                                        Loading
                                                    </span>
                                                {:else if activeModels.llm?.name === model.name || activeModels.stt?.name === model.name || activeModels.tts?.name === model.name}
                                                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-primary/10 border border-primary/20 text-primary text-[9px] font-bold uppercase tracking-wider shadow-[0_0_10px_rgba(var(--primary),0.1)] shrink-0">
                                                        <CheckCircle2 class="w-2.5 h-2.5 text-primary shrink-0" />
                                                        Active
                                                    </span>
                                                {:else}
                                                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-bold uppercase tracking-wider shrink-0">
                                                        <span class="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                                                        Idle
                                                    </span>
                                                {/if}
                                            </div>
                                        </td>
                                        <td class="py-1.5 px-3">
                                            <span class="inline-flex items-center rounded bg-muted/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground shadow-sm ring-1 ring-inset ring-muted-foreground/20">
                                                {model.type}
                                            </span>
                                        </td>
                                        <td class="py-1.5 px-3 text-muted-foreground/80 text-[12px] font-medium truncate">{model.context} ctx</td>
                                        <td class="py-1.5 px-3 text-muted-foreground/80 text-[12px] font-medium truncate">{model.size}</td>
                                        <td class="py-1.5 px-3 text-right">
                                            <Button 
                                                size="sm" 
                                                variant="destructive" 
                                                class="h-6 px-2.5 text-[10px] font-bold uppercase tracking-wider bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground border border-destructive/20 shadow-none z-10 relative rounded-sm opacity-0 group-hover:opacity-100 transition-all duration-300"
                                                onclick={(e) => { e.stopPropagation(); handleUnload(model.name); }}
                                                disabled={model.status === 'loading'}
                                            >
                                                <LogOut class="w-3 h-3 mr-1" />
                                                Unload
                                            </Button>
                                        </td>
                                    </tr>
                                {/each}
                            {/if}

                            {#if availableModels.length > 0}
                                <tr class="bg-muted/10 hover:bg-muted/10 border-b border-white/5 {loadedModels.length > 0 ? 'border-t border-white/10' : ''}">
                                    <td colspan="5" class="py-1 px-3">
                                        <div class="flex items-center gap-2.5">
                                            <div class="flex items-center justify-center w-5 h-5 rounded bg-muted/50 border border-muted/50">
                                                <HardDrive class="w-3 h-3 text-muted-foreground" />
                                            </div>
                                            <h3 class="text-[9px] font-bold uppercase tracking-widest text-foreground flex items-center gap-1.5">
                                                Local Library
                                                <span class="inline-flex items-center justify-center bg-muted/80 text-muted-foreground text-[8px] px-1 h-3 rounded-full font-black">
                                                    {availableModels.filter((m: any) => !loadedModels.find((lm: any) => lm.name === m.name)).length}
                                                </span>
                                            </h3>
                                        </div>
                                    </td>
                                </tr>
                                {#each availableModels.filter((m: any) => !loadedModels.find((lm: any) => lm.name === m.name)) as model}
                                    <tr 
                                        class="group cursor-pointer hover:bg-muted/40 transition-colors border-white/5"
                                        onclick={() => initiateLoad(model)}
                                    >
                                        <td class="py-1.5 px-3 overflow-hidden">
                                            <div class="flex items-center gap-2 overflow-hidden w-full">
                                                <span class="font-bold text-[13px] text-foreground/90 group-hover:text-primary transition-colors truncate">{model.name}</span>
                                                {#if !model.hasConfig}
                                                    <AlertTriangle class="w-3.5 h-3.5 text-amber-500/80 drop-shadow-sm shrink-0" title="Missing configuration" />
                                                {/if}
                                            </div>
                                        </td>
                                        <td class="py-1.5 px-3">
                                            <span class="inline-flex items-center rounded bg-muted/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground shadow-sm ring-1 ring-inset ring-muted-foreground/20">
                                                {model.type}
                                            </span>
                                        </td>
                                        <td class="py-1.5 px-3 text-[12px] font-medium text-muted-foreground/70 truncate">{model.context}</td>
                                        <td class="py-1.5 px-3 text-[12px] font-medium text-muted-foreground/70 truncate">{model.size}</td>
                                        <td class="py-1.5 px-3 text-right">
                                            <Button variant="secondary" size="sm" class="h-6 px-3 text-[10px] font-bold tracking-wider uppercase shadow-sm bg-secondary/80 text-foreground group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all opacity-0 group-hover:opacity-100 rounded-sm">
                                                Load
                                            </Button>
                                        </td>
                                    </tr>
                                {/each}
                            {/if}
                        </tbody>
                    </table>
                </ScrollArea>

                <div class="h-12 px-5 border-t border-white/5 flex items-center bg-muted/20 shrink-0 backdrop-blur-md rounded-b-2xl">
                    <div class="flex items-center gap-3">
                        <Switch id="default-vals" bind:checked={useDefaultValues} />
                        <label for="default-vals" class="flex flex-col justify-center cursor-pointer">
                            <div class="flex items-center gap-2">
                                <span class="text-[11px] font-bold tracking-wider uppercase text-foreground">Auto-configure settings</span>
                                <span class="text-[10px] font-medium text-muted-foreground/60">— Skip manual device config prompts</span>
                            </div>
                        </label>
                    </div>
                </div>
            </Dialog.Content>
        </Dialog.Root>
    </div>

    <div class="flex items-center justify-end gap-1 w-[120px]">
        <div class="relative">
            <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground hover:text-foreground relative" onclick={() => { downloadsOpen = !downloadsOpen; appState.addLog('v2', 'Toggled downloads dropdown', `State: ${downloadsOpen}`); }}>
                <Download class="w-4 h-4" />
                {#if openarc.downloads?.models?.length > 0}
                    <span class="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                {/if}
            </Button>

            {#if downloadsOpen}
                <div class="fixed inset-0 z-40" onclick={() => downloadsOpen = false}></div>
                <div class="absolute top-full right-0 mt-2 w-80 bg-background border rounded-lg shadow-lg z-50 overflow-hidden flex flex-col">
                    <div class="p-3 border-b font-medium text-sm flex justify-between items-center bg-muted/10">
                        <span>Downloads</span>
                        {#if openarc.downloads?.models?.length > 0}
                            <span class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{openarc.downloads.models.length}</span>
                        {/if}
                    </div>
                    
                    <div class="p-3 space-y-4 max-h-[300px] overflow-y-auto">
                        {#if openarc.downloads?.models?.length > 0}
                            {#each openarc.downloads.models as download}
                                <div class="space-y-2 pb-2 {download !== openarc.downloads.models[openarc.downloads.models.length - 1] ? 'border-b' : ''}">
                                    <div class="flex justify-between text-sm">
                                        <span class="font-medium truncate pr-2" title={download.model_name}>{download.model_name}</span>
                                        <span class="text-muted-foreground text-xs shrink-0">{download.progress}%</span>
                                    </div>
                                    <div class="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                        <div class="h-full bg-primary transition-all duration-300" style="width: {download.progress}%"></div>
                                    </div>
                                    <div class="flex justify-between items-center text-xs text-muted-foreground pt-1">
                                        <span class="capitalize">{download.status}</span>
                                        <div class="flex gap-1">
                                            {#if download.status === 'downloading'}
                                                <Button variant="ghost" size="icon" class="h-6 w-6" onclick={() => openarc.pauseDownload(download.model_name)}>
                                                    <Pause class="w-3 h-3" />
                                                </Button>
                                            {:else if download.status === 'paused'}
                                                <Button variant="ghost" size="icon" class="h-6 w-6" onclick={() => openarc.resumeDownload(download.model_name)}>
                                                    <Play class="w-3 h-3" />
                                                </Button>
                                            {/if}
                                            <Button variant="ghost" size="icon" class="h-6 w-6 hover:text-destructive" onclick={() => openarc.cancelDownload(download.model_name)}>
                                                <X class="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        {:else}
                            <div class="text-center text-sm text-muted-foreground py-4">
                                No active downloads.
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>

        <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground hover:text-foreground" onclick={() => { appState.rightPanelOpen = !appState.rightPanelOpen; appState.addLog('v2', 'Toggled right panel', `State: ${appState.rightPanelOpen}`); }}>
            {#if appState.rightPanelOpen}
                <PanelRightClose class="w-4 h-4" />
            {:else}
                <PanelRightOpen class="w-4 h-4" />
            {/if}
        </Button>
    </div>

    <DeviceSelectionModal
        bind:open={deviceModalOpen}
        modelName={selectedModelForLoad?.name || ""}
        onConfirm={(device) => {
            if (selectedModelForLoad) {
                handleLoad(selectedModelForLoad, device);
            }
        }}
    />

    <ModelConfigModal 
        bind:open={configModalOpen} 
        modelInfo={selectedModelForConfig} 
        onSuccess={(config) => {
            if (selectedModelForConfig && config) {
                const updatedModel = {
                    ...selectedModelForConfig,
                    name: config.model_name,
                    type: config.model_type,
                    hasConfig: true
                };
                selectedModelForLoad = updatedModel;
                deviceModalOpen = true;
            }
        }} 
    />
</header>
