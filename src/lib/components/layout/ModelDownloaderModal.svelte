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
        RefreshCw,
        Loader2,
        Play,
        Pause,
        X,
    } from "@lucide/svelte";
    import { marked } from "marked";
    import DOMPurify from "dompurify";

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

    let searchQuery = $state("");
    let isSearching = $state(false);
    let searchResults = $state<ModelInfo[]>([]);
    let selectedModel = $state<ModelInfo | null>(null);
    let readmeHtml = $state<string>("");
    let isFetchingReadme = $state(false);
    let downloadError = $state<string | null>(null);
    let startingDownload = $state(false);

    onMount(() => {
        appState.addLog("info", "ModelDownloaderModal component initialized");
    });

    $effect(() => {
        if (
            appState.downloaderOpen &&
            searchResults.length === 0 &&
            !isSearching
        ) {
            triggerSearch("");
        }
    });

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
        readmeHtml = "";
        downloadError = null;
        appState.addLog("v1", "Selected model to view details", model.id);

        try {
            const res = await fetch(
                `https://huggingface.co/${model.id}/raw/main/README.md`,
            );
            if (res.ok) {
                const markdown = await res.text();
                const rawHtml = await marked.parse(markdown);
                readmeHtml = DOMPurify.sanitize(rawHtml);
            } else {
                readmeHtml = `<p class="text-muted-foreground">No README found for this model.</p>`;
                appState.addLog("v2", "No README found for model", model.id);
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
    }

    let searchTimeout: ReturnType<typeof setTimeout>;
    function handleSearchInput(e: Event) {
        const val = (e.target as HTMLInputElement).value;
        searchQuery = val;
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            triggerSearch(searchQuery);
        }, 500);
    }

    const formatNumber = (num: number) => {
        if (num >= 1000) return (num / 1000).toFixed(1) + "k";
        return num.toString();
    };

    const getOffloadStatus = (params: string) => {
        if (params === "Unknown") return "none";
        const val = parseFloat(params.replace(/[^\d.]/g, ""));
        if (isNaN(val)) return "none";

        const isMillion = params.toUpperCase().includes("M");
        if (isMillion) return "full";

        if (val < 10) return "full";
        if (val < 35) return "multi";
        return "none";
    };

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
        class="sm:max-w-[1100px] md:max-w-[1100px] w-full h-[85vh] p-0 flex flex-row overflow-hidden gap-0 bg-background border shadow-xl"
    >
        <Dialog.Title class="sr-only">Model Downloader</Dialog.Title>
        <Dialog.Description class="sr-only"
            >Browse and download OpenVINO models from HuggingFace.</Dialog.Description
        >

        <div
            class="w-[360px] flex flex-col border-r bg-muted/10 h-full shrink-0"
        >
            <div class="p-4 border-b bg-background z-10 flex flex-col gap-3">
                <div
                    class="font-semibold text-base flex items-center justify-between"
                >
                    Model Browser
                    {#if isSearching}
                        <Loader2
                            class="w-4 h-4 animate-spin text-muted-foreground"
                        />
                    {/if}
                </div>
                <div class="relative">
                    <Search
                        class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
                    />
                    <Input
                        placeholder="Search OpenVINO models..."
                        class="pl-9 bg-muted/50 border-muted"
                        value={searchQuery}
                        oninput={handleSearchInput}
                    />
                </div>
            </div>

            <div class="flex-1 overflow-hidden">
                <ScrollArea class="h-full">
                    <div class="p-3">
                        {#if searchResults.length === 0 && !isSearching}
                            <div
                                class="text-center text-muted-foreground text-sm p-8"
                            >
                                No OpenVINO models found matching "{searchQuery}".
                            </div>
                        {/if}
                        <div class="space-y-3">
                            {#each searchResults as model}
                                <!-- svelte-ignore a11y_click_events_have_key_events -->
                                <!-- svelte-ignore a11y_no_static_element_interactions -->
                                <div
                                    class="relative p-3 rounded-lg border cursor-pointer transition-all duration-200
                                        {selectedModel?.id === model.id
                                        ? 'bg-muted shadow-sm ring-1 ring-primary/30'
                                        : 'bg-background hover:bg-muted/50'}
                                        {model.recommended
                                        ? 'border-primary/50 shadow-[0_0_10px_rgba(var(--color-primary),0.1)]'
                                        : 'border-border'}"
                                    onclick={() => selectModel(model)}
                                >
                                    {#if model.recommended}
                                        <div
                                            class="absolute -top-2.5 right-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 z-10"
                                        >
                                            <Star
                                                class="w-3 h-3 fill-current"
                                            /> Recommended
                                        </div>
                                    {/if}

                                    <div
                                        class="text-xs text-muted-foreground mb-1 truncate"
                                    >
                                        {model.author}
                                    </div>
                                    <div
                                        class="font-medium text-sm leading-tight break-all mb-2 {model.recommended
                                            ? 'text-primary'
                                            : ''}"
                                    >
                                        {model.name}
                                    </div>

                                    <div
                                        class="flex items-center justify-between text-xs text-muted-foreground mt-2"
                                    >
                                        <div
                                            class="flex items-center gap-1.5 bg-muted/50 px-1.5 py-0.5 rounded"
                                        >
                                            <Download class="w-3 h-3" />
                                            {formatNumber(model.downloads)}
                                        </div>
                                        <div
                                            class="font-mono bg-muted/50 px-1.5 py-0.5 rounded"
                                        >
                                            {model.params} Params
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                </ScrollArea>
            </div>
        </div>

        <div
            class="flex-1 flex flex-col bg-background h-full overflow-hidden relative"
        >
            {#if selectedModel}
                <div class="p-6 pr-12 border-b shrink-0 bg-muted/5">
                    <div class="flex items-start justify-between mb-4 gap-4">
                        <div class="min-w-0">
                            <div
                                class="text-sm text-primary font-medium mb-1 truncate"
                            >
                                {selectedModel.author}
                            </div>
                            <h2
                                class="text-2xl font-bold tracking-tight break-all"
                            >
                                {selectedModel.name}
                            </h2>
                            <div
                                class="text-xs text-muted-foreground mt-1 font-mono"
                            >
                                {selectedModel.id}
                            </div>
                        </div>
                        {#if openarc.downloads?.models?.find((d: any) => d.model_name === selectedModel?.id)}
                            {@const currentDownload =
                                openarc.downloads?.models?.find(
                                    (d: any) =>
                                        d.model_name === selectedModel?.id,
                                )}
                            <div
                                class="flex flex-col items-end gap-2 shrink-0 min-w-[200px]"
                            >
                                <div
                                    class="flex items-center gap-2 text-sm w-full justify-between"
                                >
                                    <span class="font-medium"
                                        >{currentDownload.status}</span
                                    >
                                    <span class="text-muted-foreground"
                                        >{currentDownload.progress}%</span
                                    >
                                </div>
                                <div
                                    class="w-full h-2 bg-muted rounded-full overflow-hidden"
                                >
                                    <div
                                        class="h-full bg-primary transition-all duration-300"
                                        style="width: {currentDownload.progress}%"
                                    ></div>
                                </div>
                                <div class="flex items-center gap-2 mt-1">
                                    {#if currentDownload.status === "downloading"}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onclick={() =>
                                                openarc.pauseDownload(
                                                    selectedModel!.id,
                                                )}
                                        >
                                            <Pause class="w-4 h-4 mr-2" /> Pause
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
                                            <Play class="w-4 h-4 mr-2" /> Resume
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
                                        <X class="w-4 h-4 mr-2" /> Cancel
                                    </Button>
                                </div>
                            </div>
                        {:else}
                            <div class="flex flex-col items-end gap-1">
                                <Button
                                    class="gap-2 shadow-md shrink-0 w-[140px]"
                                    disabled={startingDownload}
                                    onclick={() =>
                                        handleDownload(selectedModel!.id)}
                                >
                                    {#if startingDownload}
                                        <Loader2 class="w-4 h-4 animate-spin" />
                                        Starting...
                                    {:else}
                                        <Download class="w-4 h-4" />
                                        Download
                                    {/if}
                                </Button>
                                {#if downloadError}
                                    <div
                                        class="text-[10px] text-destructive max-w-[140px] text-right font-medium leading-tight mt-1 bg-destructive/10 px-2 py-1 rounded"
                                    >
                                        {downloadError}
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </div>

                    {#if selectedModel}
                        {@const offload = getOffloadStatus(
                            selectedModel.params,
                        )}
                        <div class="flex flex-wrap items-center gap-3">
                            {#if offload === "full"}
                                <div
                                    class="flex items-center gap-1.5 text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20"
                                >
                                    <CheckCircle2 class="w-4 h-4" /> Full Single GPU
                                    Offload Possible
                                </div>
                            {:else if offload === "multi"}
                                <div
                                    class="flex items-center gap-1.5 text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-full border border-blue-500/20"
                                >
                                    <RefreshCw class="w-4 h-4" /> Multi GPU Offload
                                    Possible
                                </div>
                            {:else}
                                <div
                                    class="flex items-center gap-1.5 text-xs font-semibold bg-destructive/10 text-destructive dark:text-red-400 px-3 py-1 rounded-full border border-destructive/20"
                                >
                                    <AlertCircle class="w-4 h-4" /> Full Offload Not
                                    Possible
                                </div>
                            {/if}

                            <div
                                class="flex items-center gap-1.5 text-xs bg-muted text-foreground px-2 py-1 rounded-md border"
                            >
                                <Cpu
                                    class="w-3.5 h-3.5 text-muted-foreground"
                                />
                                {selectedModel.params} Params
                            </div>
                            <div
                                class="flex items-center gap-1.5 text-xs bg-muted text-foreground px-2 py-1 rounded-md border capitalize"
                            >
                                <Star
                                    class="w-3.5 h-3.5 text-muted-foreground"
                                />
                                {selectedModel.arch}
                            </div>
                        </div>
                    {/if}

                    <div class="flex flex-wrap gap-2 mt-4">
                        {#each selectedModel.tags.slice(0, 8) as tag}
                            <span
                                class="text-[10px] uppercase font-bold tracking-wider bg-background border px-2 py-0.5 rounded text-muted-foreground"
                            >
                                {tag}
                            </span>
                        {/each}
                        {#if selectedModel.tags.length > 8}
                            <span
                                class="text-[10px] uppercase font-bold tracking-wider bg-muted border px-2 py-0.5 rounded text-muted-foreground"
                            >
                                +{selectedModel.tags.length - 8} more
                            </span>
                        {/if}
                    </div>
                </div>

                <div class="flex-1 overflow-hidden relative">
                    {#if isFetchingReadme}
                        <div
                            class="absolute inset-0 bg-background/50 backdrop-blur-sm z-10 flex items-center justify-center"
                        >
                            <Loader2
                                class="w-8 h-8 animate-spin text-primary"
                            />
                        </div>
                    {/if}
                    <ScrollArea class="h-full">
                        <div class="p-6">
                            <div
                                class="prose prose-sm prose-neutral dark:prose-invert max-w-none
                                prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
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
                    class="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center h-full"
                >
                    <Search class="w-12 h-12 mb-4 opacity-20" />
                    <p class="text-lg font-medium text-foreground">
                        No Model Selected
                    </p>
                    <p class="text-sm mt-2 max-w-sm">
                        Select a model from the list on the left to view its
                        HuggingFace model card, hardware capabilities, and to
                        download.
                    </p>
                </div>
            {/if}
        </div>
    </Dialog.Content>
</Dialog.Root>
