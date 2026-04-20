<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Textarea } from "$lib/components/ui/textarea";
    import { Label } from "$lib/components/ui/label";
    import { Switch } from "$lib/components/ui/switch";
    import * as Select from "$lib/components/ui/select";
    import * as Tooltip from "$lib/components/ui/tooltip";
    import { appState } from "$lib/state.svelte.js";
    import {
        voiceState,
        type ImportedAudio,
        type TranscribeArgs,
    } from "$lib/voice.svelte.js";
    import { openarc } from "$lib/client.svelte.js";
    import {
        filenameFromPath,
        formatBytes,
        formatTime,
        hasAudioExtension,
    } from "$lib/audio";
    import { goto } from "$app/navigation";
    import { getCurrentWebview } from "@tauri-apps/api/webview";
    import {
        Copy,
        Download,
        FileAudio,
        Info,
        Loader2,
        Play,
        Upload,
        X,
    } from "@lucide/svelte";
    import RecorderButton from "./RecorderButton.svelte";

    type SttKind = "whisper" | "qwen3_asr";

    type SttModelEntry = {
        name: string;
        kind: SttKind;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type RawModel = { model_name?: string; model_type?: string } & Record<string, any>;

    const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

    const QWEN3_ASR_LANGUAGES: { code: string; label: string }[] = [
        { code: "auto", label: "Auto-detect" },
        { code: "en", label: "English" },
        { code: "zh", label: "Chinese" },
        { code: "ja", label: "Japanese" },
        { code: "ko", label: "Korean" },
        { code: "es", label: "Spanish" },
        { code: "fr", label: "French" },
        { code: "de", label: "German" },
        { code: "it", label: "Italian" },
        { code: "pt", label: "Portuguese" },
        { code: "ru", label: "Russian" },
    ];

    let importedAudio = $state<ImportedAudio | null>(null);
    let isDragging = $state(false);
    let isImporting = $state(false);

    const sttModels = $derived.by<SttModelEntry[]>(() => {
        const raw = (openarc.status?.models ?? []) as RawModel[];
        return raw
            .filter(
                (m) =>
                    m?.model_type === "whisper" ||
                    m?.model_type === "qwen3_asr",
            )
            .map((m) => ({
                name: String(m.model_name ?? ""),
                kind: m.model_type as SttKind,
            }))
            .filter((m) => m.name.length > 0);
    });

    const selectedModelEntry = $derived.by<SttModelEntry | null>(() => {
        const sel = voiceState.selectedSttModel;
        if (!sel) return null;
        return sttModels.find((m) => m.name === sel) ?? null;
    });

    const selectedKind = $derived<SttKind | null>(
        selectedModelEntry?.kind ?? null,
    );

    // autoselect first available model when none is chosen or current disappears
    $effect(() => {
        const list = sttModels;
        const current = voiceState.selectedSttModel;
        const stillValid =
            !!current && list.some((m) => m.name === current);
        if (!stillValid) {
            voiceState.selectedSttModel = list[0]?.name ?? null;
        }
    });

    // clear active transcription when source audio changes so stale output
    // doesn't look like it belongs to the new file
    $effect(() => {
        const _trigger = importedAudio?.id ?? null;
        // touch reactive source so effect reruns when id changes
        void _trigger;
        voiceState.activeTranscription = null;
    });

    async function acceptPath(path: string) {
        if (isImporting) return;
        const name = filenameFromPath(path);
        if (!hasAudioExtension(name)) {
            appState.addLog(
                "warn",
                `Ignored non-audio file: ${name}`,
                path,
            );
            return;
        }
        isImporting = true;
        try {
            appState.addLog("v1", "Importing audio for transcription", path);
            const res = await voiceState.importForTranscription(path);
            if (!res) {
                appState.addLog("error", "Import returned null");
                return;
            }
            if (res.bytes > MAX_BYTES) {
                appState.addLog(
                    "warn",
                    `Audio too large: ${formatBytes(res.bytes)} (cap 100 MB)`,
                    res.path,
                );
                return;
            }
            importedAudio = res;
            appState.addLog(
                "info",
                `Audio imported (${formatBytes(res.bytes)})`,
                res.path,
            );
        } finally {
            isImporting = false;
        }
    }

    function onDragOver(event: DragEvent) {
        event.preventDefault();
        isDragging = true;
    }

    function onDragLeave(event: DragEvent) {
        event.preventDefault();
        isDragging = false;
    }

    // browser drop event in tauri v2 doesn't expose File.path. real paths come
    // from the native dragdrop listener below. preventDefault prevents webview
    // from navigating to the dropped file.
    function onDrop(event: DragEvent) {
        event.preventDefault();
        isDragging = false;
    }

    async function onRecorded(audio: ImportedAudio) {
        importedAudio = audio;
        appState.addLog(
            "v2",
            "Recorded audio ready for transcription",
            audio.path,
        );
    }

    function removeImported() {
        importedAudio = null;
        appState.addLog("v2", "Imported audio cleared");
    }

    async function onTranscribe() {
        if (
            !importedAudio ||
            voiceState.isTranscribing ||
            !voiceState.selectedSttModel ||
            !selectedModelEntry
        )
            return;
        const model = selectedModelEntry.name;
        const adv = voiceState.advanced.qwen3Asr;
        const isQwen = selectedModelEntry.kind === "qwen3_asr";
        const openarcAsr = isQwen
            ? {
                  language: adv.language === "auto" ? undefined : adv.language,
                  max_tokens: adv.maxTokens,
                  max_chunk_sec: adv.maxChunkSec,
                  search_expand_sec: adv.searchExpandSec,
                  min_window_ms: adv.minWindowMs,
              }
            : undefined;
        const args: TranscribeArgs = {
            audioPath: importedAudio.path,
            model,
            responseFormat: adv.responseFormat,
            openarcAsr,
            sourceLabel: filenameFromPath(importedAudio.path),
        };
        appState.addLog("v4", "Transcribe payload", JSON.stringify(args));
        await voiceState.transcribe(args);
    }

    async function onCopy() {
        const text = voiceState.activeTranscription?.body.text ?? "";
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            appState.addLog("v2", "Transcription copied");
        } catch (e) {
            appState.addLog(
                "error",
                "Failed to copy transcription",
                String(e),
            );
        }
    }

    // export disabled - plugin-dialog and plugin-fs are not installed yet
    const exportDisabledReason =
        "Export is not available yet — saving to disk isn't wired up.";

    async function onExport() {
        appState.addLog(
            "warn",
            "Export requested but save-dialog plumbing is not yet wired",
            exportDisabledReason,
        );
    }

    function gotoModels() {
        void goto("/models");
    }

    // register native dragdrop listener once on mount - only path that
    // yields real filesystem paths since webview blocks File.path
    $effect(() => {
        let unlisten: (() => void) | null = null;
        let disposed = false;
        (async () => {
            try {
                const fn = await getCurrentWebview().onDragDropEvent(
                    (ev) => {
                        const payload = ev.payload;
                        if (payload.type === "enter") {
                            isDragging = true;
                        } else if (payload.type === "leave") {
                            isDragging = false;
                        } else if (payload.type === "drop") {
                            isDragging = false;
                            const first = payload.paths[0];
                            if (first) void acceptPath(first);
                        }
                    },
                );
                if (disposed) {
                    fn();
                } else {
                    unlisten = fn;
                }
            } catch (e) {
                appState.addLog(
                    "warn",
                    "Drag-drop listener failed to register",
                    String(e),
                );
            }
        })();
        return () => {
            disposed = true;
            if (unlisten) unlisten();
        };
    });

    const transcriptionText = $derived(
        voiceState.activeTranscription?.body.text ?? "",
    );
    const transcriptionLanguage = $derived(
        voiceState.activeTranscription?.body.language ?? null,
    );
    const transcriptionDuration = $derived(
        voiceState.activeTranscription?.body.duration ?? null,
    );
    const showVerboseCaptions = $derived(
        voiceState.activeTranscription?.responseFormat === "verbose_json",
    );
</script>

<div class="space-y-4">
    <div>
        <h2 class="text-2xl font-bold tracking-tight">Transcribe Audio</h2>
        <p class="text-sm text-muted-foreground">
            Convert speech to text using Whisper or Qwen3-ASR.
        </p>
    </div>

    <div class="grid grid-cols-3 gap-6">
        <div class="col-span-2 space-y-6">
            <div
                class="border-2 border-dashed rounded-xl p-8 text-center flex flex-col items-center justify-center transition-colors {isDragging
                    ? 'bg-primary/10 border-primary'
                    : 'bg-muted/10'}"
                role="presentation"
                ondragover={onDragOver}
                ondragleave={onDragLeave}
                ondrop={onDrop}
            >
                {#if importedAudio}
                    <div
                        class="w-full flex items-center gap-3 p-3 rounded-md border bg-background"
                    >
                        <FileAudio class="w-8 h-8 text-primary shrink-0" />
                        <div class="flex-1 min-w-0 text-left">
                            <div
                                class="font-medium truncate"
                                title={importedAudio.path}
                            >
                                {filenameFromPath(importedAudio.path)}
                            </div>
                            <div
                                class="text-xs text-muted-foreground font-mono"
                            >
                                {formatBytes(importedAudio.bytes)}
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            class="shrink-0"
                            onclick={removeImported}
                            title="Remove file"
                        >
                            <X class="w-4 h-4" />
                        </Button>
                    </div>
                {:else if isImporting}
                    <Loader2
                        class="w-10 h-10 text-muted-foreground mb-3 animate-spin"
                    />
                    <h3 class="font-semibold">Importing audio...</h3>
                {:else}
                    <Upload class="w-10 h-10 text-muted-foreground mb-3" />
                    <h3 class="font-semibold text-base">
                        Drop an audio file here
                    </h3>
                    <p class="text-xs text-muted-foreground mt-1">
                        WAV, MP3, FLAC, M4A, OGG, WebM (max 100 MB)
                    </p>

                    <div
                        class="flex items-center gap-4 w-full max-w-xs mt-6"
                    >
                        <div class="h-[1px] flex-1 bg-border"></div>
                        <span
                            class="text-xs text-muted-foreground uppercase font-semibold"
                        >
                            OR
                        </span>
                        <div class="h-[1px] flex-1 bg-border"></div>
                    </div>

                    <div class="mt-6">
                        <RecorderButton onRecorded={onRecorded} />
                    </div>
                {/if}
            </div>

            <div class="flex items-center gap-3">
                <Button
                    class="gap-2"
                    size="lg"
                    disabled={!importedAudio ||
                        voiceState.isTranscribing ||
                        !voiceState.selectedSttModel}
                    onclick={onTranscribe}
                >
                    {#if voiceState.isTranscribing}
                        <Loader2 class="w-4 h-4 animate-spin" />
                        Transcribing...
                    {:else}
                        <Play class="w-4 h-4 fill-current" />
                        Start Transcription
                    {/if}
                </Button>
            </div>

            <div class="space-y-2 mt-4">
                <div class="flex items-center justify-between">
                    <Label class="font-semibold">Transcription Output</Label>
                    <div class="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-8 gap-1 text-muted-foreground"
                            disabled={!transcriptionText}
                            onclick={onCopy}
                        >
                            <Copy class="w-3 h-3" />
                            Copy Text
                        </Button>
                        <Tooltip.Provider>
                            <Tooltip.Root>
                                <Tooltip.Trigger>
                                    {#snippet child({ props })}
                                        <Button
                                            {...props}
                                            variant="ghost"
                                            size="sm"
                                            class="h-8 gap-1 text-muted-foreground"
                                            disabled={true}
                                            onclick={onExport}
                                        >
                                            <Download class="w-3 h-3" />
                                            Export
                                        </Button>
                                    {/snippet}
                                </Tooltip.Trigger>
                                <Tooltip.Content side="bottom">
                                    {exportDisabledReason}
                                </Tooltip.Content>
                            </Tooltip.Root>
                        </Tooltip.Provider>
                    </div>
                </div>
                <Textarea
                    value={transcriptionText}
                    placeholder="Transcription will appear here..."
                    class="min-h-[200px] resize-y bg-muted/30"
                    readonly
                />
                {#if showVerboseCaptions && (transcriptionLanguage || transcriptionDuration !== null)}
                    <div
                        class="text-xs text-muted-foreground flex items-center gap-2"
                    >
                        {#if transcriptionLanguage}
                            <span>Language: {transcriptionLanguage}</span>
                        {/if}
                        {#if transcriptionLanguage && transcriptionDuration !== null}
                            <span>·</span>
                        {/if}
                        {#if transcriptionDuration !== null}
                            <span>
                                Duration: {formatTime(
                                    transcriptionDuration ?? 0,
                                )}
                            </span>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>

        <div class="space-y-6 p-5 border rounded-xl bg-muted/5 h-fit">
            <div class="space-y-2">
                <Label class="text-sm font-semibold">ASR Model</Label>
                {#if sttModels.length === 0}
                    <div
                        class="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground"
                    >
                        <Info class="w-4 h-4 mt-0.5 shrink-0" />
                        <div class="space-y-2">
                            <p>No Whisper or Qwen3-ASR model loaded.</p>
                            <Button
                                size="sm"
                                variant="outline"
                                class="h-7 px-2 text-xs"
                                onclick={gotoModels}
                            >
                                Open Models page
                            </Button>
                        </div>
                    </div>
                {:else}
                    <Select.Root
                        type="single"
                        value={voiceState.selectedSttModel ?? undefined}
                        onValueChange={(v) =>
                            (voiceState.selectedSttModel = v ?? null)}
                    >
                        <Select.Trigger class="h-9 text-sm w-full" title={voiceState.selectedSttModel ?? undefined}>
                            <span class="truncate min-w-0 flex-1 text-left">
                                {voiceState.selectedSttModel ?? "Select model"}
                            </span>
                        </Select.Trigger>
                        <Select.Content>
                            {#each sttModels as m (m.name)}
                                <Select.Item value={m.name} label={m.name}>
                                    {m.name}
                                    <span
                                        class="ml-2 text-[10px] text-muted-foreground font-mono"
                                    >
                                        {m.kind}
                                    </span>
                                </Select.Item>
                            {/each}
                        </Select.Content>
                    </Select.Root>
                {/if}
            </div>

            {#if selectedKind === "whisper"}
                <!--
                    Whisper controls are rendered in their final shape but
                    disabled: OpenArc currently transcribes in the source
                    language only and exposes no toggles for translation,
                    word-level timestamps, or profanity filtering. When the
                    backend gains those endpoints, flip `disabled` off and
                    wire the bound state into the transcribe payload.
                -->
                <Tooltip.Provider delayDuration={200}>
                    <div class="space-y-4">
                        <div class="space-y-2">
                            <Label
                                class="text-sm font-semibold text-muted-foreground"
                            >
                                Task
                            </Label>
                            <Tooltip.Root>
                                <Tooltip.Trigger class="block w-full">
                                    {#snippet child({ props })}
                                        <div {...props}>
                                            <Select.Root
                                                type="single"
                                                value="transcribe"
                                                disabled
                                            >
                                                <Select.Trigger
                                                    class="h-9 text-sm w-full"
                                                >
                                                    Transcribe (source language)
                                                </Select.Trigger>
                                                <Select.Content>
                                                    <Select.Item
                                                        value="transcribe"
                                                        label="Transcribe (source language)"
                                                    >
                                                        Transcribe (source
                                                        language)
                                                    </Select.Item>
                                                    <Select.Item
                                                        value="translate"
                                                        label="Translate to English"
                                                        disabled
                                                    >
                                                        Translate to English
                                                    </Select.Item>
                                                </Select.Content>
                                            </Select.Root>
                                        </div>
                                    {/snippet}
                                </Tooltip.Trigger>
                                <Tooltip.Content side="left">
                                    Translation is not supported yet.
                                </Tooltip.Content>
                            </Tooltip.Root>
                        </div>

                        <div
                            class="flex items-center justify-between gap-3"
                        >
                            <div class="min-w-0 space-y-0.5">
                                <Label
                                    class="text-sm text-muted-foreground"
                                >
                                    Word-level timestamps
                                </Label>
                                <p
                                    class="text-[11px] text-muted-foreground/70"
                                >
                                    Emit per-word start/end offsets.
                                </p>
                            </div>
                            <Tooltip.Root>
                                <Tooltip.Trigger>
                                    {#snippet child({ props })}
                                        <div {...props}>
                                            <Switch
                                                checked={false}
                                                disabled
                                            />
                                        </div>
                                    {/snippet}
                                </Tooltip.Trigger>
                                <Tooltip.Content side="left">
                                    Word-level timestamps are not supported
                                    yet.
                                </Tooltip.Content>
                            </Tooltip.Root>
                        </div>

                        <div
                            class="flex items-center justify-between gap-3"
                        >
                            <div class="min-w-0 space-y-0.5">
                                <Label
                                    class="text-sm text-muted-foreground"
                                >
                                    Profanity filter
                                </Label>
                                <p
                                    class="text-[11px] text-muted-foreground/70"
                                >
                                    Mask profane words in the output.
                                </p>
                            </div>
                            <Tooltip.Root>
                                <Tooltip.Trigger>
                                    {#snippet child({ props })}
                                        <div {...props}>
                                            <Switch
                                                checked={false}
                                                disabled
                                            />
                                        </div>
                                    {/snippet}
                                </Tooltip.Trigger>
                                <Tooltip.Content side="left">
                                    Profanity filtering is not supported
                                    yet.
                                </Tooltip.Content>
                            </Tooltip.Root>
                        </div>
                    </div>
                </Tooltip.Provider>
            {:else if selectedKind === "qwen3_asr"}
                <div class="space-y-2">
                    <Label class="text-sm font-semibold">
                        Source Language
                    </Label>
                    <Select.Root
                        type="single"
                        value={voiceState.advanced.qwen3Asr.language}
                        onValueChange={(v) => {
                            if (v) voiceState.advanced.qwen3Asr.language = v;
                        }}
                    >
                        <Select.Trigger class="h-9 text-sm w-full">
                            {QWEN3_ASR_LANGUAGES.find(
                                (l) =>
                                    l.code ===
                                    voiceState.advanced.qwen3Asr.language,
                            )?.label ?? "Auto-detect"}
                        </Select.Trigger>
                        <Select.Content>
                            {#each QWEN3_ASR_LANGUAGES as lang (lang.code)}
                                <Select.Item
                                    value={lang.code}
                                    label={lang.label}
                                >
                                    {lang.label}
                                </Select.Item>
                            {/each}
                        </Select.Content>
                    </Select.Root>
                    <p class="text-[11px] text-muted-foreground">
                        Advanced knobs (chunk size, window, response
                        format) live in the Advanced Audio Config panel.
                    </p>
                </div>
            {/if}
        </div>
    </div>
</div>
