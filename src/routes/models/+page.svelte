<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Textarea } from "$lib/components/ui/textarea";
    import { ScrollArea } from "$lib/components/ui/scroll-area";
    import * as Dialog from "$lib/components/ui/dialog";
    import {
        Search,
        Trash2,
        Play,
        HardDrive,
        FolderOpen,
        Pencil,
        Loader2,
        AlertTriangle,
        Zap,
        Settings2,
        ChevronDown,
        Bot,
        CheckCircle2,
        Sparkles,
    } from "@lucide/svelte";
    import { appState } from "$lib/state.svelte.js";
    import { openarc } from "$lib/client.svelte.js";
    import {
        MODEL_TYPES,
        detectModelType,
        getArchColor,
        getArchAccent,
        getModelCategory,
        resolveModelType,
        type ModelTypeCategory,
    } from "$lib/model-types";

    import ModelConfigModal from "$lib/components/layout/ModelConfigModal.svelte";
    import DeviceSelectionModal from "$lib/components/layout/DeviceSelectionModal.svelte";
    import VramEstimator from "$lib/components/layout/VramEstimator.svelte";

    let searchQuery = $state("");
    let configModalOpen = $state(false);
    let deviceModalOpen = $state(false);
    let deleteModalOpen = $state(false);
    let draftDropdownOpen = $state(false);
    let selectedModelForConfig = $state<any>(null);
    let selectedModelForLoad = $state<any>(null);
    let modelToDelete = $state<any>(null);
    let isDeleting = $state(false);

    const confirmDelete = async () => {
        if (!modelToDelete) return;
        isDeleting = true;
        appState.addLog("v1", `Deleting model ${modelToDelete.name}...`);
        try {
            await openarc.deleteLocalModel(modelToDelete.path);
            appState.addLog(
                "info",
                `Successfully deleted model ${modelToDelete.name}`,
            );
            deleteModalOpen = false;
            modelToDelete = null;
            if (selectedModelId === modelToDelete?.id) selectedModelId = null;
        } catch (e: any) {
            console.error("Failed to delete model", e);
            appState.addLog(
                "error",
                `Failed to delete model ${modelToDelete.name}`,
                e.toString(),
            );
        } finally {
            isDeleting = false;
        }
    };

    let selectedArchitectures = $state<Record<ModelTypeCategory, boolean>>({
        LLM: true,
        VLM: true,
        TTS: true,
        STT: true,
        EMB: true,
        RERANK: true,
    });
    let sortBy = $state("name");

    const CATEGORIES: Array<{
        id: ModelTypeCategory;
        label: string;
        description: string;
    }> = [
        { id: "LLM", label: "Language", description: "Text generation" },
        { id: "VLM", label: "Vision", description: "Vision-language" },
        { id: "STT", label: "Speech-to-Text", description: "Whisper, Qwen3 ASR" },
        { id: "TTS", label: "Text-to-Speech", description: "Kokoro, Qwen3 TTS" },
        { id: "EMB", label: "Embeddings", description: "Embedding models" },
        { id: "RERANK", label: "Rerankers", description: "Cross-encoder" },
    ];

    const models = $derived(
        openarc.localModels?.models?.map((m: any) => {
            const name = m.model_name || m.id;
            const declared = resolveModelType(m.model_type);
            const detected = declared
                ? null
                : resolveModelType(detectModelType(name, m.id, m.path));
            const architecture = (declared ?? detected)?.label ?? "UNKNOWN";
            return {
                id: m.id,
                name,
                size: "-",
                architecture,
                architectureInferred: !declared && !!detected,
                quantization: "-",
                path: m.path,
                dateAdded: "Recently",
                hasConfig: m.has_config,
                engine: m.engine,
                vlmType: m.vlm_type,
                draftModelPath: m.draft_model_path,
                draftDevice: m.draft_device,
                numAssistantTokens: m.num_assistant_tokens,
                assistantConfidenceThreshold: m.assistant_confidence_threshold,
                runtimeConfig: m.runtime_config,
            };
        }) || [],
    );

    const architectureCounts = $derived.by(() => {
        const counts: Record<string, number> = {
            LLM: 0,
            VLM: 0,
            STT: 0,
            TTS: 0,
            EMB: 0,
            RERANK: 0,
            UNKNOWN: 0,
        };
        for (const m of models) {
            const cat = getModelCategory(m.architecture);
            counts[cat] = (counts[cat] ?? 0) + 1;
        }
        return counts;
    });

    const filteredModels = $derived(
        models
            .filter((m: any) => {
                if (
                    searchQuery.trim() &&
                    !m.name.toLowerCase().includes(searchQuery.toLowerCase())
                ) {
                    return false;
                }
                const archCategory = getModelCategory(m.architecture);
                if (
                    archCategory !== "UNKNOWN" &&
                    !selectedArchitectures[archCategory]
                ) {
                    return false;
                }
                return true;
            })
            .sort((a: any, b: any) => {
                if (sortBy === "name") return a.name.localeCompare(b.name);
                if (sortBy === "architecture")
                    return a.architecture.localeCompare(b.architecture);
                return 0;
            }),
    );

    const groupedModels = $derived.by(() => {
        const order: Array<ModelTypeCategory | "UNKNOWN"> = [
            "LLM",
            "VLM",
            "STT",
            "TTS",
            "EMB",
            "RERANK",
            "UNKNOWN",
        ];
        const labels: Record<string, string> = {
            LLM: "Language Models",
            VLM: "Vision-Language Models",
            STT: "Speech-to-Text",
            TTS: "Text-to-Speech",
            EMB: "Embeddings",
            RERANK: "Rerankers",
            UNKNOWN: "Other",
        };
        const groups: Record<string, any[]> = {};
        for (const cat of order) groups[cat] = [];
        for (const m of filteredModels) {
            const cat = getModelCategory(m.architecture);
            (groups[cat] ?? groups.UNKNOWN).push(m);
        }
        return order
            .filter((id) => groups[id].length > 0)
            .map((id) => ({
                id,
                label: labels[id],
                models: groups[id],
            }));
    });

    let selectedModelId = $state<string | null>(null);

    let sidebarModelName = $state("");
    let sidebarModelType = $state("LLM");
    let sidebarEngine = $state("AUTO");
    let sidebarVlmType = $state("");
    let sidebarDraftModelPath = $state("");
    let sidebarDraftDevice = $state("CPU");
    let sidebarNumAssistantTokens = $state<number | null>(null);
    let sidebarAssistantConfidenceThreshold = $state<number | null>(null);
    let sidebarRuntimeConfig = $state("{}");

    let savingSidebar = $state(false);
    let savedSuccess = $state(false);

    function selectModel(model: any) {
        selectedModelId = model.id;
        sidebarModelName = model.name;
        sidebarModelType = (
            resolveModelType(model.architecture) ?? MODEL_TYPES[0]
        ).label;
        sidebarEngine = model.engine || "AUTO";
        sidebarVlmType = model.vlmType || "";
        sidebarDraftModelPath = model.draftModelPath || "";
        sidebarDraftDevice = model.draftDevice || "CPU";
        sidebarNumAssistantTokens = model.numAssistantTokens || null;
        sidebarAssistantConfidenceThreshold =
            model.assistantConfidenceThreshold || null;
        sidebarRuntimeConfig = model.runtimeConfig
            ? JSON.stringify(model.runtimeConfig, null, 2)
            : "{}";
    }

    const saveSidebarConfig = async () => {
        const match = models.find((m: any) => m.id === selectedModelId);
        if (!match || !match.path) return;

        savingSidebar = true;
        savedSuccess = false;
        appState.addLog(
            "v1",
            `Saving sidebar config for ${sidebarModelName}...`,
        );
        try {
            let parsedRuntimeConfig = {};
            try {
                parsedRuntimeConfig = JSON.parse(sidebarRuntimeConfig);
            } catch (e) {
                appState.addLog(
                    "warn",
                    `Failed to parse runtime config JSON for ${sidebarModelName}`,
                    (e as Error).toString(),
                );
            }

            const config: any = {
                model_name: sidebarModelName,
                model_type: sidebarModelType,
                engine: sidebarEngine === "AUTO" ? null : sidebarEngine,
                vlm_type: sidebarVlmType || null,
                draft_model_path: sidebarDraftModelPath || null,
                draft_device: sidebarDraftDevice || "CPU",
                num_assistant_tokens: sidebarNumAssistantTokens || null,
                assistant_confidence_threshold:
                    sidebarAssistantConfidenceThreshold || null,
                runtime_config: parsedRuntimeConfig,
            };
            await openarc.updateModelConfig(match.path, config);
            appState.addLog(
                "info",
                `Successfully updated sidebar config for ${sidebarModelName}`,
            );
            savedSuccess = true;
            setTimeout(() => {
                savedSuccess = false;
            }, 2000);
        } catch (e: any) {
            console.error("Failed to save config", e);
            appState.addLog(
                "error",
                `Failed to save sidebar config for ${sidebarModelName}`,
                e.toString(),
            );
        } finally {
            savingSidebar = false;
        }
    };

    const getModelStatus = (name: string) => {
        const statusModels = openarc.status?.models || [];
        const match = statusModels.find((m: any) => m.model_name === name);
        if (match) return match.status;
        const optimistic = openarc.optimisticLoads[name];
        if (optimistic) return optimistic.status;
        return "unloaded";
    };

    const handleLoad = async (model: any, device: string = "AUTO") => {
        const entry =
            resolveModelType(model.architecture || model.type) ??
            resolveModelType("llm")!;
        const modelType = entry.value;
        const engine =
            model.engine && model.engine !== "AUTO"
                ? model.engine
                : entry.engine;

        appState.addLog(
            "v1",
            `Queuing model load for ${model.name}...`,
            `Type: ${modelType}, Engine: ${engine}, Device: ${device}`,
        );
        try {
            await openarc.loadModel({
                model_path: model.path,
                model_name: model.name,
                model_type: modelType,
                engine: engine,
                device: device,
                vlm_type: model.vlmType || null,
                draft_model_path: model.draftModelPath || null,
                draft_device: model.draftDevice || null,
                num_assistant_tokens: model.numAssistantTokens
                    ? Number(model.numAssistantTokens)
                    : null,
                assistant_confidence_threshold:
                    model.assistantConfidenceThreshold
                        ? Number(model.assistantConfidenceThreshold)
                        : null,
                runtime_config: model.runtimeConfig || {},
            });
            appState.addLog(
                "info",
                `Successfully initiated load for ${model.name}`,
            );
        } catch (e: any) {
            console.error("Failed to load model:", e);
            appState.addLog(
                "error",
                `Failed to load model ${model.name}`,
                e.toString(),
            );
        }
    };

    const triggerLoad = (model: any) => {
        if (!model.hasConfig || model.architecture === "UNKNOWN") {
            selectedModelForConfig = model;
            configModalOpen = true;
            return;
        }
        selectedModelForLoad = model;
        deviceModalOpen = true;
    };

    import { onMount } from "svelte";
    onMount(() => {
        appState.addLog(
            "info",
            "Models page initialized, refreshing local models...",
        );
        openarc.refreshLocalModels();
    });
</script>

<div class="flex h-full w-full overflow-hidden bg-background">
    {#if appState.leftPanelOpen}
        <aside
            class="w-[300px] shrink-0 border-r bg-muted/10 flex flex-col h-full overflow-hidden"
        >
            <!-- Sidebar header -->
            <div
                class="shrink-0 px-4 pt-4 pb-3 border-b bg-gradient-to-b from-muted/30 to-transparent"
            >
                <div class="flex items-center gap-2.5 mb-3">
                    <div
                        class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
                    >
                        <HardDrive class="w-4 h-4 text-primary" />
                    </div>
                    <div class="min-w-0">
                        <div
                            class="font-bold text-sm tracking-tight leading-tight"
                        >
                            Local library
                        </div>
                        <div
                            class="text-[11px] text-muted-foreground leading-tight mt-0.5"
                        >
                            {models.length} model{models.length !== 1 ? "s" : ""}
                        </div>
                    </div>
                </div>
                <div class="relative">
                    <Search
                        class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                    />
                    <Input
                        id="search"
                        bind:value={searchQuery}
                        placeholder="Search models..."
                        class="pl-9 h-9 bg-background"
                    />
                </div>
            </div>

            <ScrollArea class="flex-1 min-h-0">
                <div class="p-3 space-y-1">
                    <div
                        class="px-1 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70"
                    >
                        Filter by type
                    </div>
                    {#each CATEGORIES as cat}
                        {@const count = architectureCounts[cat.id] ?? 0}
                        {@const active = selectedArchitectures[cat.id]}
                        <button
                            class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md border transition-all
                                {active
                                ? 'bg-background border-border shadow-sm'
                                : 'bg-transparent border-transparent hover:bg-background/60 hover:border-border/60'}"
                            onclick={() =>
                                (selectedArchitectures[cat.id] =
                                    !selectedArchitectures[cat.id])}
                        >
                            <div
                                class="w-1 self-stretch rounded-full {getArchAccent(
                                    cat.id,
                                )} {active ? 'opacity-100' : 'opacity-40'}"
                            ></div>
                            <div class="flex-1 min-w-0 text-left">
                                <div
                                    class="text-sm font-medium truncate {active
                                        ? 'text-foreground'
                                        : 'text-muted-foreground'}"
                                >
                                    {cat.label}
                                </div>
                                <div
                                    class="text-[10px] text-muted-foreground/80 truncate"
                                >
                                    {cat.description}
                                </div>
                            </div>
                            <span
                                class="text-xs font-semibold tabular-nums shrink-0 {active
                                    ? 'text-foreground'
                                    : 'text-muted-foreground'}"
                            >
                                {count}
                            </span>
                        </button>
                    {/each}
                </div>
            </ScrollArea>
        </aside>
    {/if}

    <main class="flex-1 h-full flex flex-col min-w-0 bg-background overflow-hidden">
        <header
            class="shrink-0 flex items-center justify-between px-6 py-4 border-b bg-gradient-to-b from-muted/20 to-background"
        >
            <div class="flex items-center gap-3 min-w-0">
                <div class="min-w-0">
                    <h1
                        class="text-base font-bold tracking-tight leading-tight"
                    >
                        My local models
                    </h1>
                    <p
                        class="text-xs text-muted-foreground leading-tight mt-0.5"
                    >
                        {filteredModels.length} of {models.length} shown
                    </p>
                </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
                <label
                    for="sort"
                    class="text-xs font-medium text-muted-foreground"
                >
                    Sort
                </label>
                <select
                    id="sort"
                    bind:value={sortBy}
                    class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer hover:bg-muted/50"
                >
                    <option value="name">Name (A-Z)</option>
                    <option value="dateAdded">Date Added</option>
                    <option value="size">Size</option>
                    <option value="architecture">Type</option>
                </select>
            </div>
        </header>

        {#if models.length === 0}
            <div
                class="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center"
            >
                <div
                    class="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center mb-4"
                >
                    <HardDrive class="w-8 h-8 text-primary/40" />
                </div>
                <p class="text-base font-semibold text-foreground">
                    No local models yet
                </p>
                <p class="text-sm mt-1.5 max-w-sm text-muted-foreground">
                    Download models from the HuggingFace browser to see them
                    listed here.
                </p>
            </div>
        {:else if filteredModels.length === 0}
            <div
                class="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center"
            >
                <div
                    class="w-16 h-16 rounded-2xl bg-muted/40 border border-border flex items-center justify-center mb-4"
                >
                    <Search class="w-7 h-7 text-muted-foreground/60" />
                </div>
                <p class="text-base font-semibold text-foreground">
                    No models match your filter
                </p>
                <p class="text-sm mt-1.5 max-w-sm text-muted-foreground">
                    Try clearing the search or enabling more types in the
                    sidebar.
                </p>
            </div>
        {:else}
            <ScrollArea class="flex-1 min-h-0">
                <div class="p-4 space-y-5">
                    {#each groupedModels as group}
                        <div>
                            <div class="flex items-center gap-2 px-1 py-1.5">
                                <div
                                    class="h-[2px] w-3 rounded-full {getArchAccent(
                                        group.id,
                                    )}"
                                ></div>
                                <span
                                    class="text-[10px] font-bold uppercase tracking-widest text-foreground/80"
                                >
                                    {group.label}
                                </span>
                                <span
                                    class="text-[10px] text-muted-foreground ml-auto tabular-nums"
                                >
                                    {group.models.length}
                                </span>
                            </div>
                            <div class="space-y-1">
                                {#each group.models as model}
                                    {@const status = getModelStatus(model.name)}
                                    {@const isSelected =
                                        selectedModelId === model.id}
                                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                                    <div
                                        class="group relative flex items-center gap-3 px-3 py-2.5 rounded-md border cursor-pointer transition-all
                                            {isSelected
                                            ? 'bg-muted/40 border-primary/50 shadow-sm ring-1 ring-primary/20'
                                            : 'bg-background border-border hover:bg-muted/30 hover:border-border'}"
                                        onclick={() => selectModel(model)}
                                    >
                                        <div
                                            class="w-1 self-stretch rounded-full {getArchAccent(
                                                group.id,
                                            )} {isSelected
                                                ? 'opacity-100'
                                                : 'opacity-60 group-hover:opacity-100'}"
                                        ></div>

                                        <div class="flex-1 min-w-0">
                                            <div
                                                class="flex items-center gap-1.5 mb-0.5"
                                            >
                                                <span
                                                    class="font-semibold text-sm truncate text-foreground"
                                                >
                                                    {model.name}
                                                </span>
                                                {#if !model.hasConfig}
                                                    <span
                                                        title="Missing openarc.json. Setup required."
                                                        class="shrink-0 text-amber-500"
                                                    >
                                                        <AlertTriangle
                                                            class="w-3.5 h-3.5"
                                                        />
                                                    </span>
                                                {/if}
                                                {#if status === "loaded"}
                                                    <CheckCircle2
                                                        class="w-3.5 h-3.5 text-emerald-500 shrink-0"
                                                    />
                                                {:else if status === "loading"}
                                                    <Loader2
                                                        class="w-3.5 h-3.5 text-amber-500 animate-spin shrink-0"
                                                    />
                                                {:else if status === "failed"}
                                                    <span
                                                        class="shrink-0 text-[9px] font-bold text-red-500 px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10 leading-none"
                                                        title={openarc
                                                            .optimisticLoads[
                                                            model.name
                                                        ]?.error ||
                                                            "Model failed to load"}
                                                    >
                                                        FAILED
                                                    </span>
                                                {/if}
                                                <span
                                                    class="ml-auto shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border {getArchColor(
                                                        model.architecture,
                                                    )} {model.architectureInferred
                                                        ? 'border-dashed italic'
                                                        : ''}"
                                                    title={model.architectureInferred
                                                        ? "Inferred from model name. Confirm in setup."
                                                        : undefined}
                                                >
                                                    {model.architecture}
                                                </span>
                                            </div>
                                            <div
                                                class="flex items-center gap-1.5 text-[10.5px] text-muted-foreground truncate"
                                            >
                                                <FolderOpen
                                                    class="w-3 h-3 shrink-0"
                                                />
                                                <span
                                                    class="truncate font-mono"
                                                    title={model.path}
                                                    >{model.path}</span
                                                >
                                                {#if model.engine}
                                                    <span class="text-border"
                                                        >•</span
                                                    >
                                                    <span
                                                        class="shrink-0 uppercase text-[10px] tracking-wider"
                                                        >{model.engine}</span
                                                    >
                                                {/if}
                                            </div>
                                        </div>

                                        <div
                                            class="flex items-center gap-1 shrink-0"
                                        >
                                            {#if !model.hasConfig}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    class="h-8 gap-1.5 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                                                    title="Missing openarc.json. Setup required."
                                                    onclick={(e) => {
                                                        e.stopPropagation();
                                                        selectedModelForConfig =
                                                            model;
                                                        configModalOpen = true;
                                                    }}
                                                >
                                                    <AlertTriangle
                                                        class="w-3.5 h-3.5"
                                                    />
                                                    Setup
                                                </Button>
                                            {:else if status === "failed"}
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    class="h-8 border-red-500/30 text-red-500 hover:bg-red-500/10"
                                                    onclick={(e) => {
                                                        e.stopPropagation();
                                                        openarc.dismissOptimisticLoad(
                                                            model.name,
                                                        );
                                                    }}
                                                >
                                                    Dismiss
                                                </Button>
                                            {:else if status === "loading"}
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    class="h-8 gap-1.5"
                                                    disabled
                                                >
                                                    <Loader2
                                                        class="w-3.5 h-3.5 animate-spin"
                                                    />
                                                    Loading
                                                </Button>
                                            {:else if status === "loaded"}
                                                <span
                                                    class="inline-flex items-center gap-1.5 h-8 px-2.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 rounded-md border border-emerald-500/30 bg-emerald-500/10"
                                                >
                                                    <CheckCircle2
                                                        class="w-3.5 h-3.5"
                                                    />
                                                    Loaded
                                                </span>
                                            {:else}
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    class="h-8 gap-1.5"
                                                    onclick={(e) => {
                                                        e.stopPropagation();
                                                        triggerLoad(model);
                                                    }}
                                                >
                                                    <Play
                                                        class="w-3.5 h-3.5 fill-current"
                                                    />
                                                    Load
                                                </Button>
                                            {/if}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                class="h-8 w-8 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
                                                title="Delete model"
                                                onclick={(e) => {
                                                    e.stopPropagation();
                                                    modelToDelete = model;
                                                    deleteModalOpen = true;
                                                }}
                                            >
                                                <Trash2 class="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/each}
                </div>
            </ScrollArea>
        {/if}
    </main>

    {#if appState.rightPanelOpen}
        <aside
            class="w-[340px] shrink-0 border-l bg-background flex flex-col h-full overflow-hidden"
        >
            {#if selectedModelId}
                {@const selectedModel = filteredModels.find(
                    (m: any) => m.id === selectedModelId,
                )}
                {#if selectedModel}
                    <!-- Accent stripe -->
                    <div
                        class="h-[3px] w-full shrink-0 {getArchAccent(
                            selectedModel.architecture,
                        )}"
                    ></div>

                    <!-- Header -->
                    <div
                        class="px-5 pt-4 pb-4 border-b shrink-0 bg-gradient-to-b from-muted/20 to-transparent"
                    >
                        <div class="flex items-start gap-3 mb-3 pr-8">
                            <div
                                class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center shrink-0"
                            >
                                <span class="text-primary font-bold text-lg">
                                    {selectedModel.architecture[0]}
                                </span>
                            </div>
                            <div class="min-w-0 flex-1">
                                <div
                                    class="text-[10px] uppercase tracking-widest font-bold text-muted-foreground leading-tight"
                                >
                                    {selectedModel.architecture}
                                </div>
                                <h2
                                    class="text-base font-bold tracking-tight leading-tight break-all mt-0.5"
                                >
                                    {selectedModel.name}
                                </h2>
                            </div>
                        </div>

                        <div class="flex flex-wrap items-center gap-1.5">
                            <span
                                class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border"
                            >
                                <span class="text-muted-foreground">Format</span>
                                <span class="font-medium"
                                    >{selectedModel.quantization}</span
                                >
                            </span>
                            <span
                                class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border"
                            >
                                <span class="text-muted-foreground">Size</span>
                                <span class="font-medium"
                                    >{selectedModel.size}</span
                                >
                            </span>
                            {#if selectedModel.engine}
                                <span
                                    class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border"
                                >
                                    <span class="text-muted-foreground"
                                        >Engine</span
                                    >
                                    <span class="font-medium uppercase"
                                        >{selectedModel.engine}</span
                                    >
                                </span>
                            {/if}
                        </div>
                    </div>

                    <!-- Scrollable config body -->
                    <div class="flex-1 overflow-hidden min-h-0">
                        <ScrollArea class="h-full">
                            <div class="p-5 space-y-5">
                                <!-- Location -->
                                <div>
                                    <div
                                        class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2"
                                    >
                                        <FolderOpen class="w-3 h-3" />
                                        Location
                                    </div>
                                    <div
                                        class="bg-muted/30 p-2.5 rounded-md border border-border/60 break-all"
                                    >
                                        <p
                                            class="text-[11px] font-mono text-muted-foreground"
                                        >
                                            {selectedModel.path}
                                        </p>
                                    </div>
                                </div>

                                <!-- Config form -->
                                <div class="space-y-3">
                                    <div
                                        class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                                    >
                                        <Settings2 class="w-3 h-3" />
                                        Configuration
                                    </div>

                                    <div class="grid gap-1.5">
                                        <label
                                            for="sb-name"
                                            class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                                        >
                                            Model name
                                        </label>
                                        <Input
                                            id="sb-name"
                                            bind:value={sidebarModelName}
                                            class="h-8 text-xs bg-background"
                                            placeholder="e.g. Llama-3-8B"
                                        />
                                    </div>

                                    <div class="grid gap-1.5">
                                        <label
                                            for="sb-type"
                                            class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                                        >
                                            Type
                                        </label>
                                        <select
                                            id="sb-type"
                                            bind:value={sidebarModelType}
                                            class="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                                        >
                                            {#each MODEL_TYPES as entry}
                                                <option value={entry.label}
                                                    >{entry.description}</option
                                                >
                                            {/each}
                                        </select>
                                    </div>

                                    <div class="grid gap-1.5">
                                        <label
                                            for="sb-engine"
                                            class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                                        >
                                            Engine
                                        </label>
                                        <select
                                            id="sb-engine"
                                            bind:value={sidebarEngine}
                                            class="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                                        >
                                            <option value="AUTO"
                                                >Auto-detect</option
                                            >
                                            <option value="ovgenai"
                                                >OpenVINO GenAI</option
                                            >
                                            <option value="optimum"
                                                >Optimum Intel</option
                                            >
                                            <option value="openvino"
                                                >Raw OpenVINO</option
                                            >
                                        </select>
                                    </div>

                                    {#if sidebarModelType === "VLM"}
                                        <div
                                            class="grid gap-1.5 animate-in fade-in slide-in-from-top-1"
                                        >
                                            <label
                                                for="sb-vlm"
                                                class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                                            >
                                                Vision token type
                                            </label>
                                            <Input
                                                id="sb-vlm"
                                                bind:value={sidebarVlmType}
                                                class="h-8 text-xs bg-background"
                                                placeholder="e.g. Qwen2-VL, Llava"
                                            />
                                        </div>
                                    {/if}
                                </div>

                                <!-- Speculative decoding -->
                                <div
                                    class="space-y-3 p-3 bg-muted/20 border border-border/50 rounded-lg"
                                >
                                    <div
                                        class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-foreground"
                                    >
                                        <Zap
                                            class="w-3 h-3 text-amber-500"
                                        />
                                        Speculative decoding
                                    </div>

                                    <div class="grid gap-1.5">
                                        <label
                                            for="sb-draft-path"
                                            class="text-[10px] font-medium text-muted-foreground uppercase"
                                        >
                                            Draft model path
                                        </label>
                                        <div class="relative w-full">
                                            <Input
                                                id="sb-draft-path"
                                                bind:value={
                                                    sidebarDraftModelPath
                                                }
                                                onfocus={() =>
                                                    (draftDropdownOpen = true)}
                                                onblur={() =>
                                                    setTimeout(
                                                        () =>
                                                            (draftDropdownOpen = false),
                                                        150,
                                                    )}
                                                class="h-8 text-xs bg-background pr-8"
                                                placeholder="Optional. Select or type path"
                                                autocomplete="off"
                                            />
                                            <button
                                                type="button"
                                                class="absolute right-0 top-0 h-full px-2 flex items-center text-muted-foreground/50 hover:text-foreground"
                                                onpointerdown={(e) => {
                                                    e.preventDefault();
                                                    draftDropdownOpen =
                                                        !draftDropdownOpen;
                                                }}
                                            >
                                                <ChevronDown class="w-4 h-4" />
                                            </button>

                                            {#if draftDropdownOpen}
                                                <div
                                                    class="absolute top-[calc(100%+4px)] left-0 w-full z-50 bg-popover text-popover-foreground border border-border shadow-md rounded-md max-h-48 overflow-y-auto py-1 text-xs"
                                                >
                                                    {#each models.filter((m: any) => m.id !== selectedModelId && (!sidebarDraftModelPath || m.name
                                                                        .toLowerCase()
                                                                        .includes(sidebarDraftModelPath.toLowerCase()) || m.path
                                                                        .toLowerCase()
                                                                        .includes(sidebarDraftModelPath.toLowerCase()))) as model}
                                                        <button
                                                            type="button"
                                                            class="w-full text-left px-2 py-1.5 hover:bg-muted outline-none transition-colors flex flex-col gap-0.5"
                                                            onpointerdown={(
                                                                e,
                                                            ) => {
                                                                e.preventDefault();
                                                                sidebarDraftModelPath =
                                                                    model.path;
                                                                draftDropdownOpen = false;
                                                            }}
                                                        >
                                                            <div
                                                                class="font-medium truncate flex items-center gap-1.5"
                                                            >
                                                                <Bot
                                                                    class="w-3.5 h-3.5 text-muted-foreground/70 shrink-0"
                                                                />
                                                                {model.name}
                                                            </div>
                                                            <div
                                                                class="text-[10px] text-muted-foreground truncate pl-5"
                                                            >
                                                                {model.path}
                                                            </div>
                                                        </button>
                                                    {:else}
                                                        <div
                                                            class="px-2 py-3 text-center text-muted-foreground"
                                                        >
                                                            {#if sidebarDraftModelPath}
                                                                Press enter to
                                                                use custom path.
                                                            {:else}
                                                                No other installed
                                                                models found.
                                                            {/if}
                                                        </div>
                                                    {/each}
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                    <div class="grid grid-cols-2 gap-2">
                                        <div class="grid gap-1.5">
                                            <label
                                                for="sb-draft-device"
                                                class="text-[10px] font-medium text-muted-foreground uppercase"
                                            >
                                                Device
                                            </label>
                                            <Input
                                                id="sb-draft-device"
                                                bind:value={sidebarDraftDevice}
                                                class="h-8 text-xs bg-background"
                                                placeholder="CPU"
                                            />
                                        </div>
                                        <div class="grid gap-1.5">
                                            <label
                                                for="sb-num-tokens"
                                                class="text-[10px] font-medium text-muted-foreground uppercase"
                                            >
                                                Tokens
                                            </label>
                                            <Input
                                                id="sb-num-tokens"
                                                type="number"
                                                bind:value={
                                                    sidebarNumAssistantTokens
                                                }
                                                class="h-8 text-xs bg-background"
                                                placeholder="e.g. 5"
                                            />
                                        </div>
                                    </div>
                                    <div class="grid gap-1.5">
                                        <label
                                            for="sb-conf"
                                            class="text-[10px] font-medium text-muted-foreground uppercase"
                                        >
                                            Confidence threshold
                                        </label>
                                        <Input
                                            id="sb-conf"
                                            type="number"
                                            step="0.1"
                                            bind:value={
                                                sidebarAssistantConfidenceThreshold
                                            }
                                            class="h-8 text-xs bg-background"
                                            placeholder="e.g. 0.4"
                                        />
                                    </div>
                                </div>

                                <!-- Runtime config -->
                                <div class="space-y-2">
                                    <div
                                        class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                                    >
                                        <Settings2 class="w-3 h-3" />
                                        Runtime config (JSON)
                                    </div>
                                    <Textarea
                                        bind:value={sidebarRuntimeConfig}
                                        class="min-h-[80px] font-mono text-xs bg-muted/30 border-border/50 resize-y"
                                        placeholder={"{}"}
                                    />
                                </div>

                                <Button
                                    class="w-full gap-2 transition-all {savedSuccess
                                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20'
                                        : ''}"
                                    variant="outline"
                                    size="sm"
                                    onclick={saveSidebarConfig}
                                    disabled={savingSidebar ||
                                        !sidebarModelName ||
                                        !sidebarModelType}
                                >
                                    {#if savingSidebar}
                                        <Loader2
                                            class="w-4 h-4 animate-spin"
                                        />
                                        Saving...
                                    {:else if savedSuccess}
                                        <CheckCircle2 class="w-4 h-4" />
                                        Saved!
                                    {:else}
                                        <Pencil class="w-4 h-4" />
                                        Save configuration
                                    {/if}
                                </Button>

                                <!-- VRAM estimator -->
                                <div class="pt-2 border-t border-border/50">
                                    <VramEstimator
                                        modelName={selectedModel.name}
                                        modelMetadata={null}
                                    />
                                </div>
                            </div>
                        </ScrollArea>
                    </div>

                    <!-- Footer actions -->
                    <div
                        class="shrink-0 p-4 border-t bg-muted/10 space-y-2"
                    >
                        {#if getModelStatus(selectedModel.name) === "failed"}
                            <Button
                                class="w-full gap-2 font-medium bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500 hover:text-white"
                                onclick={() =>
                                    openarc.dismissOptimisticLoad(
                                        selectedModel.name,
                                    )}
                            >
                                Load failed — Dismiss
                            </Button>
                        {:else if getModelStatus(selectedModel.name) === "loading"}
                            <Button
                                class="w-full gap-2 font-medium bg-amber-500 hover:bg-amber-600 text-white"
                                disabled
                            >
                                <Loader2 class="w-4 h-4 animate-spin" />
                                Loading model...
                            </Button>
                        {:else if getModelStatus(selectedModel.name) === "loaded"}
                            <Button
                                class="w-full gap-2 font-medium"
                                variant="outline"
                                disabled
                            >
                                <CheckCircle2 class="w-4 h-4 text-emerald-500" />
                                {#if getModelCategory(selectedModel.architecture) === "LLM" || getModelCategory(selectedModel.architecture) === "VLM"}
                                    Model is active
                                {:else}
                                    Model is loaded
                                {/if}
                            </Button>
                        {:else}
                            <Button
                                class="w-full gap-2 font-medium"
                                onclick={() => triggerLoad(selectedModel)}
                            >
                                <Play class="w-4 h-4 fill-current" />
                                Load into server
                            </Button>
                        {/if}
                        <Button
                            variant="outline"
                            class="w-full gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                            onclick={() => {
                                modelToDelete = selectedModel;
                                deleteModalOpen = true;
                            }}
                        >
                            <Trash2 class="w-4 h-4" />
                            Delete model
                        </Button>
                    </div>
                {/if}
            {:else}
                <div
                    class="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground"
                >
                    <div
                        class="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center mb-4"
                    >
                        <Sparkles class="w-8 h-8 text-primary/40" />
                    </div>
                    <p class="text-base font-semibold text-foreground">
                        Select a model
                    </p>
                    <p class="text-sm mt-1.5 max-w-sm text-muted-foreground">
                        Click a model from the list to view its details and edit
                        its configuration.
                    </p>
                </div>
            {/if}
        </aside>
    {/if}
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
                architecture: config.model_type,
                hasConfig: true,
            };
            selectedModelForLoad = updatedModel;
            deviceModalOpen = true;
        }
    }}
/>

<Dialog.Root bind:open={deleteModalOpen}>
    <Dialog.Content class="sm:max-w-[400px]">
        <Dialog.Header>
            <Dialog.Title class="flex items-center gap-2 text-destructive">
                <AlertTriangle class="w-5 h-5" />
                Delete Model
            </Dialog.Title>
            <Dialog.Description class="pt-2">
                Are you sure you want to permanently delete <strong
                    >{modelToDelete?.name}</strong
                >?
                <br /><br />
                <span
                    class="text-xs font-mono bg-muted/50 p-1.5 rounded block break-all"
                    >{modelToDelete?.path}</span
                >
                <br />
                This action cannot be undone and will delete the model folder from
                your disk.
            </Dialog.Description>
        </Dialog.Header>
        <Dialog.Footer class="gap-2 sm:gap-0 mt-4">
            <Button
                variant="outline"
                onclick={() => (deleteModalOpen = false)}
                disabled={isDeleting}>Cancel</Button
            >
            <Button
                variant="destructive"
                onclick={confirmDelete}
                disabled={isDeleting}
            >
                {#if isDeleting}
                    <Loader2 class="w-4 h-4 mr-2 animate-spin" /> Deleting...
                {:else}
                    <Trash2 class="w-4 h-4 mr-2" /> Delete Permanently
                {/if}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
