<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Textarea } from "$lib/components/ui/textarea";
    import { Label } from "$lib/components/ui/label";
    import { Input } from "$lib/components/ui/input";
    import { Switch } from "$lib/components/ui/switch";
    import * as Select from "$lib/components/ui/select";
    import { invoke } from "@tauri-apps/api/core";
    import { untrack } from "svelte";
    import { getCurrentWebview } from "@tauri-apps/api/webview";
    import { appState } from "$lib/state.svelte.js";
    import {
        voiceState,
        type ImportedAudio,
        type SpeechArgs,
        type TranscribeArgs,
        type VoiceProfile,
    } from "$lib/voice.svelte.js";
    import { openarc } from "$lib/client.svelte.js";
    import {
        filenameFromPath,
        formatBytes,
        formatTime,
        hasAudioExtension,
    } from "$lib/audio";
    import { goto } from "$app/navigation";
    import {
        FileAudio,
        Info,
        Loader2,
        Play,
        Trash2,
        Upload,
        X,
    } from "@lucide/svelte";
    import RecorderButton from "./RecorderButton.svelte";
    import AudioPlayer from "./AudioPlayer.svelte";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type RawModel = { model_name?: string; model_type?: string } & Record<
        string,
        any
    >;

    const MAX_BYTES = 30 * 1024 * 1024; // 30 MB cap
    const MIN_RECOMMENDED_SEC = 10;
    const MAX_RECOMMENDED_SEC = 30;
    const HARD_WARN_SEC = 60;

    let profileName = $state("");
    let refAudio = $state<ImportedAudio | null>(null);
    let refText = $state("");
    let notes = $state("");
    let xVectorOnly = $state(false);
    let isImporting = $state(false);
    let isDragging = $state(false);
    let durationSec = $state<number | null>(null);

    let showNameError = $state(false);
    let showAudioError = $state(false);

    let selectedProfileId = $state<string | null>(null);
    let tryText = $state("");

    let selectedCloneModel = $state<string | null>(null);

    const cloneModels = $derived.by<string[]>(() => {
        const raw = (openarc.status?.models ?? []) as RawModel[];
        return raw
            .filter((m) => m?.model_type === "qwen3_tts_voice_clone")
            .map((m) => String(m.model_name ?? ""))
            .filter((n) => n.length > 0);
    });

    $effect(() => {
        const list = cloneModels;
        const current = selectedCloneModel;
        const stillValid = !!current && list.includes(current);
        if (!stillValid) {
            selectedCloneModel = list[0] ?? null;
        }
    });

    const cloneModel = $derived(selectedCloneModel);
    const hasCloneModel = $derived(cloneModels.length > 0);

    const cloneProfiles = $derived(
        voiceState.profiles.filter((p) => p.kind === "clone"),
    );

    const sttModels = $derived.by<{ name: string; kind: string }[]>(() => {
        const raw = (openarc.status?.models ?? []) as RawModel[];
        return raw
            .filter(
                (m) =>
                    m?.model_type === "whisper" ||
                    m?.model_type === "qwen3_asr",
            )
            .map((m) => ({
                name: String(m.model_name ?? ""),
                kind: m.model_type as string,
            }))
            .filter((m) => m.name.length > 0);
    });

    const hasSttModel = $derived(sttModels.length > 0);

    let isTranscribingRef = $state(false);

    async function onTranscribeRef() {
        if (!refAudio || isTranscribingRef) return;
        const model = voiceState.selectedSttModel ?? sttModels[0]?.name;
        if (!model) return;

        isTranscribingRef = true;
        appState.addLog("v1", "Transcribing reference audio", `model=${model}`);
        try {
            const adv = voiceState.advanced.qwen3Asr;
            const modelEntry = sttModels.find((m) => m.name === model);
            const isQwen = modelEntry?.kind === "qwen3_asr";
            const openarcAsr = isQwen
                ? {
                      language:
                          adv.language === "auto" ? undefined : adv.language,
                      max_tokens: adv.maxTokens,
                      max_chunk_sec: adv.maxChunkSec,
                      search_expand_sec: adv.searchExpandSec,
                      min_window_ms: adv.minWindowMs,
                  }
                : undefined;
            const args: TranscribeArgs = {
                audioPath: refAudio.path,
                model,
                responseFormat: "verbose_json",
                openarcAsr,
                sourceLabel: filenameFromPath(refAudio.path),
            };
            const result = await voiceState.transcribe(args);
            if (result?.body?.text) {
                refText = result.body.text;
                appState.addLog(
                    "info",
                    "Reference audio transcribed, text populated",
                );
            }
        } catch (e) {
            appState.addLog(
                "error",
                "Failed to transcribe reference audio",
                String(e),
            );
        } finally {
            isTranscribingRef = false;
        }
    }

    const selectedProfile = $derived.by<VoiceProfile | null>(() => {
        const id = selectedProfileId;
        if (!id) return null;
        return cloneProfiles.find((p) => p.id === id) ?? null;
    });

    let probeBlobUrl = $state<string | null>(null);

    $effect(() => {
        const p = refAudio?.path;
        const oldUrl = untrack(() => probeBlobUrl);
        if (oldUrl) {
            URL.revokeObjectURL(oldUrl);
            probeBlobUrl = null;
        }
        if (!p) return;
        let cancelled = false;
        (async () => {
            try {
                const b64 = await invoke<string>("read_audio_file", {
                    path: p,
                });
                if (cancelled) return;
                const raw = atob(b64);
                const arr = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
                const blob = new Blob([arr], { type: "audio/wav" });
                probeBlobUrl = URL.createObjectURL(blob);
            } catch (e) {
                appState.addLog("v3", "Failed to read probe audio", String(e));
            }
        })();
        return () => {
            cancelled = true;
        };
    });

    $effect(() => {
        // reset duration when ref audio changes
        void refAudio?.id;
        durationSec = null;
    });

    function onProbeLoaded(ev: Event) {
        const el = ev.currentTarget as HTMLAudioElement;
        const d = Number.isFinite(el.duration) ? el.duration : 0;
        durationSec = d > 0 ? d : null;
        if (durationSec !== null) {
            if (durationSec < MIN_RECOMMENDED_SEC) {
                appState.addLog(
                    "warn",
                    `Reference audio is short (${durationSec.toFixed(1)}s). 10-30s works best.`,
                );
            } else if (durationSec > HARD_WARN_SEC) {
                appState.addLog(
                    "warn",
                    `Reference audio is long (${durationSec.toFixed(1)}s). 10-30s works best.`,
                );
            }
        }
    }

    async function acceptPath(path: string) {
        if (isImporting) return;
        const name = filenameFromPath(path);
        // cloning only accepts wav/mp3/flac per spec
        const lower = name.toLowerCase();
        const ok =
            lower.endsWith(".wav") ||
            lower.endsWith(".mp3") ||
            lower.endsWith(".flac");
        if (!ok || !hasAudioExtension(name)) {
            appState.addLog(
                "warn",
                `Ignored non-WAV/MP3/FLAC file: ${name}`,
                path,
            );
            return;
        }
        isImporting = true;
        try {
            appState.addLog("v1", "Importing reference audio", path);
            const res = await voiceState.importReference(path);
            if (!res) {
                appState.addLog("error", "Reference import returned null");
                return;
            }
            if (res.bytes > MAX_BYTES) {
                appState.addLog(
                    "warn",
                    `Reference audio too large: ${formatBytes(res.bytes)} (cap 30 MB)`,
                    res.path,
                );
                return;
            }
            refAudio = res;
            showAudioError = false;
            appState.addLog(
                "info",
                `Reference audio imported (${formatBytes(res.bytes)})`,
                res.path,
            );
        } finally {
            isImporting = false;
        }
    }

    async function onRecorded(audio: ImportedAudio) {
        refAudio = audio;
        showAudioError = false;
        appState.addLog("v2", "Recorded reference audio ready", audio.path);
    }

    function removeRef() {
        refAudio = null;
        durationSec = null;
        appState.addLog("v2", "Reference audio cleared");
    }

    function onDragOver(event: DragEvent) {
        event.preventDefault();
        isDragging = true;
    }

    function onDragLeave(event: DragEvent) {
        event.preventDefault();
        isDragging = false;
    }

    function onDrop(event: DragEvent) {
        // webview strips File.path, real paths come via native listener
        event.preventDefault();
        isDragging = false;
    }

    const canCreate = $derived(
        profileName.trim().length > 0 && refAudio !== null,
    );

    async function onCreate() {
        showNameError = profileName.trim().length === 0;
        showAudioError = refAudio === null;
        if (!canCreate || !refAudio) return;

        const profile: VoiceProfile = {
            id: crypto.randomUUID(),
            label: profileName.trim(),
            kind: "clone",
            refAudioPath: refAudio.path,
            refText: refText.trim() || undefined,
            xVectorOnly,
            createdAt: Date.now(),
        };
        appState.addLog(
            "v1",
            `Saving voice clone profile: ${profile.label}`,
            profile.id,
        );
        await voiceState.saveProfile(profile);
        // saveProfile logs on failure internally; assume success if profile is in the list
        const landed = voiceState.profiles.some((p) => p.id === profile.id);
        if (!landed) {
            appState.addLog(
                "error",
                "Profile creation did not persist",
                profile.id,
            );
            return;
        }
        appState.addLog("info", `Voice clone ready: ${profile.label}`);
        selectedProfileId = profile.id;
        profileName = "";
        refText = "";
        notes = "";
        xVectorOnly = false;
        refAudio = null;
        durationSec = null;
        showNameError = false;
        showAudioError = false;
    }

    async function onDelete(profile: VoiceProfile) {
        const ok = window.confirm(
            `Delete voice clone "${profile.label}"? This removes the reference audio and cannot be undone.`,
        );
        if (!ok) return;
        await voiceState.deleteProfile(profile);
        if (selectedProfileId === profile.id) selectedProfileId = null;
    }

    function selectProfile(id: string) {
        selectedProfileId = id;
    }

    const canSynthesize = $derived(
        hasCloneModel &&
            selectedProfile !== null &&
            tryText.trim().length > 0 &&
            !voiceState.isSynthesizing,
    );

    async function onSynthesize() {
        if (!canSynthesize || !selectedProfile || !cloneModel) return;
        const adv = voiceState.advanced.qwen3Tts;
        const args: SpeechArgs = {
            model: cloneModel,
            input: tryText,
            voice: selectedProfile.label,
            voiceProfileId: selectedProfile.id,
            responseFormat: "wav",
            openarcTts: {
                qwen3_tts: {
                    input: tryText,
                    // TODO(backend): audio_speech doesn't resolve voiceProfileId
                    // into ref_audio_b64 yet, forwarding path as a stub
                    ref_audio_path: selectedProfile.refAudioPath,
                    ref_text: selectedProfile.refText ?? null,
                    x_vector_only: !!selectedProfile.xVectorOnly,
                    instruct: null,
                    language: null,
                    temperature: adv.temperature,
                    top_k: adv.topK,
                    top_p: adv.topP,
                    repetition_penalty: adv.repetitionPenalty,
                    max_new_tokens: adv.maxNewTokens,
                    do_sample: adv.doSample,
                    stream: false,
                },
            },
        };
        appState.addLog(
            "v4",
            "Voice-clone synth payload",
            JSON.stringify(args),
        );
        await voiceState.synthesize(args);
    }

    function gotoModels() {
        void goto("/models");
    }

    // native dragdrop listener - only way to get real filesystem paths
    $effect(() => {
        let unlisten: (() => void) | null = null;
        let disposed = false;
        (async () => {
            try {
                const fn = await getCurrentWebview().onDragDropEvent((ev) => {
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
                });
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

    function formatCreated(ms: number): string {
        try {
            const d = new Date(ms);
            return d.toLocaleString();
        } catch {
            return "";
        }
    }

    const durationLabel = $derived.by(() => {
        if (durationSec === null) return null;
        const pretty = formatTime(durationSec);
        if (durationSec < MIN_RECOMMENDED_SEC) {
            return {
                label: `${pretty} (too short — 10-30s recommended)`,
                warn: true,
            };
        }
        if (durationSec > HARD_WARN_SEC) {
            return {
                label: `${pretty} (too long — 10-30s recommended)`,
                warn: true,
            };
        }
        if (durationSec > MAX_RECOMMENDED_SEC) {
            return { label: `${pretty} (over 30s — may drift)`, warn: true };
        }
        return { label: pretty, warn: false };
    });
</script>

<div class="grid grid-cols-3 gap-6 pt-2">
    <div class="col-span-2 space-y-6">
        <div class="space-y-2">
            <Label class="text-sm font-semibold">Profile Name</Label>
            <Input
                bind:value={profileName}
                placeholder="E.g., Alex (my voice)"
                class="max-w-md"
                oninput={() => (showNameError = false)}
            />
            {#if showNameError}
                <p class="text-xs text-destructive">
                    Profile name is required.
                </p>
            {/if}
        </div>

        <div class="space-y-2">
            <Label class="text-sm font-semibold">Reference Audio</Label>
            <p class="text-xs text-muted-foreground">
                Upload a clean, clear sample (10-30 seconds) of the voice you
                want to clone. WAV, MP3, or FLAC; max 30 MB.
            </p>

            <div
                class="border-2 border-dashed rounded-xl p-6 text-center flex flex-col items-center justify-center transition-colors {isDragging
                    ? 'bg-primary/10 border-primary'
                    : showAudioError
                      ? 'bg-destructive/5 border-destructive/40'
                      : 'bg-muted/10'}"
                role="presentation"
                ondragover={onDragOver}
                ondragleave={onDragLeave}
                ondrop={onDrop}
            >
                {#if refAudio}
                    <div
                        class="w-full flex items-center gap-3 p-3 rounded-md border bg-background"
                    >
                        <FileAudio class="w-8 h-8 text-primary shrink-0" />
                        <div class="flex-1 min-w-0 text-left">
                            <div
                                class="font-medium truncate"
                                title={refAudio.path}
                            >
                                {filenameFromPath(refAudio.path)}
                            </div>
                            <div
                                class="text-xs text-muted-foreground font-mono flex gap-2 items-center"
                            >
                                <span>{formatBytes(refAudio.bytes)}</span>
                                {#if durationLabel}
                                    <span>·</span>
                                    <span
                                        class={durationLabel.warn
                                            ? "text-amber-500"
                                            : ""}
                                    >
                                        {durationLabel.label}
                                    </span>
                                {/if}
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            class="shrink-0"
                            onclick={removeRef}
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
                        Drop a reference file here
                    </h3>
                    <p class="text-xs text-muted-foreground mt-1">
                        WAV, MP3, FLAC (max 30 MB)
                    </p>

                    <div class="flex items-center gap-4 w-full max-w-xs mt-5">
                        <div class="h-[1px] flex-1 bg-border"></div>
                        <span
                            class="text-xs text-muted-foreground uppercase font-semibold"
                        >
                            OR
                        </span>
                        <div class="h-[1px] flex-1 bg-border"></div>
                    </div>

                    <div class="mt-5">
                        <RecorderButton
                            maxDurationSec={60}
                            warnDurationSec={30}
                            {onRecorded}
                        />
                    </div>
                {/if}
            </div>
            {#if showAudioError}
                <p class="text-xs text-destructive">
                    A reference audio clip is required.
                </p>
            {/if}
            {#if probeBlobUrl}
                <audio
                    src={probeBlobUrl}
                    preload="metadata"
                    class="hidden"
                    onloadedmetadata={onProbeLoaded}
                ></audio>
            {/if}
        </div>

        <div class="space-y-2">
            <div class="flex items-center justify-between">
                <Label class="text-sm font-semibold">
                    Reference Text / Transcript
                    <span class="text-xs text-muted-foreground font-normal">
                        (recommended)
                    </span>
                </Label>
                {#if hasSttModel && refAudio}
                    <Button
                        variant="outline"
                        size="sm"
                        onclick={onTranscribeRef}
                        disabled={isTranscribingRef}
                        class="h-7 text-xs gap-1.5"
                    >
                        {#if isTranscribingRef}
                            <Loader2 class="w-3.5 h-3.5 animate-spin" />
                            Transcribing…
                        {:else}
                            <FileAudio class="w-3.5 h-3.5" />
                            Transcribe
                        {/if}
                    </Button>
                {/if}
            </div>
            <p class="text-xs text-muted-foreground">
                The exact transcript of what is spoken in the reference audio.
                Strongly improves clone accuracy when in-context learning is on.
            </p>
            <Textarea
                bind:value={refText}
                placeholder="Type exactly what the speaker is saying in the uploaded audio..."
                class="resize-y min-h-[100px]"
            />
        </div>

        <div class="space-y-2">
            <Label class="text-sm font-semibold">
                Notes
                <span class="text-xs text-muted-foreground font-normal">
                    (optional, not sent to the backend)
                </span>
            </Label>
            <Input
                bind:value={notes}
                placeholder="E.g., Recorded in studio, slightly raspy"
            />
        </div>

        <div
            class="rounded-md border p-3 flex items-start justify-between gap-4"
        >
            <div class="space-y-0.5">
                <Label class="text-sm font-semibold">
                    Advanced: x-vector only
                </Label>
                <p class="text-xs text-muted-foreground">
                    Use speaker embedding only — faster, but ignores the
                    transcript.
                </p>
            </div>
            <Switch
                checked={xVectorOnly}
                onCheckedChange={(v) => (xVectorOnly = v)}
            />
        </div>

        <div class="pt-4 border-t flex items-center gap-3">
            <Button
                size="lg"
                class="gap-2"
                disabled={!canCreate}
                onclick={onCreate}
            >
                Create Voice Clone
            </Button>
            {#if !canCreate}
                <span class="text-xs text-muted-foreground">
                    Add a name and reference audio to continue.
                </span>
            {/if}
        </div>

        <div class="pt-6 border-t space-y-3">
            <div class="flex items-center justify-between">
                <div>
                    <h3 class="text-base font-semibold">Try this voice</h3>
                    <p class="text-xs text-muted-foreground">
                        {#if selectedProfile}
                            Using profile
                            <span class="font-mono">
                                {selectedProfile.label}
                            </span>
                        {:else}
                            Select a profile from the list to preview it.
                        {/if}
                    </p>
                </div>
            </div>

            {#if !hasCloneModel}
                <div
                    class="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground"
                >
                    <Info class="w-4 h-4 mt-0.5 shrink-0" />
                    <div class="space-y-2">
                        <p>
                            No <code class="font-mono"
                                >qwen3_tts_voice_clone</code
                            > model is loaded. Profiles still save locally — load
                            a custom-voice model to synthesize.
                        </p>
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
                <Textarea
                    bind:value={tryText}
                    placeholder="Type a short sample to render in this voice..."
                    class="resize-y min-h-[100px]"
                />
                <div class="flex items-center gap-3">
                    <Button
                        class="gap-2"
                        disabled={!canSynthesize}
                        onclick={onSynthesize}
                    >
                        {#if voiceState.isSynthesizing}
                            <Loader2 class="w-4 h-4 animate-spin" />
                            Synthesizing...
                        {:else}
                            <Play class="w-4 h-4 fill-current" />
                            Synthesize
                        {/if}
                    </Button>
                    {#if !selectedProfile}
                        <span class="text-xs text-muted-foreground">
                            Select a profile first.
                        </span>
                    {/if}
                </div>
                <AudioPlayer
                    class="mt-2"
                    src={voiceState.activeGeneration?.path ?? null}
                    kind="file"
                />
            {/if}
        </div>
    </div>

    <div class="space-y-4 p-5 border rounded-xl bg-muted/5 h-fit">
        <div class="space-y-1">
            <h3 class="text-sm font-semibold">Clone Model</h3>
            {#if cloneModels.length === 0}
                <div
                    class="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground"
                >
                    <Info class="w-4 h-4 mt-0.5 shrink-0" />
                    <div class="space-y-2">
                        <p>
                            Load a
                            <code class="font-mono">
                                qwen3_tts_voice_clone
                            </code>
                            model to synthesize from profiles.
                        </p>
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
                    value={selectedCloneModel ?? undefined}
                    onValueChange={(v) => (selectedCloneModel = v ?? null)}
                >
                    <Select.Trigger
                        class="h-9 text-sm w-full"
                        title={selectedCloneModel ?? undefined}
                    >
                        <span class="truncate min-w-0 flex-1 text-left">
                            {selectedCloneModel ?? "Select model"}
                        </span>
                    </Select.Trigger>
                    <Select.Content>
                        {#each cloneModels as name (name)}
                            <Select.Item value={name} label={name}>
                                {name}
                            </Select.Item>
                        {/each}
                    </Select.Content>
                </Select.Root>
            {/if}
        </div>

        <div class="space-y-2">
            <h3 class="text-sm font-semibold">
                Saved Profiles
                <span class="ml-1 text-xs text-muted-foreground font-normal">
                    ({cloneProfiles.length})
                </span>
            </h3>
            {#if cloneProfiles.length === 0}
                <p class="text-xs text-muted-foreground">
                    No voice clone profiles yet. Create one with the form.
                </p>
            {:else}
                <ul class="space-y-1.5">
                    {#each cloneProfiles as profile (profile.id)}
                        <li>
                            <div
                                class="flex items-center gap-2 p-2 rounded-md border transition-colors {selectedProfileId ===
                                profile.id
                                    ? 'bg-primary/10 border-primary'
                                    : 'bg-background hover:bg-muted/30'}"
                            >
                                <button
                                    type="button"
                                    class="flex-1 min-w-0 text-left"
                                    onclick={() => selectProfile(profile.id)}
                                >
                                    <div
                                        class="font-medium text-sm truncate"
                                        title={profile.label}
                                    >
                                        {profile.label}
                                    </div>
                                    <div
                                        class="text-[11px] text-muted-foreground font-mono"
                                    >
                                        {formatCreated(profile.createdAt)}
                                    </div>
                                </button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                                    onclick={() => onDelete(profile)}
                                    title="Delete profile"
                                    aria-label="Delete profile"
                                >
                                    <Trash2 class="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    </div>
</div>
