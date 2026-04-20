<script lang="ts">
    import * as Dialog from "$lib/components/ui/dialog";
    import * as Table from "$lib/components/ui/table";
    import { Button } from "$lib/components/ui/button";
    import { ScrollArea } from "$lib/components/ui/scroll-area";
    import { Switch } from "$lib/components/ui/switch";
    import {
        PanelLeftClose,
        PanelLeftOpen,
        PanelRightClose,
        PanelRightOpen,
        Search,
        LogOut,
        Download,
        Pause,
        Play,
        X,
        XCircle,
        Cpu,
        HardDrive,
        Sparkles,
        AlertTriangle,
        CheckCircle2,
        ChevronDown,
        Loader2,
        Trash2,
    } from "@lucide/svelte";
    import { appState } from "$lib/state.svelte.js";
    import { openarc } from "$lib/client.svelte.js";
    import {
        detectModelType,
        getModelCategory,
        resolveModelType,
    } from "$lib/model-types";
    import ModelConfigModal from "./ModelConfigModal.svelte";
    import DeviceSelectionModal from "./DeviceSelectionModal.svelte";
    import { onMount } from "svelte";

    onMount(() => {
        appState.addLog("info", "TopBar component initialized");
    });

    let dialogOpen = $state(false);
    let downloadsOpen = $state(false);
    let configModalOpen = $state(false);
    let deviceModalOpen = $state(false);
    let selectedModelForConfig = $state<any>(null);
    let selectedModelForLoad = $state<any>(null);
    let useDefaultValues = $state(true);
    let modelSearch = $state("");
    let modelTypeFilter = $state("all");
    let searchInputEl = $state<HTMLInputElement | null>(null);

    const modelTypeFilters = [
        { value: "all", label: "All" },
        { value: "llm", label: "LLM" },
        { value: "vlm", label: "VLM" },
        { value: "audio", label: "Audio" },
        { value: "emb", label: "Embedding" },
        { value: "rerank", label: "Reranker" },
    ];

    $effect(() => {
        if (dialogOpen) {
            setTimeout(() => searchInputEl?.focus(), 50);
        }
    });

    const loadedModels = $derived.by(() => {
        const serverModels = (openarc.status?.models || []).map(
            (info: any) => ({
                id: info.model_name,
                name: info.model_name,
                type: info.model_type || "UNKNOWN",
                context: "-",
                size: "-",
                status: info.status,
                optimistic: false as const,
            }),
        );

        const serverNames = new Set(serverModels.map((m: any) => m.name));

        const optimisticEntries = Object.entries(openarc.optimisticLoads)
            .filter(([name]) => !serverNames.has(name))
            .map(([name, entry]) => ({
                id: name,
                name: name,
                type: entry.modelInfo.type,
                context: "-",
                size: "-",
                status: entry.status,
                optimistic: true as const,
                error: entry.error,
            }));

        return [...serverModels, ...optimisticEntries];
    });

    const availableModels = $derived(
        openarc.localModels?.models?.map((m: any) => {
            const declared = m.model_type;
            const detected = declared
                ? null
                : detectModelType(m.model_name, m.id, m.path);
            return {
                id: m.id,
                name: m.model_name || m.id,
                type: declared || detected || "UNKNOWN",
                context: "-",
                size: "-",
                status: "Ready",
                path: m.path,
                hasConfig: m.has_config,
            };
        }) || [],
    );

    const filteredLoadedModels = $derived.by(() => {
        let result = loadedModels;

        if (modelSearch.trim()) {
            const q = modelSearch.toLowerCase().trim();
            result = result.filter(
                (m: any) =>
                    m.name.toLowerCase().includes(q) ||
                    m.type.toLowerCase().includes(q),
            );
        }

        if (modelTypeFilter !== "all") {
            result = result.filter((m: any) => {
                const cat = getModelCategory(m.type);
                switch (modelTypeFilter) {
                    case "llm":
                        return cat === "LLM";
                    case "vlm":
                        return cat === "VLM";
                    case "audio":
                        return cat === "STT" || cat === "TTS";
                    case "emb":
                        return cat === "EMB";
                    case "rerank":
                        return cat === "RERANK";
                    default:
                        return true;
                }
            });
        }

        return result;
    });

    const filteredAvailableModels = $derived.by(() => {
        let result = availableModels.filter(
            (m: any) => !loadedModels.find((lm: any) => lm.name === m.name),
        );

        if (modelSearch.trim()) {
            const q = modelSearch.toLowerCase().trim();
            result = result.filter(
                (m: any) =>
                    m.name.toLowerCase().includes(q) ||
                    m.type.toLowerCase().includes(q),
            );
        }

        if (modelTypeFilter !== "all") {
            result = result.filter((m: any) => {
                const cat = getModelCategory(m.type);
                switch (modelTypeFilter) {
                    case "llm":
                        return cat === "LLM";
                    case "vlm":
                        return cat === "VLM";
                    case "audio":
                        return cat === "STT" || cat === "TTS";
                    case "emb":
                        return cat === "EMB";
                    case "rerank":
                        return cat === "RERANK";
                    default:
                        return true;
                }
            });
        }

        return result;
    });

    $effect(() => {
        if (!dialogOpen) {
            modelSearch = "";
            modelTypeFilter = "all";
        }
    });

    const unifiedModels = $derived.by(() => {
        const map = new Map();
        availableModels.forEach((m: any) =>
            map.set(m.name, { ...m, isLoaded: false }),
        );
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

    const activeLlm = $derived(
        loadedModels.find((m: any) => m.name === appState.activeLlmModel) ||
            null,
    );
    const activeStt = $derived(
        loadedModels.find((m: any) => m.name === appState.activeSttModel) ||
            null,
    );
    const activeTts = $derived(
        loadedModels.find((m: any) => m.name === appState.activeTtsModel) ||
            null,
    );

    const isLoadedOrLoading = (status: string | undefined) =>
        status === "loaded" || status === "loading";

    const isLlmOrVlm = (type: string) => {
        const cat = getModelCategory(type);
        return cat === "LLM" || cat === "VLM";
    };

    $effect(() => {
        // fallback to autoselect if nothing is selected or the selected model was unloaded
        if (!activeLlm && !appState.activeLlmModel) {
            const llm = loadedModels.find((m: any) => {
                const cat = getModelCategory(m.type);
                return (
                    (cat === "LLM" || cat === "VLM") &&
                    isLoadedOrLoading(m.status)
                );
            });
            if (llm) appState.activeLlmModel = llm.name;
        }
        if (!activeStt && !appState.activeSttModel) {
            const stt = loadedModels.find(
                (m: any) =>
                    getModelCategory(m.type) === "STT" &&
                    isLoadedOrLoading(m.status),
            );
            if (stt) appState.activeSttModel = stt.name;
        }
        if (!activeTts && !appState.activeTtsModel) {
            const tts = loadedModels.find(
                (m: any) =>
                    getModelCategory(m.type) === "TTS" &&
                    isLoadedOrLoading(m.status),
            );
            if (tts) appState.activeTtsModel = tts.name;
        }

        // clean up stale selections
        if (
            appState.activeLlmModel &&
            !loadedModels.find((m: any) => m.name === appState.activeLlmModel)
        )
            appState.activeLlmModel = null;
        if (
            appState.activeSttModel &&
            !loadedModels.find((m: any) => m.name === appState.activeSttModel)
        )
            appState.activeSttModel = null;
        if (
            appState.activeTtsModel &&
            !loadedModels.find((m: any) => m.name === appState.activeTtsModel)
        )
            appState.activeTtsModel = null;
    });

    const handleLoad = async (model: any, device: string = "AUTO") => {
        const entry =
            resolveModelType(model.type || model.architecture) ??
            resolveModelType("llm")!;

        try {
            appState.addLog(
                "v1",
                `Requesting load for model: ${model.name}`,
                `Device: ${device}, Engine: ${entry.engine}`,
            );
            await openarc.loadModel({
                model_path: model.path,
                model_name: model.name,
                model_type: entry.value,
                engine: entry.engine,
                device: device,
                runtime_config: {},
            });
        } catch (e) {
            console.error("Failed to load model:", e);
        }
    };

    const initiateLoad = (model: any) => {
        appState.addLog("v2", `Initiating load for model: ${model.name}`);
        dialogOpen = false;
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
        if (model.status === "loaded" && isLlmOrVlm(model.type)) {
            appState.activeLlmModel = model.name;
        }
    };

    const handleUnload = async (name: string) => {
        appState.addLog("v1", `Requesting unload for model: ${name}`);
        try {
            await openarc.unloadModel({ model_name: name });
        } catch (e) {
            appState.addLog(
                "error",
                `Failed to unload model ${name}`,
                String(e),
            );
            console.error(e);
        }
    };

    const activeDownloads = $derived(
        (openarc.downloads?.models ?? []).filter(
            (d: any) => d.status === "downloading" || d.status === "paused",
        ),
    );

    let dismissedCompleted = $state<Set<string>>(new Set());

    const completedDownloads = $derived(
        (openarc.downloads?.models ?? []).filter(
            (d: any) =>
                d.status === "completed" &&
                !dismissedCompleted.has(d.model_name),
        ),
    );

    function clearCompletedDownloads() {
        const allCompleted = (openarc.downloads?.models ?? []).filter(
            (d: any) => d.status === "completed",
        );
        for (const d of allCompleted) {
            dismissedCompleted.add(d.model_name);
        }
        appState.addLog(
            "v1",
            `Cleared ${allCompleted.length} completed download(s) from view`,
        );
    }
</script>

<header
    class="h-12 border-b flex items-center justify-between px-4 bg-background relative"
>
    <div class="flex items-center w-[120px] z-10">
        <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8 text-muted-foreground hover:text-foreground"
            onclick={() => {
                appState.leftPanelOpen = !appState.leftPanelOpen;
                appState.addLog(
                    "v2",
                    "Toggled left panel",
                    `State: ${appState.leftPanelOpen}`,
                );
            }}
        >
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
                            <div
                                class="absolute -inset-0.5 bg-primary/20 blur-xl rounded-lg animate-pulse z-0 pointer-events-none transition-all duration-700"
                            ></div>
                        {/if}
                        <Button
                            {...props}
                            variant="outline"
                            class="w-full justify-between shadow-sm relative z-10 transition-all duration-300 border-muted/50 hover:border-primary/50 hover:bg-muted/30 h-10 px-3 {dialogOpen
                                ? 'border-primary/50 bg-muted/40 ring-2 ring-primary/20'
                                : 'bg-background/50 backdrop-blur-sm'}"
                        >
                            <div
                                class="flex items-center gap-2.5 overflow-hidden"
                            >
                                <div
                                    class="flex items-center justify-center w-6 h-6 rounded bg-primary/10 text-primary shrink-0 transition-colors group-hover:bg-primary/20"
                                >
                                    <Sparkles class="w-3.5 h-3.5" />
                                </div>
                                <div
                                    class="flex flex-col items-start overflow-hidden"
                                >
                                    <span
                                        class="text-[10px] font-bold tracking-wider uppercase text-muted-foreground leading-none mb-0.5"
                                        >Active Models</span
                                    >
                                    <span
                                        class="font-semibold text-[13px] truncate max-w-[440px] leading-tight flex items-center gap-2"
                                    >
                                        {#if activeLlm}
                                            {activeLlm.name}
                                        {:else}
                                            No Model Active
                                        {/if}

                                        {#if activeLlm?.status === "loading"}
                                            <span
                                                class="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold uppercase tracking-wider animate-pulse"
                                            >
                                                <span
                                                    class="w-1.5 h-1.5 rounded-full bg-amber-500"
                                                ></span>
                                                Loading
                                            </span>
                                        {/if}
                                    </span>
                                </div>
                            </div>
                            <ChevronDown
                                class="w-4 h-4 text-muted-foreground transition-transform duration-300 group-hover:text-foreground {dialogOpen
                                    ? 'rotate-180 text-foreground'
                                    : ''}"
                            />
                        </Button>
                    </div>
                {/snippet}
            </Dialog.Trigger>

            <Dialog.Content
                showCloseButton={false}
                class="sm:max-w-[850px] p-0 top-[10%] left-1/2 -translate-x-1/2 translate-y-0 gap-0 overflow-hidden flex flex-col h-[80vh] shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] border-muted/50 bg-background/95 backdrop-blur-2xl rounded-2xl ring-1 ring-inset ring-white/10"
            >
                <Dialog.Title class="sr-only">Model Selector</Dialog.Title>

                <div
                    class="relative shrink-0 z-10 bg-gradient-to-b from-muted/30 to-muted/10 border-b border-white/5 backdrop-blur-md"
                >
                    <div class="flex items-center gap-2.5 px-4 pt-3 pb-2">
                        <div
                            class="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
                        >
                            <Sparkles class="w-3 h-3 text-primary" />
                        </div>
                        <h2
                            class="text-[13px] font-bold tracking-tight leading-none shrink-0"
                        >
                            Model selector
                        </h2>
                        <div class="relative flex-1 min-w-0">
                            <Search
                                class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"
                            />
                            <input
                                bind:this={searchInputEl}
                                bind:value={modelSearch}
                                placeholder="Search models..."
                                class="w-full h-8 pl-8 pr-3 bg-background/60 border border-muted/50 rounded-md text-[13px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors"
                            />
                        </div>
                        <Dialog.Close
                            class="flex items-center justify-center h-7 w-7 rounded-full bg-background/50 hover:bg-destructive/10 text-muted-foreground hover:text-destructive border border-transparent hover:border-destructive/20 transition-all shrink-0"
                        >
                            <X class="w-3.5 h-3.5" />
                        </Dialog.Close>
                    </div>

                    <div class="flex items-center gap-1 px-4 pb-2 flex-wrap">
                        {#each modelTypeFilters as filter}
                            <button
                                type="button"
                                aria-pressed={modelTypeFilter === filter.value}
                                onclick={() => (modelTypeFilter = filter.value)}
                                class="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors {modelTypeFilter ===
                                filter.value
                                    ? 'bg-foreground text-background border-foreground'
                                    : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/50'}"
                            >
                                {filter.label}
                            </button>
                        {/each}
                    </div>

                    <div
                        class="h-[2px] w-full bg-gradient-to-r from-primary/40 via-primary/70 to-primary/40"
                    ></div>
                </div>

                <ScrollArea
                    class="flex-1 min-h-0 bg-background overflow-hidden"
                    orientation="vertical"
                >
                    <table class="w-full table-fixed border-collapse m-0 p-0">
                        <thead
                            class="bg-muted/30 border-b border-white/5 sticky top-0 z-10 backdrop-blur-sm text-left"
                        >
                            <tr class="hover:bg-transparent border-none">
                                <th
                                    class="h-8 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 px-3 w-[42%]"
                                    >Model</th
                                >
                                <th
                                    class="h-8 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 px-3 w-[13%]"
                                    >Type</th
                                >
                                <th
                                    class="h-8 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 px-3 w-[15%]"
                                    >Context</th
                                >
                                <th
                                    class="h-8 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 px-3 w-[15%]"
                                    >Size</th
                                >
                                <th class="h-8 px-3 text-right w-[15%]"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {#if filteredLoadedModels.length > 0}
                                <tr
                                    class="bg-muted/10 hover:bg-muted/10 border-b border-white/5"
                                >
                                    <td colspan="5" class="py-1 px-3">
                                        <div class="flex items-center gap-2.5">
                                            <div
                                                class="flex items-center justify-center w-5 h-5 rounded bg-primary/10 border border-primary/20"
                                            >
                                                <Cpu
                                                    class="w-3 h-3 text-primary"
                                                />
                                            </div>
                                            <h3
                                                class="text-[9px] font-bold uppercase tracking-widest text-foreground flex items-center gap-1.5"
                                            >
                                                Loaded in Memory
                                                <span
                                                    class="inline-flex items-center justify-center bg-primary/20 text-primary text-[8px] h-3 w-3 rounded-full font-black"
                                                >
                                                    {filteredLoadedModels.length}
                                                </span>
                                            </h3>
                                        </div>
                                    </td>
                                </tr>
                                {#each filteredLoadedModels as model}
                                    <tr
                                        class="group border-b border-white/5 last:border-0 transition-all {model.status ===
                                        'failed'
                                            ? 'hover:bg-red-500/5 cursor-pointer'
                                            : model.status === 'loaded' &&
                                                isLlmOrVlm(model.type)
                                              ? 'hover:bg-muted/30 cursor-pointer'
                                              : model.status === 'loaded'
                                                ? 'hover:bg-muted/15'
                                                : 'hover:bg-muted/30 cursor-pointer'} {isLlmOrVlm(
                                            model.type,
                                        ) && activeLlm?.name === model.name
                                            ? 'bg-primary/5 hover:bg-primary/10'
                                            : ''}"
                                        onclick={() => {
                                            if (
                                                model.status === "failed" &&
                                                model.optimistic
                                            ) {
                                                openarc.dismissOptimisticLoad(
                                                    model.name,
                                                );
                                            } else if (
                                                model.status === "loaded" &&
                                                isLlmOrVlm(model.type)
                                            ) {
                                                selectLoadedModel(model);
                                            }
                                        }}
                                    >
                                        <td class="py-1.5 px-3 overflow-hidden">
                                            <div
                                                class="flex items-center gap-2 overflow-hidden w-full"
                                            >
                                                <span
                                                    class="font-bold text-foreground text-[13px] truncate"
                                                    >{model.name}</span
                                                >
                                                {#if model.status === "failed"}
                                                    <span
                                                        class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-red-500/10 border border-red-500/20 text-red-500 text-[9px] font-bold uppercase tracking-wider shrink-0"
                                                        title={model.error ||
                                                            "Model failed to load"}
                                                    >
                                                        <XCircle
                                                            class="w-2.5 h-2.5 text-red-500 shrink-0"
                                                        />
                                                        Failed
                                                    </span>
                                                {:else if model.status === "loading"}
                                                    <span
                                                        class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[9px] font-bold uppercase tracking-wider shrink-0"
                                                    >
                                                        <span
                                                            class="relative flex h-1 w-1"
                                                        >
                                                            <span
                                                                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"
                                                            ></span>
                                                            <span
                                                                class="relative inline-flex rounded-full h-1 w-1 bg-amber-500"
                                                            ></span>
                                                        </span>
                                                        Loading
                                                    </span>
                                                {:else if isLlmOrVlm(model.type) && activeLlm?.name === model.name}
                                                    <span
                                                        class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-primary/10 border border-primary/20 text-primary text-[9px] font-bold uppercase tracking-wider shadow-[0_0_10px_rgba(var(--primary),0.1)] shrink-0"
                                                    >
                                                        <CheckCircle2
                                                            class="w-2.5 h-2.5 text-primary shrink-0"
                                                        />
                                                        Active
                                                    </span>
                                                {:else if isLlmOrVlm(model.type)}
                                                    <span
                                                        class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-bold uppercase tracking-wider shrink-0"
                                                    >
                                                        <span
                                                            class="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                                                        ></span>
                                                        Idle
                                                    </span>
                                                {:else}
                                                    <span
                                                        class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[9px] font-bold uppercase tracking-wider shrink-0"
                                                    >
                                                        <span
                                                            class="w-1 h-1 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]"
                                                        ></span>
                                                        Loaded
                                                    </span>
                                                {/if}
                                            </div>
                                        </td>
                                        <td class="py-1.5 px-3 overflow-hidden">
                                            <span
                                                class="inline-flex items-center max-w-full rounded bg-muted/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground shadow-sm ring-1 ring-inset ring-muted-foreground/20"
                                                title={model.type}
                                            >
                                                <span class="truncate"
                                                    >{model.type}</span
                                                >
                                            </span>
                                        </td>
                                        <td
                                            class="py-1.5 px-3 text-muted-foreground/80 text-[12px] font-medium truncate"
                                            >{model.context} ctx</td
                                        >
                                        <td
                                            class="py-1.5 px-3 text-muted-foreground/80 text-[12px] font-medium truncate"
                                            >{model.size}</td
                                        >
                                        <td class="py-1.5 px-3 text-right">
                                            {#if model.status === "failed" && model.optimistic}
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    class="h-6 px-2.5 text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 shadow-none z-10 relative rounded-sm opacity-0 group-hover:opacity-100 transition-all duration-300"
                                                    onclick={(e) => {
                                                        e.stopPropagation();
                                                        openarc.dismissOptimisticLoad(
                                                            model.name,
                                                        );
                                                    }}
                                                >
                                                    <X class="w-3 h-3 mr-1" />
                                                    Dismiss
                                                </Button>
                                            {:else}
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    class="h-6 px-2.5 text-[10px] font-bold uppercase tracking-wider bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground border border-destructive/20 shadow-none z-10 relative rounded-sm opacity-0 group-hover:opacity-100 transition-all duration-300"
                                                    onclick={(e) => {
                                                        e.stopPropagation();
                                                        handleUnload(
                                                            model.name,
                                                        );
                                                    }}
                                                    disabled={model.status ===
                                                        "loading"}
                                                >
                                                    <LogOut
                                                        class="w-3 h-3 mr-1"
                                                    />
                                                    Unload
                                                </Button>
                                            {/if}
                                        </td>
                                    </tr>
                                {/each}
                            {/if}

                            {#if filteredAvailableModels.length > 0}
                                <tr
                                    class="bg-muted/10 hover:bg-muted/10 border-b border-white/5 {filteredLoadedModels.length >
                                    0
                                        ? 'border-t border-white/10'
                                        : ''}"
                                >
                                    <td colspan="5" class="py-1 px-3">
                                        <div class="flex items-center gap-2.5">
                                            <div
                                                class="flex items-center justify-center w-5 h-5 rounded bg-muted/50 border border-muted/50"
                                            >
                                                <HardDrive
                                                    class="w-3 h-3 text-muted-foreground"
                                                />
                                            </div>
                                            <h3
                                                class="text-[9px] font-bold uppercase tracking-widest text-foreground flex items-center gap-1.5"
                                            >
                                                Local Library
                                                <span
                                                    class="inline-flex items-center justify-center bg-muted/80 text-muted-foreground text-[8px] px-1 h-3 rounded-full font-black"
                                                >
                                                    {filteredAvailableModels.length}
                                                </span>
                                            </h3>
                                        </div>
                                    </td>
                                </tr>
                                {#each filteredAvailableModels as model}
                                    <tr
                                        class="group cursor-pointer hover:bg-muted/40 transition-colors border-white/5"
                                        onclick={() => initiateLoad(model)}
                                    >
                                        <td class="py-1.5 px-3 overflow-hidden">
                                            <div
                                                class="flex items-center gap-2 overflow-hidden w-full"
                                            >
                                                <span
                                                    class="font-bold text-[13px] text-foreground/90 group-hover:text-primary transition-colors truncate"
                                                    >{model.name}</span
                                                >
                                                {#if !model.hasConfig}
                                                    <AlertTriangle
                                                        class="w-3.5 h-3.5 text-amber-500/80 drop-shadow-sm shrink-0"
                                                        title="Missing configuration"
                                                    />
                                                {/if}
                                            </div>
                                        </td>
                                        <td class="py-1.5 px-3 overflow-hidden">
                                            <span
                                                class="inline-flex items-center max-w-full rounded bg-muted/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground shadow-sm ring-1 ring-inset ring-muted-foreground/20"
                                                title={model.type}
                                            >
                                                <span class="truncate"
                                                    >{model.type}</span
                                                >
                                            </span>
                                        </td>
                                        <td
                                            class="py-1.5 px-3 text-[12px] font-medium text-muted-foreground/70 truncate"
                                            >{model.context}</td
                                        >
                                        <td
                                            class="py-1.5 px-3 text-[12px] font-medium text-muted-foreground/70 truncate"
                                            >{model.size}</td
                                        >
                                        <td class="py-1.5 px-3 text-right">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                class="h-6 px-3 text-[10px] font-bold tracking-wider uppercase shadow-sm bg-secondary/80 text-foreground group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all opacity-0 group-hover:opacity-100 rounded-sm"
                                            >
                                                Load
                                            </Button>
                                        </td>
                                    </tr>
                                {/each}
                            {/if}

                            {#if filteredLoadedModels.length === 0 && filteredAvailableModels.length === 0 && (loadedModels.length > 0 || availableModels.length > 0)}
                                <tr>
                                    <td
                                        colspan="5"
                                        class="py-10 px-3 text-center"
                                    >
                                        <div
                                            class="flex flex-col items-center gap-2 text-muted-foreground"
                                        >
                                            <Search
                                                class="w-6 h-6 opacity-40"
                                            />
                                            <span class="text-sm font-medium"
                                                >No models match your search</span
                                            >
                                            <span
                                                class="text-xs text-muted-foreground/60"
                                                >Try adjusting the filter or
                                                search query</span
                                            >
                                        </div>
                                    </td>
                                </tr>
                            {/if}
                        </tbody>
                    </table>
                </ScrollArea>

                <div
                    class="h-12 px-5 border-t border-white/5 flex items-center bg-muted/20 shrink-0 backdrop-blur-md rounded-b-2xl"
                >
                    <div class="flex items-center gap-3">
                        <Switch
                            id="default-vals"
                            bind:checked={useDefaultValues}
                        />
                        <label
                            for="default-vals"
                            class="flex flex-col justify-center cursor-pointer"
                        >
                            <div class="flex items-center gap-2">
                                <span
                                    class="text-[11px] font-bold tracking-wider uppercase text-foreground"
                                    >Auto-configure settings</span
                                >
                                <span
                                    class="text-[10px] font-medium text-muted-foreground/60"
                                    >— Skip manual device config prompts</span
                                >
                            </div>
                        </label>
                    </div>
                </div>
            </Dialog.Content>
        </Dialog.Root>
    </div>

    <div class="flex items-center justify-end gap-1 w-[120px]">
        <div class="relative">
            <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8 text-muted-foreground hover:text-foreground relative"
                onclick={() => {
                    downloadsOpen = !downloadsOpen;
                    appState.addLog(
                        "v2",
                        "Toggled downloads dropdown",
                        `State: ${downloadsOpen}`,
                    );
                }}
            >
                <Download class="w-4 h-4" />
                {#if openarc.downloads?.models?.some((d: any) => d.status === "downloading" || d.status === "paused")}
                    <span
                        class="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse"
                    ></span>
                {/if}
            </Button>

            {#if downloadsOpen}
                <button
                    type="button"
                    class="fixed inset-0 z-40 bg-transparent border-0 w-full h-full cursor-default"
                    aria-label="Close downloads menu"
                    onclick={() => (downloadsOpen = false)}
                ></button>
                <div
                    class="absolute top-full right-0 mt-2 w-80 bg-background border rounded-lg shadow-lg z-50 overflow-hidden flex flex-col"
                >
                    <div
                        class="p-3 border-b font-medium text-sm flex justify-between items-center bg-muted/10"
                    >
                        <span>Downloads</span>
                        {#if activeDownloads.length > 0}
                            <span
                                class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full"
                                >{activeDownloads.length}</span
                            >
                        {/if}
                    </div>

                    <div class="p-3 space-y-4 max-h-[300px] overflow-y-auto">
                        {#if activeDownloads.length > 0}
                            {#each activeDownloads as download, i}
                                <div
                                    class="space-y-2 pb-2 {i <
                                    activeDownloads.length - 1
                                        ? 'border-b'
                                        : ''}"
                                >
                                    <div class="flex justify-between text-sm">
                                        <span
                                            class="font-medium truncate pr-2"
                                            title={download.model_name}
                                            >{download.model_name}</span
                                        >
                                        <span
                                            class="text-muted-foreground text-xs shrink-0"
                                            >{download.progress}%</span
                                        >
                                    </div>
                                    <div
                                        class="h-1.5 w-full bg-muted rounded-full overflow-hidden"
                                    >
                                        <div
                                            class="h-full bg-primary transition-all duration-300"
                                            style="width: {download.progress}%"
                                        ></div>
                                    </div>
                                    <div
                                        class="flex justify-between items-center text-xs text-muted-foreground pt-1"
                                    >
                                        <span
                                            class="capitalize flex items-center gap-1"
                                        >
                                            {#if download.status === "downloading"}
                                                <Loader2
                                                    class="w-3 h-3 animate-spin"
                                                />
                                            {:else if download.status === "paused"}
                                                <Pause class="w-3 h-3" />
                                            {/if}
                                            {download.status}
                                        </span>
                                        <div class="flex gap-1">
                                            {#if download.status === "downloading"}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    class="h-6 w-6"
                                                    onclick={() =>
                                                        openarc.pauseDownload(
                                                            download.model_name,
                                                        )}
                                                >
                                                    <Pause class="w-3 h-3" />
                                                </Button>
                                            {:else if download.status === "paused"}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    class="h-6 w-6"
                                                    onclick={() =>
                                                        openarc.resumeDownload(
                                                            download.model_name,
                                                        )}
                                                >
                                                    <Play class="w-3 h-3" />
                                                </Button>
                                            {/if}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                class="h-6 w-6 hover:text-destructive"
                                                onclick={() =>
                                                    openarc.cancelDownload(
                                                        download.model_name,
                                                    )}
                                            >
                                                <X class="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        {/if}
                        {#if completedDownloads.length > 0}
                            {#if activeDownloads.length > 0}
                                <div class="border-t pt-3"></div>
                            {/if}
                            <div class="flex items-center justify-between mb-1">
                                <span
                                    class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60"
                                    >Completed</span
                                >
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    class="h-5 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-destructive"
                                    onclick={clearCompletedDownloads}
                                >
                                    <Trash2 class="w-3 h-3 mr-1" /> Clean
                                </Button>
                            </div>
                            {#each completedDownloads as download, i}
                                <div
                                    class="space-y-1.5 pb-2 {i <
                                    completedDownloads.length - 1
                                        ? 'border-b border-border/50'
                                        : ''}"
                                >
                                    <div
                                        class="flex items-center justify-between text-sm"
                                    >
                                        <span
                                            class="font-medium truncate pr-2 text-foreground/80"
                                            title={download.model_name}
                                            >{download.model_name}</span
                                        >
                                        <span
                                            class="inline-flex items-center gap-1 text-emerald-500 text-xs shrink-0 font-semibold"
                                        >
                                            <CheckCircle2 class="w-3 h-3" /> Done
                                        </span>
                                    </div>
                                    <div
                                        class="h-1.5 w-full bg-muted rounded-full overflow-hidden"
                                    >
                                        <div
                                            class="h-full bg-emerald-500 transition-all duration-300"
                                            style="width: 100%"
                                        ></div>
                                    </div>
                                </div>
                            {/each}
                        {/if}
                        {#if activeDownloads.length === 0 && completedDownloads.length === 0}
                            <div
                                class="text-center text-sm text-muted-foreground py-4"
                            >
                                No active downloads.
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>

        <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8 text-muted-foreground hover:text-foreground"
            onclick={() => {
                appState.rightPanelOpen = !appState.rightPanelOpen;
                appState.addLog(
                    "v2",
                    "Toggled right panel",
                    `State: ${appState.rightPanelOpen}`,
                );
            }}
        >
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
                    hasConfig: true,
                };
                selectedModelForLoad = updatedModel;
                deviceModalOpen = true;
            }
        }}
    />
</header>
