<script lang="ts">
    import { onMount } from "svelte";
    import * as Dialog from "$lib/components/ui/dialog";
    import { Input } from "$lib/components/ui/input";
    import { Button } from "$lib/components/ui/button";
    import { ScrollArea } from "$lib/components/ui/scroll-area";
    import { appState } from "$lib/state.svelte.js";
    import { openarc } from "$lib/client.svelte.js";
    import {
        Search,
        Download,
        Star,
        Cpu,
        CheckCircle2,
        AlertCircle,
        Loader2,
        Play,
        Pause,
        X,
        MemoryStick,
        Sparkles,
    } from "@lucide/svelte";
    import { marked } from "marked";
    import DOMPurify from "dompurify";
    import VramOffloadBar from "$lib/components/layout/VramOffloadBar.svelte";
    import {
        fetchModelMetadata,
        computeOffloadAnalysis,
        buildHardwareInfo,
        type OffloadAnalysis,
        type HuggingFaceModelMetadata,
        type QuantSource,
        encodeRepoId,
    } from "$lib/vram-estimator.js";
    import {
        fetchCuratedManifest,
        getCuratedModels,
        getCuratedCategories,
        getCuratedGroupedByCategory,
        searchCuratedModels,
        isCuratedLoading,
        getCuratedError,
        getCuratedPreset,
        isCuratedModel,
        type CuratedModel,
        type CuratedCategory,
        type CuratedModelPreset,
    } from "$lib/curated-models.svelte.js";
    import {
        MODEL_TYPES,
        getModelCategory,
        type ModelTypeValue,
        type ModelTypeCategory,
    } from "$lib/model-types.js";

    type ModelInfo = {
        id: string;
        name: string;
        author: string;
        recommended: boolean;
        downloads: number;
        tags: string[];
        params: string;
        arch: string;
    };

    type ViewMode = "curated" | "search";

    let searchQuery = $state("");
    let isSearching = $state(false);
    let searchResults = $state<ModelInfo[]>([]);
    let selectedModel = $state<ModelInfo | null>(null);
    let readmeHtml = $state<string>("");
    let isFetchingReadme = $state(false);
    let hfMetadata = $state<HuggingFaceModelMetadata | null>(null);
    let isFetchingMetadata = $state(false);
    let downloadError = $state<string | null>(null);
    let startingDownload = $state(false);
    let viewMode = $state<ViewMode>("curated");
    let activeCategory = $state<string>("all");
    let curatedFetched = $state(false);

    onMount(() => {
        appState.addLog("info", "ModelDownloaderModal component initialized");
        fetchCuratedManifest().then(() => {
            curatedFetched = true;
        });
    });

    $effect(() => {
        if (appState.downloaderOpen && !curatedFetched) {
            fetchCuratedManifest().then(() => {
                curatedFetched = true;
            });
        }
    });

    $effect(() => {
        if (
            appState.downloaderOpen &&
            viewMode === "search" &&
            searchResults.length === 0 &&
            !isSearching
        ) {
            triggerSearch("");
        }
    });

    let lastRefreshOpenState = false;
    $effect(() => {
        const isOpen = appState.downloaderOpen;
        if (isOpen && !lastRefreshOpenState) {
            lastRefreshOpenState = true;
            if (openarc.isOnline) {
                appState.addLog(
                    "v1",
                    "Refreshing remote model list for downloader",
                );
                openarc
                    .refreshLocalModels()
                    .then(() => {
                        const models = openarc.localModels?.models ?? [];
                        const summary = models
                            .map(
                                (m: any) =>
                                    `${m.id}${m.model_name && m.model_name !== m.id ? ` (model_name=${m.model_name})` : ""}`,
                            )
                            .join(", ");
                        appState.addLog(
                            "info",
                            `Remote reports ${models.length} local model(s)`,
                            summary || "(empty list)",
                        );
                    })
                    .catch((e: any) =>
                        appState.addLog(
                            "error",
                            "Failed to refresh local models for downloader",
                            e?.toString?.() ?? String(e),
                        ),
                    );
            } else {
                appState.addLog(
                    "warn",
                    "Downloader opened while remote is offline — downloaded-state detection disabled",
                );
            }
        } else if (!isOpen) {
            lastRefreshOpenState = false;
        }
    });

    const curatedGroups = $derived(getCuratedGroupedByCategory());

    const filteredCuratedGroups = $derived(() => {
        if (activeCategory === "all") return curatedGroups;
        return curatedGroups.filter((g) => g.category.id === activeCategory);
    });

    function getCategoryColor(categoryId: string): string {
        const colors: Record<string, string> = {
            llm: "bg-blue-500/10 text-blue-500 border-blue-500/20",
            vlm: "bg-purple-500/10 text-purple-500 border-purple-500/20",
            stt: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
            tts: "bg-amber-500/10 text-amber-500 border-amber-500/20",
            emb: "bg-pink-500/10 text-pink-500 border-pink-500/20",
            rerank: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
        };
        return (
            colors[categoryId] ?? "bg-muted text-muted-foreground border-border"
        );
    }

    function getCategoryAccent(categoryId: string): string {
        switch (categoryId) {
            case "llm":
                return "bg-blue-500";
            case "vlm":
                return "bg-purple-500";
            case "stt":
                return "bg-emerald-500";
            case "tts":
                return "bg-amber-500";
            case "emb":
                return "bg-pink-500";
            case "rerank":
                return "bg-cyan-500";
            default:
                return "bg-muted-foreground/40";
        }
    }

    function curatedToModelInfo(cm: CuratedModel): ModelInfo {
        return {
            id: cm.id,
            name: cm.name,
            author: cm.author,
            recommended: true,
            downloads: 0,
            tags: cm.tags,
            params: cm.params,
            arch: cm.preset.model_type.toUpperCase(),
        };
    }

    function getPresetSummary(preset: CuratedModelPreset): string {
        const parts: string[] = [];
        const typeEntry = MODEL_TYPES.find(
            (t) => t.value === preset.model_type,
        );
        if (typeEntry) {
            parts.push(typeEntry.label);
        } else {
            parts.push(preset.model_type.toUpperCase());
        }
        if (preset.engine) parts.push(preset.engine);
        if (preset.device && preset.device !== "AUTO")
            parts.push(preset.device);
        return parts.join(" · ");
    }

    async function triggerSearch(query: string) {
        let apiQuery = query.trim();

        if (!apiQuery) {
            apiQuery = "openvino";
        } else {
            if (
                !apiQuery.toLowerCase().includes("openvino") &&
                !apiQuery.toLowerCase().includes("ov")
            ) {
                apiQuery += " openvino";
            }
        }

        isSearching = true;
        try {
            const res = await fetch(
                `https://huggingface.co/api/models?search=${encodeURIComponent(apiQuery)}&sort=downloads&direction=-1&limit=30&full=true`,
            );
            const data = await res.json();

            const results = data.map((m: any) => {
                let params = "Unknown";

                // try regex
                const idMatch = m.id.match(/(\d+(?:\.\d+)?[BbMm])/i);
                if (idMatch) {
                    params = idMatch[1].toUpperCase();
                }
                // try tags
                else if (m.tags) {
                    const tagMatch = m.tags.find((t: string) =>
                        t.match(/size:.*?(\d+(?:\.\d+)?[BbMm])/i),
                    );
                    if (tagMatch) {
                        const ext = tagMatch.match(/(\d+(?:\.\d+)?[BbMm])/i);
                        if (ext) params = ext[1].toUpperCase();
                    }
                }

                // guess for model with no size text
                if (params === "Unknown") {
                    const nameLower = m.id.toLowerCase();
                    if (
                        nameLower.includes("phi-3.5-mini") ||
                        nameLower.includes("phi-3-mini")
                    )
                        params = "3.8B";
                    else if (nameLower.includes("phi-3.5-vision"))
                        params = "4.2B";
                    else if (nameLower.includes("phi-3-small")) params = "7B";
                    else if (nameLower.includes("phi-2")) params = "2.7B";
                    else if (
                        nameLower.includes("llama-3-8b") ||
                        nameLower.includes("llama3-8b") ||
                        nameLower.includes("llama-3.1-8b")
                    )
                        params = "8B";
                    else if (nameLower.includes("llama-3.2-1b")) params = "1B";
                    else if (nameLower.includes("llama-3.2-3b")) params = "3B";
                    else if (nameLower.includes("llama-3.2-11b"))
                        params = "11B";
                    else if (
                        nameLower.includes("qwen2.5-7b") ||
                        nameLower.includes("qwen2-7b")
                    )
                        params = "7B";
                    else if (
                        nameLower.includes("qwen2.5-1.5b") ||
                        nameLower.includes("qwen2-1.5b")
                    )
                        params = "1.5B";
                    else if (
                        nameLower.includes("qwen2.5-0.5b") ||
                        nameLower.includes("qwen2-0.5b")
                    )
                        params = "0.5B";
                    else if (
                        nameLower.includes("qwen-7b") ||
                        nameLower.includes("qwen-1.8b")
                    )
                        params = nameLower.includes("7b") ? "7B" : "1.8B";
                    else if (
                        nameLower.includes("gemma-2b") ||
                        nameLower.includes("gemma-2-2b")
                    )
                        params = "2B";
                    else if (nameLower.includes("gemma-7b")) params = "7B";
                    else if (nameLower.includes("gemma-2-9b")) params = "9B";
                    else if (nameLower.includes("mistral-7b")) params = "7B";
                    else if (nameLower.includes("whisper-large"))
                        params = "1.5B";
                    else if (nameLower.includes("whisper-base")) params = "74M";
                    else if (nameLower.includes("whisper-small"))
                        params = "244M";
                    else if (nameLower.includes("whisper-tiny")) params = "39M";
                }

                let arch = m.tags?.find((t: string) =>
                    [
                        "llama",
                        "qwen2",
                        "gemma",
                        "mistral",
                        "phi3",
                        "whisper",
                    ].includes(t),
                );
                if (!arch && m.id.toLowerCase().includes("whisper"))
                    arch = "whisper";
                if (!arch) arch = "Transformer";

                return {
                    id: m.id,
                    name: m.id.split("/").pop(),
                    author: m.author || m.id.split("/")[0] || "Unknown",
                    recommended:
                        m.author === "Echo9Zulu" ||
                        ((m.author === "OpenVINO" || m.author === "NNCF") &&
                            m.downloads > 50),
                    downloads: m.downloads,
                    tags: m.tags || [],
                    params: params,
                    arch: arch,
                };
            });

            const filteredResults = results.filter((m: any) => {
                return (
                    m.id.toLowerCase().includes("ov") ||
                    m.tags?.includes("openvino") ||
                    m.id.toLowerCase().includes("openvino")
                );
            });

            searchResults = filteredResults;

            if (searchResults.length > 0) {
                const stillExists =
                    selectedModel &&
                    searchResults.find((m) => m.id === selectedModel!.id);
                if (!stillExists) {
                    selectModel(searchResults[0]);
                }
            } else {
                selectedModel = null;
            }
        } catch (e: any) {
            console.error("Failed to fetch models", e);
            appState.addLog(
                "error",
                "Failed to fetch HuggingFace models",
                e.toString(),
            );
        } finally {
            isSearching = false;
        }
    }

    async function selectModel(model: ModelInfo) {
        selectedModel = model;
        isFetchingReadme = true;
        isFetchingMetadata = true;
        readmeHtml = "";
        hfMetadata = null;
        downloadError = null;
        appState.addLog("v1", "Selected model to view details", model.id);

        // fetch README and full metadata in parallel
        const readmePromise = (async () => {
            try {
                const res = await fetch(
                    `https://huggingface.co/${encodeRepoId(model.id)}/raw/main/README.md`,
                );
                if (res.ok) {
                    const markdown = await res.text();
                    const rawHtml = await marked.parse(markdown);
                    readmeHtml = DOMPurify.sanitize(rawHtml);
                } else {
                    readmeHtml = `<p class="text-muted-foreground">No README found for this model.</p>`;
                    appState.addLog(
                        "v2",
                        "No README found for model",
                        model.id,
                    );
                }
            } catch (e: any) {
                console.error("Failed to fetch readme", e);
                appState.addLog(
                    "error",
                    "Failed to fetch model readme",
                    e.toString(),
                );
                readmeHtml = `<p class="text-destructive">Error loading model details.</p>`;
            } finally {
                isFetchingReadme = false;
            }
        })();

        const metadataPromise = (async () => {
            try {
                const meta = await fetchModelMetadata(model.id);
                hfMetadata = meta;
                appState.addLog(
                    "v2",
                    "Fetched HuggingFace metadata",
                    `params=${meta.parameterSize} quant=${meta.quantization} ctx=${meta.maxContextTokens}`,
                );
            } catch (e: any) {
                appState.addLog(
                    "warn",
                    "Failed to fetch HuggingFace metadata",
                    e.toString(),
                );
            } finally {
                isFetchingMetadata = false;
            }
        })();

        await Promise.all([readmePromise, metadataPromise]);
    }

    let searchTimeout: ReturnType<typeof setTimeout>;
    function handleSearchInput(e: Event) {
        const val = (e.target as HTMLInputElement).value;
        searchQuery = val;
        if (val.trim()) {
            viewMode = "search";
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                triggerSearch(searchQuery);
            }, 500);
        } else {
            viewMode = "curated";
        }
    }

    function switchToCurated() {
        searchQuery = "";
        viewMode = "curated";
        searchResults = [];
    }

    const formatNumber = (num: number) => {
        if (num >= 1000) return (num / 1000).toFixed(1) + "k";
        return num.toString();
    };

    const normalize = (s: string) =>
        (s ?? "").toLowerCase().replace(/[\s/_-]+/g, "");

    const offloadAnalysis = $derived.by<OffloadAnalysis | null>(() => {
        if (!selectedModel || !hfMetadata) return null;
        const arch = hfMetadata.architecture;
        if (!arch) return null;

        const hw = buildHardwareInfo(openarc.metrics);
        const maxCtx =
            hfMetadata.maxContextTokens > 0
                ? hfMetadata.maxContextTokens
                : 32768;

        return computeOffloadAnalysis(
            arch,
            hfMetadata.quantization,
            "FP16",
            hw,
            maxCtx,
            hfMetadata.quantSource as QuantSource,
        );
    });

    const activeDownloadKeys = $derived.by(() => {
        const keys = new Set<string>();
        const downloads = openarc.downloads?.models ?? [];
        for (const d of downloads) {
            if (
                (d.status === "downloading" || d.status === "paused") &&
                d.model_name
            ) {
                keys.add(normalize(d.model_name));
            }
        }
        return keys;
    });

    const downloadedKeys = $derived.by(() => {
        const keys = new Set<string>();
        const locals = openarc.localModels?.models ?? [];
        for (const m of locals) {
            if (m.id && !activeDownloadKeys.has(normalize(m.id)))
                keys.add(normalize(m.id));
            if (
                m.model_name &&
                !activeDownloadKeys.has(normalize(m.model_name))
            )
                keys.add(normalize(m.model_name));
        }
        const downloads = openarc.downloads?.models ?? [];
        for (const d of downloads) {
            if (d.status === "completed" && d.model_name) {
                keys.add(normalize(d.model_name));
            }
        }
        return keys;
    });

    function isModelDownloaded(modelId: string): boolean {
        if (!modelId) return false;
        return downloadedKeys.has(normalize(modelId));
    }

    function isModelDownloading(modelId: string): boolean {
        if (!modelId) return false;
        return activeDownloadKeys.has(normalize(modelId));
    }

    async function handleDownload(modelId: string) {
        downloadError = null;
        startingDownload = true;
        appState.addLog("v1", "Starting model download", modelId);
        try {
            await openarc.startDownload(modelId);
            appState.addLog("info", "Download successfully queued", modelId);
        } catch (e: any) {
            downloadError = typeof e === "string" ? e : e.toString();
            console.error("Download failed:", e);
            appState.addLog(
                "error",
                "Failed to start model download",
                downloadError!,
            );
        } finally {
            startingDownload = false;
        }
    }
</script>

<Dialog.Root bind:open={appState.downloaderOpen}>
    <Dialog.Content
        class="sm:max-w-[1280px] w-[94vw] h-[84vh] p-0 flex flex-col overflow-hidden gap-0 bg-background border shadow-2xl"
    >
        <!-- Header -->
        <div
            class="shrink-0 px-5 pt-5 pb-4 border-b bg-gradient-to-b from-muted/30 to-background"
        >
            <div class="flex items-center gap-3 mb-4 pr-10">
                <div
                    class="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
                >
                    <Download class="w-4 h-4 text-primary" />
                </div>
                <div class="min-w-0">
                    <h2 class="text-base font-bold tracking-tight leading-tight">
                        Download models
                    </h2>
                    <p class="text-xs text-muted-foreground leading-tight mt-0.5">
                        Browse curated OpenVINO models or search HuggingFace
                    </p>
                </div>
            </div>

            <div class="flex items-center gap-2">
                <div class="relative flex-1">
                    <Search
                        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                    />
                    <Input
                        value={searchQuery}
                        oninput={handleSearchInput}
                        placeholder="Search HuggingFace for OpenVINO models..."
                        class="pl-9 h-9 bg-background"
                    />
                </div>
                <Button
                    variant={viewMode === "curated" ? "default" : "outline"}
                    size="sm"
                    class="h-9 gap-1.5 shrink-0"
                    onclick={switchToCurated}
                >
                    <Sparkles class="w-3.5 h-3.5" />
                    Curated
                </Button>
            </div>

            {#if viewMode === "curated"}
                <div class="flex items-center gap-1.5 mt-3 flex-wrap">
                    <button
                        class="text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors
                            {activeCategory === 'all'
                            ? 'bg-foreground text-background border-foreground'
                            : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground'}"
                        onclick={() => (activeCategory = "all")}
                    >
                        All
                    </button>
                    {#each getCuratedCategories() as cat}
                        <button
                            class="text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors
                                {activeCategory === cat.id
                                ? 'bg-foreground text-background border-foreground'
                                : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground'}"
                            onclick={() => (activeCategory = cat.id)}
                        >
                            {cat.label}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Body -->
        <div class="flex-1 flex flex-row overflow-hidden min-h-0">
            <!-- Left panel: model list -->
            <div
                class="w-[420px] shrink-0 border-r flex flex-col h-full overflow-hidden bg-muted/10"
            >
                <ScrollArea class="h-full flex-1">
                    <div class="p-2">
                        {#if viewMode === "curated"}
                            {#if isCuratedLoading() && !curatedFetched}
                                <div
                                    class="flex flex-col items-center justify-center py-16 text-muted-foreground"
                                >
                                    <Loader2 class="w-7 h-7 animate-spin mb-3" />
                                    <p class="text-sm font-medium">
                                        Loading curated models...
                                    </p>
                                </div>
                            {:else if getCuratedError() && !curatedFetched}
                                <div
                                    class="flex flex-col items-center justify-center py-16 text-muted-foreground px-4 text-center"
                                >
                                    <AlertCircle
                                        class="w-7 h-7 mb-3 text-destructive"
                                    />
                                    <p class="text-sm font-medium">
                                        Failed to load curated models
                                    </p>
                                    <p
                                        class="text-xs mt-1 text-destructive/80 max-w-[260px]"
                                    >
                                        {getCuratedError()}
                                    </p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        class="mt-3"
                                        onclick={() => fetchCuratedManifest()}
                                    >
                                        Retry
                                    </Button>
                                </div>
                            {:else if filteredCuratedGroups().length === 0}
                                <div
                                    class="text-center text-muted-foreground text-sm py-16 px-4"
                                >
                                    No curated models in this category.
                                </div>
                            {:else}
                                {#each filteredCuratedGroups() as group}
                                    <div class="mb-4 last:mb-1">
                                        <div
                                            class="flex items-center gap-2 px-2 py-1.5"
                                        >
                                            <div
                                                class="h-[2px] w-3 rounded-full {getCategoryAccent(
                                                    group.category.id,
                                                )}"
                                            ></div>
                                            <span
                                                class="text-[10px] font-bold uppercase tracking-widest text-foreground/80"
                                            >
                                                {group.category.label}
                                            </span>
                                            <span
                                                class="text-[10px] text-muted-foreground ml-auto tabular-nums"
                                            >
                                                {group.models.length}
                                            </span>
                                        </div>
                                        <div class="space-y-1">
                                            {#each group.models as cm}
                                                {@const modelInfo =
                                                    curatedToModelInfo(cm)}
                                                {@const downloaded =
                                                    isModelDownloaded(cm.id)}
                                                {@const downloading =
                                                    isModelDownloading(cm.id)}
                                                {@const isSelected =
                                                    selectedModel?.id === cm.id}
                                                <!-- svelte-ignore a11y_click_events_have_key_events -->
                                                <!-- svelte-ignore a11y_no_static_element_interactions -->
                                                <div
                                                    class="group relative flex items-center gap-2.5 px-2.5 py-2 rounded-md border cursor-pointer transition-all
                                                        {isSelected
                                                        ? 'bg-background border-primary/50 shadow-sm ring-1 ring-primary/20'
                                                        : 'bg-transparent border-transparent hover:bg-background hover:border-border'}"
                                                    onclick={() =>
                                                        selectModel(modelInfo)}
                                                >
                                                    <div
                                                        class="w-1 self-stretch rounded-full {getCategoryAccent(
                                                            cm.category,
                                                        )} {isSelected
                                                            ? 'opacity-100'
                                                            : 'opacity-50 group-hover:opacity-80'}"
                                                    ></div>
                                                    <div class="flex-1 min-w-0">
                                                        <div
                                                            class="flex items-center gap-1.5 mb-0.5"
                                                        >
                                                            <span
                                                                class="font-semibold text-[13px] truncate {isSelected
                                                                    ? 'text-foreground'
                                                                    : 'text-foreground/90'}"
                                                            >
                                                                {cm.name}
                                                            </span>
                                                            {#if downloaded}
                                                                <CheckCircle2
                                                                    class="w-3.5 h-3.5 text-emerald-500 shrink-0"
                                                                />
                                                            {:else if downloading}
                                                                <Loader2
                                                                    class="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0"
                                                                />
                                                            {/if}
                                                        </div>
                                                        <div
                                                            class="flex items-center gap-1.5 text-[10.5px] text-muted-foreground truncate"
                                                        >
                                                            <span
                                                                class="truncate"
                                                            >
                                                                {cm.author}
                                                            </span>
                                                            <span
                                                                class="text-border"
                                                                >•</span
                                                            >
                                                            <span
                                                                class="font-mono shrink-0"
                                                                >{cm.params}</span
                                                            >
                                                            <span
                                                                class="text-border"
                                                                >•</span
                                                            >
                                                            <span
                                                                class="shrink-0"
                                                                >{cm.quantization}</span
                                                            >
                                                        </div>
                                                    </div>
                                                    <span
                                                        class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 {getCategoryColor(
                                                            cm.category,
                                                        )}"
                                                    >
                                                        {cm.category}
                                                    </span>
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                {/each}
                            {/if}
                        {:else}
                            {#if isSearching}
                                <div
                                    class="flex flex-col items-center justify-center py-16 text-muted-foreground"
                                >
                                    <Loader2 class="w-7 h-7 animate-spin mb-3" />
                                    <p class="text-sm font-medium">
                                        Searching HuggingFace...
                                    </p>
                                </div>
                            {:else if searchResults.length === 0}
                                <div
                                    class="text-center text-muted-foreground text-sm py-16 px-4"
                                >
                                    No OpenVINO models found
                                    {searchQuery
                                        ? `matching "${searchQuery}"`
                                        : ""}.
                                </div>
                            {:else}
                                <div class="space-y-1">
                                    {#each searchResults as model}
                                        {@const downloaded = isModelDownloaded(
                                            model.id,
                                        )}
                                        {@const downloading = isModelDownloading(
                                            model.id,
                                        )}
                                        {@const curated = isCuratedModel(
                                            model.id,
                                        )}
                                        {@const isSelected =
                                            selectedModel?.id === model.id}
                                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                                        <div
                                            class="group relative flex items-center gap-2.5 px-2.5 py-2 rounded-md border cursor-pointer transition-all
                                                {isSelected
                                                ? 'bg-background border-primary/50 shadow-sm ring-1 ring-primary/20'
                                                : 'bg-transparent border-transparent hover:bg-background hover:border-border'}"
                                            onclick={() => selectModel(model)}
                                        >
                                            <div
                                                class="w-1 self-stretch rounded-full {curated
                                                    ? 'bg-primary'
                                                    : model.recommended
                                                      ? 'bg-amber-500'
                                                      : 'bg-muted-foreground/30'} {isSelected ? 'opacity-100' : 'opacity-50 group-hover:opacity-80'}"
                                            ></div>
                                            <div class="flex-1 min-w-0">
                                                <div
                                                    class="flex items-center gap-1.5 mb-0.5"
                                                >
                                                    <span
                                                        class="font-semibold text-[13px] truncate text-foreground/90"
                                                    >
                                                        {model.name}
                                                    </span>
                                                    {#if downloaded}
                                                        <CheckCircle2
                                                            class="w-3.5 h-3.5 text-emerald-500 shrink-0"
                                                        />
                                                    {:else if downloading}
                                                        <Loader2
                                                            class="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0"
                                                        />
                                                    {:else if curated}
                                                        <Sparkles
                                                            class="w-3 h-3 text-primary shrink-0"
                                                        />
                                                    {:else if model.recommended}
                                                        <Star
                                                            class="w-3 h-3 text-amber-500 fill-current shrink-0"
                                                        />
                                                    {/if}
                                                </div>
                                                <div
                                                    class="flex items-center gap-1.5 text-[10.5px] text-muted-foreground truncate"
                                                >
                                                    <span class="truncate">
                                                        {model.author}
                                                    </span>
                                                    <span class="text-border"
                                                        >•</span
                                                    >
                                                    <span
                                                        class="font-mono shrink-0"
                                                        >{model.params}</span
                                                    >
                                                    <span class="text-border"
                                                        >•</span
                                                    >
                                                    <span
                                                        class="inline-flex items-center gap-0.5 shrink-0"
                                                    >
                                                        <Download
                                                            class="w-2.5 h-2.5"
                                                        />
                                                        {formatNumber(
                                                            model.downloads,
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        {/if}
                    </div>
                </ScrollArea>
            </div>

            <!-- Right panel: details -->
            <div
                class="flex-1 flex flex-col bg-background overflow-hidden min-w-0"
            >
                {#if selectedModel}
                    <div
                        class="px-6 pt-5 pb-4 border-b shrink-0 bg-gradient-to-b from-muted/10 to-transparent"
                    >
                        <div
                            class="flex items-start justify-between mb-4 gap-4 pr-8"
                        >
                            <div class="min-w-0">
                                <div
                                    class="text-xs text-primary font-medium mb-1 truncate"
                                >
                                    {selectedModel.author}
                                </div>
                                <h2
                                    class="text-xl font-bold tracking-tight break-all leading-tight"
                                >
                                    {selectedModel.name}
                                </h2>
                                <div
                                    class="text-[11px] text-muted-foreground mt-1 font-mono truncate"
                                >
                                    {selectedModel.id}
                                </div>
                            </div>
                            {#if isModelDownloaded(selectedModel.id)}
                                <div
                                    class="flex items-center gap-2 shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-md text-sm font-semibold"
                                >
                                    <CheckCircle2 class="w-4 h-4" />
                                    Downloaded
                                </div>
                            {:else if openarc.downloads?.models?.find((d: any) => d.model_name === selectedModel?.id && d.status !== "completed")}
                                {@const currentDownload =
                                    openarc.downloads?.models?.find(
                                        (d: any) =>
                                            d.model_name ===
                                                selectedModel!.id &&
                                            d.status !== "completed",
                                    )}
                                <div
                                    class="flex flex-col items-end gap-2 shrink-0 min-w-[220px]"
                                >
                                    <div
                                        class="flex items-center gap-2 text-xs w-full justify-between"
                                    >
                                        <span
                                            class="font-semibold capitalize"
                                            >{currentDownload.status}</span
                                        >
                                        <span
                                            class="text-muted-foreground tabular-nums"
                                            >{currentDownload.progress}%</span
                                        >
                                    </div>
                                    <div
                                        class="w-full h-1.5 bg-muted rounded-full overflow-hidden"
                                    >
                                        <div
                                            class="h-full bg-primary transition-all duration-300"
                                            style="width: {currentDownload.progress}%"
                                        ></div>
                                    </div>
                                    <div class="flex items-center gap-1.5">
                                        {#if currentDownload.status === "downloading"}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onclick={() =>
                                                    openarc.pauseDownload(
                                                        selectedModel!.id,
                                                    )}
                                            >
                                                <Pause class="w-3.5 h-3.5 mr-1.5" />
                                                Pause
                                            </Button>
                                        {:else if currentDownload.status === "paused"}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onclick={() =>
                                                    openarc.resumeDownload(
                                                        selectedModel!.id,
                                                    )}
                                            >
                                                <Play class="w-3.5 h-3.5 mr-1.5" />
                                                Resume
                                            </Button>
                                        {/if}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            class="text-destructive hover:bg-destructive/10"
                                            onclick={() =>
                                                openarc.cancelDownload(
                                                    selectedModel!.id,
                                                )}
                                        >
                                            <X class="w-3.5 h-3.5 mr-1.5" />
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            {:else}
                                <div class="flex flex-col items-end gap-1.5">
                                    <Button
                                        class="gap-2 shadow-sm shrink-0 min-w-[140px]"
                                        disabled={startingDownload}
                                        onclick={() =>
                                            handleDownload(selectedModel!.id)}
                                    >
                                        {#if startingDownload}
                                            <Loader2
                                                class="w-4 h-4 animate-spin"
                                            />
                                            Starting...
                                        {:else}
                                            <Download class="w-4 h-4" />
                                            Download
                                        {/if}
                                    </Button>
                                    {#if downloadError}
                                        <div
                                            class="text-[10px] text-destructive max-w-[220px] text-right font-medium leading-tight bg-destructive/10 px-2 py-1 rounded"
                                        >
                                            {downloadError}
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>

                        <div class="space-y-3">
                            {#if offloadAnalysis}
                                <VramOffloadBar analysis={offloadAnalysis} />
                            {:else}
                                <div
                                    class="flex items-center gap-1.5 text-xs font-medium bg-muted/50 text-muted-foreground px-3 py-1.5 rounded-md border border-border/50 w-fit"
                                >
                                    <AlertCircle class="w-3.5 h-3.5" />
                                    Offload analysis unavailable
                                </div>
                            {/if}

                            <div class="flex flex-wrap items-center gap-1.5">
                                <div
                                    class="flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border"
                                >
                                    <Cpu
                                        class="w-3 h-3 text-muted-foreground"
                                    />
                                    <span class="font-mono"
                                        >{selectedModel.params}</span
                                    >
                                </div>
                                <div
                                    class="flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border capitalize"
                                >
                                    <Star
                                        class="w-3 h-3 text-muted-foreground"
                                    />
                                    {selectedModel.arch}
                                </div>
                                {#if hfMetadata}
                                    <div
                                        class="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border {hfMetadata.quantSource ===
                                        'fallback'
                                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                            : 'bg-muted/50 text-foreground border-border'}"
                                    >
                                        <MemoryStick
                                            class="w-3 h-3 {hfMetadata.quantSource ===
                                            'fallback'
                                                ? 'text-amber-500'
                                                : 'text-muted-foreground'}"
                                        />
                                        <span class="font-medium"
                                            >{hfMetadata.quantization}</span
                                        >
                                        {#if hfMetadata.quantSource === "api"}
                                            <span
                                                class="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium"
                                                >API</span
                                            >
                                        {:else if hfMetadata.quantSource === "name"}
                                            <span
                                                class="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium"
                                                >detected</span
                                            >
                                        {:else if hfMetadata.quantSource === "config"}
                                            <span
                                                class="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium"
                                                >config</span
                                            >
                                        {:else}
                                            <span
                                                class="text-[9px] text-amber-600 dark:text-amber-400 font-medium"
                                                >assumed</span
                                            >
                                        {/if}
                                    </div>
                                {/if}
                                {#if isCuratedModel(selectedModel.id)}
                                    {@const preset = getCuratedPreset(
                                        selectedModel.id,
                                    )}
                                    {#if preset}
                                        <div
                                            class="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border bg-primary/10 text-primary border-primary/30"
                                        >
                                            <Sparkles class="w-3 h-3" />
                                            <span class="font-medium"
                                                >{getPresetSummary(
                                                    preset,
                                                )}</span
                                            >
                                        </div>
                                    {/if}
                                {/if}
                            </div>

                            {#if selectedModel.tags.length > 0}
                                <div class="flex flex-wrap gap-1">
                                    {#each selectedModel.tags.slice(0, 8) as tag}
                                        <span
                                            class="text-[9px] uppercase font-semibold tracking-wider bg-background border px-1.5 py-0.5 rounded text-muted-foreground"
                                        >
                                            {tag}
                                        </span>
                                    {/each}
                                    {#if selectedModel.tags.length > 8}
                                        <span
                                            class="text-[9px] uppercase font-semibold tracking-wider bg-muted border px-1.5 py-0.5 rounded text-muted-foreground"
                                        >
                                            +{selectedModel.tags.length - 8}
                                        </span>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    </div>

                    <div class="flex-1 overflow-hidden relative">
                        {#if isFetchingReadme}
                            <div
                                class="absolute inset-0 bg-background/60 backdrop-blur-sm z-10 flex items-center justify-center"
                            >
                                <Loader2
                                    class="w-7 h-7 animate-spin text-primary"
                                />
                            </div>
                        {/if}
                        <ScrollArea class="h-full">
                            <div class="p-6">
                                <div
                                    class="prose prose-sm prose-neutral dark:prose-invert max-w-none
                                    prose-headings:font-bold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                                    prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                                    prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border
                                    prose-img:rounded-md prose-img:border prose-img:border-border"
                                >
                                    {@html readmeHtml}
                                </div>
                            </div>
                        </ScrollArea>
                    </div>
                {:else}
                    <div
                        class="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center"
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
                            Browse curated models on the left or search
                            HuggingFace for OpenVINO-compatible models to
                            download.
                        </p>
                    </div>
                {/if}
            </div>
        </div>
    </Dialog.Content>
</Dialog.Root>
