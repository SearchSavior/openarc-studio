<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Textarea } from "$lib/components/ui/textarea";
    import { Slider } from "$lib/components/ui/slider";
    import { Switch } from "$lib/components/ui/switch";
    import { Label } from "$lib/components/ui/label";
    import { Input } from "$lib/components/ui/input";
    import * as Select from "$lib/components/ui/select";
    import * as Tooltip from "$lib/components/ui/tooltip";
    import { appState } from "$lib/state.svelte.js";
    import {
        voiceState,
        isVoiceCloneCapable,
        type SpeechArgs,
        type VoiceProfile,
    } from "$lib/voice.svelte.js";
    import { openarc } from "$lib/client.svelte.js";
    import {
        KOKORO_LANGUAGES,
        voicesForLanguage,
        type KokoroLangCode,
    } from "$lib/kokoro";
    import {
        QWEN3_TTS_SPEAKERS,
        QWEN3_TTS_LANGUAGES,
    } from "$lib/qwen3_tts_speakers";
    import { goto } from "$app/navigation";
    import {
        Play,
        Download,
        Loader2,
        Info,
        UserCircle2,
        X,
    } from "@lucide/svelte";
    import AudioPlayer from "./AudioPlayer.svelte";
    import RefAudioButton from "./RefAudioButton.svelte";

    type TtsKind =
        | "kokoro"
        | "qwen3_tts_custom_voice"
        | "qwen3_tts_voice_clone";

    type TtsModelEntry = {
        name: string;
        kind: TtsKind;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type RawModel = { model_name?: string; model_type?: string } & Record<
        string,
        any
    >;

    let textInput = $state("");
    let speedSignal = $state([1.0]);

    // pick up text from the sidebar when user opens a recent generation, consume-and-clear
    $effect(() => {
        const pending = voiceState.pendingTextToLoad;
        if (pending === null) return;
        textInput = pending;
        voiceState.pendingTextToLoad = null;
    });
    let kokoroLangCode = $state<KokoroLangCode>("a");
    let qwen3SpeakerId = $state<string>(QWEN3_TTS_SPEAKERS[0]?.id ?? "");
    let qwen3LangCode = $state<string>("auto");
    let qwen3Instruct = $state<string>("");

    const ttsModels = $derived.by<TtsModelEntry[]>(() => {
        const raw = (openarc.status?.models ?? []) as RawModel[];
        return raw
            .filter(
                (m) =>
                    m?.model_type === "kokoro" ||
                    m?.model_type === "qwen3_tts_custom_voice" ||
                    m?.model_type === "qwen3_tts_voice_clone",
            )
            .map((m) => ({
                name: String(m.model_name ?? ""),
                kind: m.model_type as TtsKind,
            }))
            .filter((m) => m.name.length > 0);
    });

    const selectedModelEntry = $derived.by<TtsModelEntry | null>(() => {
        const sel = voiceState.selectedTtsModel;
        if (!sel) return null;
        return ttsModels.find((m) => m.name === sel) ?? null;
    });

    const selectedKind = $derived<TtsKind | null>(
        selectedModelEntry?.kind ?? null,
    );

    // autoselect a valid tts model when list changes or current selection disappears
    $effect(() => {
        const list = ttsModels;
        const current = voiceState.selectedTtsModel;
        const stillValid = !!current && list.some((m) => m.name === current);
        if (!stillValid) {
            voiceState.selectedTtsModel = list[0]?.name ?? null;
        }
    });

    // prefer model loaded as qwen3_tts_voice_clone (actual dispatch path).
    // fall back to qwen3_tts_custom_voice with "CustomVoice" in name.
    const cloneCapableModelName = $derived.by<string | null>(() => {
        const preferred = ttsModels.find(
            (m) => m.kind === "qwen3_tts_voice_clone",
        );
        if (preferred) return preferred.name;
        const fallback = ttsModels.find((m) =>
            isVoiceCloneCapable(m.kind, m.name),
        );
        return fallback?.name ?? null;
    });

    const hasCloneCapableModel = $derived(cloneCapableModelName !== null);

    // profiles need a ref audio file to be synthesizable - legacy design
    // profiles without one stay in the list but are disabled.
    const savedProfiles = $derived(
        voiceState.profiles.slice().sort((a, b) => b.createdAt - a.createdAt),
    );

    const selectedProfile = $derived.by<VoiceProfile | null>(() => {
        const id = voiceState.selectedProfileId;
        if (!id) return null;
        return voiceState.profiles.find((p) => p.id === id) ?? null;
    });

    // drop the profile when the active tts model cant host it, prevents
    // silently sending a profile id the backend would ignore
    $effect(() => {
        const entry = selectedModelEntry;
        if (
            voiceState.selectedProfileId &&
            !isVoiceCloneCapable(entry?.kind, entry?.name)
        ) {
            voiceState.selectedProfileId = null;
        }
    });

    // if selected profile was deleted elsewhere, clear the pointer
    $effect(() => {
        const id = voiceState.selectedProfileId;
        if (!id) return;
        const exists = voiceState.profiles.some((p) => p.id === id);
        if (!exists) voiceState.selectedProfileId = null;
    });

    function selectProfile(profile: VoiceProfile) {
        if (!profile.refAudioPath) return;
        if (!cloneCapableModelName) return;
        voiceState.selectedTtsModel = cloneCapableModelName;
        voiceState.selectedProfileId = profile.id;
    }

    function clearProfile() {
        voiceState.selectedProfileId = null;
    }

    // keep kokoro voice coherent with chosen language, pick first matching voice
    $effect(() => {
        if (selectedKind !== "kokoro") return;
        const voices = voicesForLanguage(kokoroLangCode);
        const current = voiceState.selectedVoice;
        const stillValid = !!current && voices.some((v) => v.id === current);
        if (!stillValid) {
            voiceState.selectedVoice = voices[0]?.id ?? null;
        }
    });

    // mirror kokoro language into voiceState.selectedLanguage for a single
    // source of truth (qwen3 branch updates it when user changes the override)
    $effect(() => {
        if (selectedKind === "kokoro") {
            voiceState.selectedLanguage = kokoroLangCode;
        } else if (
            selectedKind === "qwen3_tts_custom_voice" ||
            selectedKind === "qwen3_tts_voice_clone"
        ) {
            voiceState.selectedLanguage = qwen3LangCode;
        }
    });

    const kokoroVoices = $derived(voicesForLanguage(kokoroLangCode));

    // voice_clone requires a saved profile - no presetspeaker path available
    const needsProfile = $derived(
        selectedKind === "qwen3_tts_voice_clone" && !selectedProfile,
    );

    const canSynthesize = $derived(
        !!textInput.trim() &&
            !!voiceState.selectedTtsModel &&
            !voiceState.isSynthesizing &&
            !needsProfile,
    );

    async function onSynthesize() {
        if (!canSynthesize) return;
        const entry = selectedModelEntry;
        if (!entry) return;

        let args: SpeechArgs;
        const profile = selectedProfile;
        if (profile && isVoiceCloneCapable(entry.kind, entry.name)) {
            const adv = voiceState.advanced.qwen3Tts;
            const lang = qwen3LangCode === "auto" ? null : qwen3LangCode;
            args = {
                model: entry.name,
                input: textInput,
                voice: profile.label,
                voiceProfileId: profile.id,
                language: lang ?? undefined,
                responseFormat: "wav",
                openarcTts: {
                    qwen3_tts: {
                        input: textInput,
                        instruct: null,
                        language: lang,
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
                "TTS payload (profile)",
                JSON.stringify(args),
            );
            await voiceState.synthesize(args);
            return;
        }

        if (entry.kind === "kokoro") {
            const voiceId =
                voiceState.selectedVoice ?? kokoroVoices[0]?.id ?? "";
            if (!voiceId) {
                appState.addLog(
                    "error",
                    "Kokoro synth aborted — no voice selected",
                );
                return;
            }
            args = {
                model: entry.name,
                input: textInput,
                voice: voiceId,
                language: kokoroLangCode,
                responseFormat: "wav",
                openarcTts: {
                    kokoro: {
                        input: textInput,
                        voice: voiceId,
                        lang_code: kokoroLangCode,
                        speed: speedSignal[0],
                        character_count_chunk:
                            voiceState.advanced.kokoro.characterCountChunk,
                        response_format: "wav",
                    },
                },
            };
        } else {
            const speakerId = qwen3SpeakerId;
            if (!speakerId) {
                appState.addLog(
                    "error",
                    "Qwen3-TTS synth aborted — no speaker selected",
                );
                return;
            }
            const lang = qwen3LangCode === "auto" ? null : qwen3LangCode;
            const instruct = qwen3Instruct.trim() || null;
            const adv = voiceState.advanced.qwen3Tts;
            args = {
                model: entry.name,
                input: textInput,
                voice: speakerId,
                instructions: instruct ?? undefined,
                language: lang ?? undefined,
                responseFormat: "wav",
                openarcTts: {
                    qwen3_tts: {
                        input: textInput,
                        speaker: speakerId,
                        instruct,
                        language: lang,
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
        }

        appState.addLog("v4", "TTS payload", JSON.stringify(args));
        await voiceState.synthesize(args);
    }

    // export gated on backend availability - plugin-dialog and plugin-fs
    // are not installed in this workspace so savedisk is not wired up yet
    const exportDisabledReason =
        "Export is not available yet — saving to disk isn't wired up.";

    async function onExport() {
        appState.addLog(
            "warn",
            "Export requested but save-dialog plumbing is not yet wired",
            exportDisabledReason,
        );
    }

    function onAutoPlayChange(next: boolean) {
        voiceState.advanced.kokoro.autoPlay = next;
        void voiceState.savePresets();
    }

    function gotoModels() {
        void goto("/models");
    }
</script>

<div class="grid grid-cols-3 gap-6 pt-2">
    <div class="col-span-2 space-y-4">
        {#if selectedProfile}
            <div
                class="flex items-center gap-2 rounded-md border bg-primary/5 px-3 py-2 text-sm"
            >
                <UserCircle2 class="w-4 h-4 text-primary shrink-0" />
                <div class="flex-1 min-w-0">
                    <div class="font-medium truncate">
                        Using saved voice: {selectedProfile.label}
                    </div>
                    <div class="text-[11px] text-muted-foreground truncate">
                        {selectedProfile.kind === "clone"
                            ? "Voice clone"
                            : "Voice design"}
                        · renders through
                        <span class="font-mono">
                            {cloneCapableModelName ?? "—"}
                        </span>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-7 w-7 shrink-0"
                    onclick={clearProfile}
                    title="Clear saved voice"
                    aria-label="Clear saved voice"
                >
                    <X class="w-4 h-4" />
                </Button>
            </div>
        {/if}

        <div class="relative">
            <Textarea
                bind:value={textInput}
                placeholder="Enter text to synthesize... (e.g., 'Hello, welcome to OpenArc Studio.')"
                class="min-h-[250px] resize-y text-base p-4"
            />
            <div
                class="absolute bottom-3 right-3 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded"
            >
                {textInput.length} characters
            </div>
        </div>

        <div class="flex items-center gap-3">
            <Button
                class="gap-2"
                size="lg"
                disabled={!canSynthesize}
                onclick={onSynthesize}
            >
                {#if voiceState.isSynthesizing}
                    <Loader2 class="w-4 h-4 animate-spin" />
                    Synthesizing...
                {:else}
                    <Play class="w-4 h-4 fill-current" />
                    Synthesize Audio
                {/if}
            </Button>

            <Tooltip.Provider>
                <Tooltip.Root>
                    <Tooltip.Trigger>
                        {#snippet child({ props })}
                            <Button
                                {...props}
                                variant="outline"
                                class="gap-2"
                                size="lg"
                                disabled={true}
                                onclick={onExport}
                            >
                                <Download class="w-4 h-4" />
                                Export
                            </Button>
                        {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content side="bottom">
                        {exportDisabledReason}
                    </Tooltip.Content>
                </Tooltip.Root>
            </Tooltip.Provider>

            {#if needsProfile}
                <span class="text-xs text-muted-foreground">
                    Pick a saved voice to use this model.
                </span>
            {/if}
        </div>

        <AudioPlayer
            class="mt-6"
            src={voiceState.activeGeneration?.path ?? null}
            kind="file"
            autoplay={voiceState.advanced.kokoro.autoPlay}
            playToken={voiceState.playGenerationNonce}
        />
    </div>

    <div class="space-y-4 p-5 border rounded-xl bg-muted/5 h-fit">
        <div class="space-y-1">
            <h3 class="text-sm font-semibold">TTS Model</h3>
            {#if ttsModels.length === 0}
                <div
                    class="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground"
                >
                    <Info class="w-4 h-4 mt-0.5 shrink-0" />
                    <div class="space-y-2">
                        <p>No TTS model loaded.</p>
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
                    value={voiceState.selectedTtsModel ?? undefined}
                    onValueChange={(v) =>
                        (voiceState.selectedTtsModel = v ?? null)}
                >
                    <Select.Trigger
                        class="h-9 text-sm w-full"
                        title={voiceState.selectedTtsModel ?? undefined}
                    >
                        <span class="truncate min-w-0 flex-1 text-left">
                            {voiceState.selectedTtsModel ?? "Select model"}
                        </span>
                    </Select.Trigger>
                    <Select.Content>
                        {#each ttsModels as m (m.name)}
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

        {#if selectedKind === "kokoro"}
            <div class="space-y-1">
                <h3 class="text-sm font-semibold">Language</h3>
                <Select.Root
                    type="single"
                    value={kokoroLangCode}
                    onValueChange={(v) => {
                        if (v) kokoroLangCode = v as KokoroLangCode;
                    }}
                >
                    <Select.Trigger class="h-9 text-sm w-full">
                        {KOKORO_LANGUAGES.find((l) => l.code === kokoroLangCode)
                            ?.label ?? "Select language"}
                    </Select.Trigger>
                    <Select.Content>
                        {#each KOKORO_LANGUAGES as lang (lang.code)}
                            <Select.Item value={lang.code} label={lang.label}>
                                {lang.label}
                            </Select.Item>
                        {/each}
                    </Select.Content>
                </Select.Root>
            </div>

            <div class="space-y-1">
                <h3 class="text-sm font-semibold">Voice</h3>
                <Select.Root
                    type="single"
                    value={voiceState.selectedVoice ?? undefined}
                    onValueChange={(v) =>
                        (voiceState.selectedVoice = v ?? null)}
                >
                    <Select.Trigger class="h-9 text-sm w-full">
                        {kokoroVoices.find(
                            (v) => v.id === voiceState.selectedVoice,
                        )?.label ?? "Select voice"}
                    </Select.Trigger>
                    <Select.Content>
                        {#each kokoroVoices as voice (voice.id)}
                            <Select.Item value={voice.id} label={voice.label}>
                                {voice.label}
                            </Select.Item>
                        {/each}
                    </Select.Content>
                </Select.Root>
            </div>

            <div class="space-y-2">
                <div class="flex justify-between items-center">
                    <h3 class="text-sm font-semibold">Speech Speed</h3>
                    <span
                        class="text-xs font-mono bg-muted px-2 py-0.5 rounded"
                    >
                        {speedSignal[0].toFixed(2)}x
                    </span>
                </div>
                <Slider
                    type="multiple"
                    bind:value={speedSignal}
                    max={2.0}
                    min={0.25}
                    step={0.05}
                />
            </div>
        {:else if selectedKind === "qwen3_tts_custom_voice" || selectedKind === "qwen3_tts_voice_clone"}
            <div class="space-y-1">
                <h3 class="text-sm font-semibold">Speaker</h3>
                <Select.Root
                    type="single"
                    value={qwen3SpeakerId}
                    onValueChange={(v) => {
                        if (v) qwen3SpeakerId = v;
                    }}
                    disabled={!!selectedProfile}
                >
                    <Select.Trigger class="h-9 text-sm w-full">
                        {selectedProfile
                            ? `${selectedProfile.label}`
                            : (QWEN3_TTS_SPEAKERS.find(
                                  (s) => s.id === qwen3SpeakerId,
                              )?.label ?? "Select speaker")}
                    </Select.Trigger>
                    <Select.Content>
                        {#each QWEN3_TTS_SPEAKERS as s (s.id)}
                            <Select.Item value={s.id} label={s.label}>
                                {s.label}
                            </Select.Item>
                        {/each}
                    </Select.Content>
                </Select.Root>
            </div>

            <div class="space-y-1">
                <h3 class="text-sm font-semibold">
                    Style instruction
                    <span class="text-xs text-muted-foreground font-normal">
                        (optional)
                    </span>
                </h3>
                <Input
                    type="text"
                    bind:value={qwen3Instruct}
                    placeholder="e.g. 'Whisper softly with a warm tone'"
                />
            </div>

            <div class="space-y-1">
                <h3 class="text-sm font-semibold">Language override</h3>
                <Select.Root
                    type="single"
                    value={qwen3LangCode}
                    onValueChange={(v) => {
                        if (v) qwen3LangCode = v;
                    }}
                >
                    <Select.Trigger class="h-9 text-sm w-full">
                        {QWEN3_TTS_LANGUAGES.find(
                            (l) => l.code === qwen3LangCode,
                        )?.label ?? "Auto-detect"}
                    </Select.Trigger>
                    <Select.Content>
                        {#each QWEN3_TTS_LANGUAGES as lang (lang.code)}
                            <Select.Item value={lang.code} label={lang.label}>
                                {lang.label}
                            </Select.Item>
                        {/each}
                    </Select.Content>
                </Select.Root>
            </div>
        {/if}

        <div class="pt-4 border-t space-y-2">
            <div class="flex items-center justify-between">
                <h3 class="text-sm font-semibold">
                    Saved voices
                    <span
                        class="ml-1 text-xs text-muted-foreground font-normal"
                    >
                        ({savedProfiles.length})
                    </span>
                </h3>
            </div>
            {#if savedProfiles.length === 0}
                <p class="text-xs text-muted-foreground">
                    No saved voices yet. Create one in Voice Cloning or Voice
                    Design.
                </p>
            {:else}
                {#if !hasCloneCapableModel}
                    <p class="text-xs text-muted-foreground">
                        Load a voice-clone model to enable saved voices.
                    </p>
                {/if}
                <ul class="space-y-1.5">
                    {#each savedProfiles as profile (profile.id)}
                        {@const usable =
                            !!profile.refAudioPath && hasCloneCapableModel}
                        {@const active =
                            voiceState.selectedProfileId === profile.id}
                        <li class="flex items-center gap-1.5">
                            <button
                                type="button"
                                class="flex-1 min-w-0 flex items-center gap-2 p-2 rounded-md border text-left transition-colors {active
                                    ? 'bg-primary/10 border-primary'
                                    : 'bg-background hover:bg-muted/30'} {usable
                                    ? ''
                                    : 'opacity-50 cursor-not-allowed'}"
                                disabled={!usable}
                                onclick={() => selectProfile(profile)}
                                title={!profile.refAudioPath
                                    ? "Saved before reference audio was wired — re-save from Voice Design to use it."
                                    : !hasCloneCapableModel
                                      ? "Requires a loaded voice-clone model."
                                      : `Use ${profile.label}`}
                            >
                                <UserCircle2
                                    class="w-4 h-4 shrink-0 text-muted-foreground"
                                />
                                <div class="flex-1 min-w-0">
                                    <div class="font-medium text-sm truncate">
                                        {profile.label}
                                    </div>
                                    <div
                                        class="text-[11px] text-muted-foreground"
                                    >
                                        {profile.kind === "clone"
                                            ? "Voice clone"
                                            : "Voice design"}
                                    </div>
                                </div>

                                <div>
                                    <RefAudioButton
                                        filePath={profile.refAudioPath}
                                        disabled={!profile.refAudioPath}
                                    />
                                </div>
                            </button>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>

        <div class="pt-4 border-t space-y-3">
            <div class="flex items-center justify-between">
                <Label class="text-sm">Auto-play on completion</Label>
                <Switch
                    checked={voiceState.advanced.kokoro.autoPlay}
                    onCheckedChange={onAutoPlayChange}
                />
            </div>
        </div>
    </div>
</div>
