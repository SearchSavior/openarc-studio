<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import * as Select from "$lib/components/ui/select";
    import { Slider } from "$lib/components/ui/slider";
    import { Switch } from "$lib/components/ui/switch";
    import { appState } from "$lib/state.svelte.js";
    import {
        KOKORO_DEFAULTS,
        QWEN3_ASR_DEFAULTS,
        QWEN3_TTS_DEFAULTS,
        voiceState,
        type Qwen3AsrAdvanced,
        type SttKind,
        type TtsKind,
    } from "$lib/voice.svelte.js";
    import { openarc } from "$lib/client.svelte.js";
    import { Info, RotateCcw, Save } from "@lucide/svelte";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type RawModel = { model_name?: string; model_type?: string } & Record<string, any>;

    const activeMode = $derived(voiceState.mode);
    const activeTab = $derived(voiceState.ttsTab);

    const selectedTtsKind = $derived.by<TtsKind | null>(() => {
        const name = voiceState.selectedTtsModel;
        if (!name) return null;
        const raw = (openarc.status?.models ?? []) as RawModel[];
        const hit = raw.find((m) => m?.model_name === name);
        const kind = hit?.model_type;
        if (
            kind === "kokoro" ||
            kind === "qwen3_tts_custom_voice" ||
            kind === "qwen3_tts_voice_design" ||
            kind === "qwen3_tts_voice_clone"
        ) {
            return kind;
        }
        return null;
    });

    const selectedSttKind = $derived.by<SttKind | null>(() => {
        const name = voiceState.selectedSttModel;
        if (!name) return null;
        const raw = (openarc.status?.models ?? []) as RawModel[];
        const hit = raw.find((m) => m?.model_name === name);
        const kind = hit?.model_type;
        if (kind === "whisper" || kind === "qwen3_asr") return kind;
        return null;
    });

    type Section =
        | "kokoro"
        | "qwen3_tts"
        | "whisper"
        | "qwen3_asr"
        | "empty";

    const section = $derived.by<Section>(() => {
        if (activeMode === "tts") {
            if (activeTab === "generation") {
                if (selectedTtsKind === "kokoro") return "kokoro";
                if (selectedTtsKind === "qwen3_tts_custom_voice")
                    return "qwen3_tts";
                return "empty";
            }
            // cloning + voice_design both use the qwen3-tts sampling block
            return "qwen3_tts";
        }
        if (activeMode === "stt") {
            if (selectedSttKind === "whisper") return "whisper";
            if (selectedSttKind === "qwen3_asr") return "qwen3_asr";
            return "empty";
        }
        return "empty";
    });

    // clamp to [min, max] and snap to nearest step starting from min
    function clampNumeric(
        value: number,
        min: number,
        max: number,
        step: number,
    ): number {
        if (!Number.isFinite(value)) return min;
        const clamped = Math.min(max, Math.max(min, value));
        if (step <= 0) return clamped;
        const snapped = Math.round((clamped - min) / step) * step + min;
        const out = Math.min(max, Math.max(min, snapped));
        // avoid trailing float noise like 0.30000000000000004
        const decimals = (step.toString().split(".")[1] ?? "").length;
        return decimals > 0
            ? Number(out.toFixed(decimals))
            : Math.round(out);
    }

    // tracks invalid input ids for aria-invalid + red ring, cleared on blur after clamping
    let invalidIds = $state<Record<string, true>>({});

    function markInvalid(id: string) {
        invalidIds = { ...invalidIds, [id]: true };
    }

    function clearInvalid(id: string) {
        if (!invalidIds[id]) return;
        const next = { ...invalidIds };
        delete next[id];
        invalidIds = next;
    }

    // on blur: coerce, clamp, snap, write back and flag red if out of bounds
    type NumericTarget = {
        get: () => number;
        set: (v: number) => void;
        min: number;
        max: number;
        step: number;
        id: string;
        label: string;
    };

    function onNumericBlur(target: NumericTarget, rawInput: string) {
        const raw = Number(rawInput);
        const { min, max, step, id, label } = target;
        const outOfBounds =
            !Number.isFinite(raw) || raw < min || raw > max;
        const clamped = clampNumeric(raw, min, max, step);
        if (outOfBounds) {
            markInvalid(id);
            appState.addLog(
                "v3",
                `Advanced: ${label} out of range, clamped to ${clamped}`,
                `raw=${rawInput} min=${min} max=${max}`,
            );
            // clear on next tick so user sees the red ring briefly
            target.set(clamped);
            setTimeout(() => clearInvalid(id), 600);
            return;
        }
        target.set(clamped);
        clearInvalid(id);
    }

    function resetKokoro() {
        voiceState.advanced.kokoro = { ...KOKORO_DEFAULTS };
        appState.addLog("v1", "Reset Kokoro advanced settings to defaults");
    }

    function resetQwen3Tts() {
        voiceState.advanced.qwen3Tts = { ...QWEN3_TTS_DEFAULTS };
        appState.addLog(
            "v1",
            "Reset Qwen3-TTS advanced settings to defaults",
        );
    }

    function resetQwen3Asr() {
        // preserve language - owned by the SpeechToText right card
        const currentLanguage = voiceState.advanced.qwen3Asr.language;
        voiceState.advanced.qwen3Asr = {
            ...QWEN3_ASR_DEFAULTS,
            language: currentLanguage,
        };
        appState.addLog(
            "v1",
            "Reset Qwen3-ASR advanced settings to defaults",
        );
    }

    async function onSavePreset() {
        await voiceState.savePresets();
        appState.addLog("info", "Voice presets saved");
    }

    // bits-ui Slider expects number[]; local signals pushed back to store on change
    const qwen3TtsTempSignal = $derived<number[]>([
        voiceState.advanced.qwen3Tts.temperature,
    ]);
    const qwen3TtsTopPSignal = $derived<number[]>([
        voiceState.advanced.qwen3Tts.topP,
    ]);
    const qwen3TtsRepPenSignal = $derived<number[]>([
        voiceState.advanced.qwen3Tts.repetitionPenalty,
    ]);
    const qwen3AsrChunkSignal = $derived<number[]>([
        voiceState.advanced.qwen3Asr.maxChunkSec,
    ]);
    const qwen3AsrExpandSignal = $derived<number[]>([
        voiceState.advanced.qwen3Asr.searchExpandSec,
    ]);

    const ASR_RESPONSE_FORMATS: {
        value: Qwen3AsrAdvanced["responseFormat"];
        label: string;
    }[] = [
        { value: "json", label: "json" },
        { value: "verbose_json", label: "verbose_json" },
        { value: "text", label: "text" },
        { value: "srt", label: "srt" },
        { value: "vtt", label: "vtt" },
    ];

    function invalidClass(id: string): string {
        return invalidIds[id] ? "ring-2 ring-destructive" : "";
    }
</script>

<aside
    class="w-[300px] shrink-0 border-l bg-muted/10 flex flex-col p-4 overflow-y-auto h-full transition-all duration-200"
>
    <h2 class="font-semibold mb-4">Advanced Audio Config</h2>

    {#if section === "empty"}
        <div
            class="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground"
        >
            <Info class="w-4 h-4 mt-0.5 shrink-0" />
            <p>
                Select a model in the main view to configure advanced
                settings.
            </p>
        </div>
    {:else if section === "kokoro"}
        <div class="space-y-6">
            <div class="space-y-2">
                <Label class="text-sm font-medium" for="kokoro-chunk">
                    Character count chunk
                </Label>
                <Input
                    id="kokoro-chunk"
                    type="number"
                    min={50}
                    max={500}
                    step={10}
                    value={voiceState.advanced.kokoro.characterCountChunk}
                    aria-invalid={invalidIds["kokoro-chunk"] ? "true" : undefined}
                    class={invalidClass("kokoro-chunk")}
                    onblur={(e) =>
                        onNumericBlur(
                            {
                                get: () =>
                                    voiceState.advanced.kokoro
                                        .characterCountChunk,
                                set: (v) =>
                                    (voiceState.advanced.kokoro.characterCountChunk =
                                        v),
                                min: 50,
                                max: 500,
                                step: 10,
                                id: "kokoro-chunk",
                                label: "character_count_chunk",
                            },
                            (e.currentTarget as HTMLInputElement).value,
                        )}
                />
                <p class="text-xs text-muted-foreground">
                    Affects chunk-boundary artifacts; higher values yield
                    smoother transitions but longer waits.
                </p>
            </div>

            <div class="pt-4 border-t flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5 h-8 text-xs"
                    onclick={resetKokoro}
                >
                    <RotateCcw class="w-3 h-3" />
                    Reset defaults
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5 h-8 text-xs"
                    onclick={onSavePreset}
                >
                    <Save class="w-3 h-3" />
                    Save as preset
                </Button>
            </div>
        </div>
    {:else if section === "qwen3_tts"}
        <div class="space-y-6">
            <div class="space-y-2">
                <Label class="text-sm font-medium" for="qwen3-max-new-tokens">
                    Max new tokens
                </Label>
                <Input
                    id="qwen3-max-new-tokens"
                    type="number"
                    min={128}
                    max={4096}
                    step={64}
                    value={voiceState.advanced.qwen3Tts.maxNewTokens}
                    aria-invalid={invalidIds["qwen3-max-new-tokens"]
                        ? "true"
                        : undefined}
                    class={invalidClass("qwen3-max-new-tokens")}
                    onblur={(e) =>
                        onNumericBlur(
                            {
                                get: () =>
                                    voiceState.advanced.qwen3Tts.maxNewTokens,
                                set: (v) =>
                                    (voiceState.advanced.qwen3Tts.maxNewTokens =
                                        v),
                                min: 128,
                                max: 4096,
                                step: 64,
                                id: "qwen3-max-new-tokens",
                                label: "max_new_tokens",
                            },
                            (e.currentTarget as HTMLInputElement).value,
                        )}
                />
            </div>

            <div class="space-y-3">
                <div class="flex justify-between items-center">
                    <Label class="text-sm font-medium">Temperature</Label>
                    <span
                        class="text-xs font-mono bg-muted px-2 py-0.5 rounded"
                    >
                        {voiceState.advanced.qwen3Tts.temperature.toFixed(2)}
                    </span>
                </div>
                <Slider
                    type="multiple"
                    value={qwen3TtsTempSignal}
                    onValueChange={(v) => {
                        const first = Array.isArray(v) ? v[0] : undefined;
                        if (typeof first === "number") {
                            voiceState.advanced.qwen3Tts.temperature = first;
                        }
                    }}
                    min={0}
                    max={1.5}
                    step={0.05}
                />
            </div>

            <div class="space-y-2">
                <Label class="text-sm font-medium" for="qwen3-top-k">
                    Top-k
                </Label>
                <Input
                    id="qwen3-top-k"
                    type="number"
                    min={1}
                    max={200}
                    step={1}
                    value={voiceState.advanced.qwen3Tts.topK}
                    aria-invalid={invalidIds["qwen3-top-k"] ? "true" : undefined}
                    class={invalidClass("qwen3-top-k")}
                    onblur={(e) =>
                        onNumericBlur(
                            {
                                get: () => voiceState.advanced.qwen3Tts.topK,
                                set: (v) =>
                                    (voiceState.advanced.qwen3Tts.topK = v),
                                min: 1,
                                max: 200,
                                step: 1,
                                id: "qwen3-top-k",
                                label: "top_k",
                            },
                            (e.currentTarget as HTMLInputElement).value,
                        )}
                />
            </div>

            <div class="space-y-3">
                <div class="flex justify-between items-center">
                    <Label class="text-sm font-medium">Top-p</Label>
                    <span
                        class="text-xs font-mono bg-muted px-2 py-0.5 rounded"
                    >
                        {voiceState.advanced.qwen3Tts.topP.toFixed(2)}
                    </span>
                </div>
                <Slider
                    type="multiple"
                    value={qwen3TtsTopPSignal}
                    onValueChange={(v) => {
                        const first = Array.isArray(v) ? v[0] : undefined;
                        if (typeof first === "number") {
                            voiceState.advanced.qwen3Tts.topP = first;
                        }
                    }}
                    min={0.1}
                    max={1.0}
                    step={0.05}
                />
            </div>

            <div class="space-y-3">
                <div class="flex justify-between items-center">
                    <Label class="text-sm font-medium">
                        Repetition penalty
                    </Label>
                    <span
                        class="text-xs font-mono bg-muted px-2 py-0.5 rounded"
                    >
                        {voiceState.advanced.qwen3Tts.repetitionPenalty.toFixed(
                            2,
                        )}
                    </span>
                </div>
                <Slider
                    type="multiple"
                    value={qwen3TtsRepPenSignal}
                    onValueChange={(v) => {
                        const first = Array.isArray(v) ? v[0] : undefined;
                        if (typeof first === "number") {
                            voiceState.advanced.qwen3Tts.repetitionPenalty =
                                first;
                        }
                    }}
                    min={1.0}
                    max={1.5}
                    step={0.01}
                />
            </div>

            <div class="flex items-center justify-between">
                <Label class="text-sm font-medium">Do sample</Label>
                <Switch
                    checked={voiceState.advanced.qwen3Tts.doSample}
                    onCheckedChange={(next) =>
                        (voiceState.advanced.qwen3Tts.doSample = next)}
                />
            </div>

            {#if activeTab === "cloning"}
                <div class="space-y-1 pt-2 border-t">
                    <div class="flex items-center justify-between">
                        <Label class="text-sm font-medium">x-vector only</Label>
                        <Switch
                            checked={voiceState.advanced.qwen3Tts.xVectorOnly}
                            onCheckedChange={(next) =>
                                (voiceState.advanced.qwen3Tts.xVectorOnly =
                                    next)}
                        />
                    </div>
                    <p class="text-xs text-muted-foreground">
                        Use speaker embedding only — faster, but ignores the
                        reference transcript.
                    </p>
                </div>
            {/if}

            <details class="rounded-md border bg-muted/5 group">
                <summary
                    class="cursor-pointer list-none px-3 py-2 text-sm font-medium select-none flex items-center justify-between"
                >
                    Streaming
                    <span class="text-xs text-muted-foreground font-normal">
                        {voiceState.advanced.qwen3Tts.stream ? "on" : "off"}
                    </span>
                </summary>
                <div class="px-3 pb-3 pt-1 space-y-4">
                    <div class="flex items-center justify-between">
                        <Label class="text-sm">Stream</Label>
                        <Switch
                            checked={voiceState.advanced.qwen3Tts.stream}
                            onCheckedChange={(next) =>
                                (voiceState.advanced.qwen3Tts.stream = next)}
                        />
                    </div>

                    {#if voiceState.advanced.qwen3Tts.stream}
                        <div class="space-y-2">
                            <Label
                                class="text-sm font-medium"
                                for="qwen3-stream-frames"
                            >
                                Stream chunk frames
                            </Label>
                            <Input
                                id="qwen3-stream-frames"
                                type="number"
                                min={10}
                                max={200}
                                step={1}
                                value={voiceState.advanced.qwen3Tts
                                    .streamChunkFrames}
                                aria-invalid={invalidIds["qwen3-stream-frames"]
                                    ? "true"
                                    : undefined}
                                class={invalidClass("qwen3-stream-frames")}
                                onblur={(e) =>
                                    onNumericBlur(
                                        {
                                            get: () =>
                                                voiceState.advanced.qwen3Tts
                                                    .streamChunkFrames,
                                            set: (v) =>
                                                (voiceState.advanced.qwen3Tts.streamChunkFrames =
                                                    v),
                                            min: 10,
                                            max: 200,
                                            step: 1,
                                            id: "qwen3-stream-frames",
                                            label: "stream_chunk_frames",
                                        },
                                        (e.currentTarget as HTMLInputElement)
                                            .value,
                                    )}
                            />
                        </div>
                        <div class="space-y-2">
                            <Label
                                class="text-sm font-medium"
                                for="qwen3-stream-left"
                            >
                                Stream left context
                            </Label>
                            <Input
                                id="qwen3-stream-left"
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={voiceState.advanced.qwen3Tts
                                    .streamLeftContext}
                                aria-invalid={invalidIds["qwen3-stream-left"]
                                    ? "true"
                                    : undefined}
                                class={invalidClass("qwen3-stream-left")}
                                onblur={(e) =>
                                    onNumericBlur(
                                        {
                                            get: () =>
                                                voiceState.advanced.qwen3Tts
                                                    .streamLeftContext,
                                            set: (v) =>
                                                (voiceState.advanced.qwen3Tts.streamLeftContext =
                                                    v),
                                            min: 0,
                                            max: 100,
                                            step: 1,
                                            id: "qwen3-stream-left",
                                            label: "stream_left_context",
                                        },
                                        (e.currentTarget as HTMLInputElement)
                                            .value,
                                    )}
                            />
                        </div>
                    {/if}

                    <p class="text-xs text-muted-foreground">
                        Streaming playback is not implemented yet.
                    </p>
                </div>
            </details>

            <div class="pt-4 border-t flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5 h-8 text-xs"
                    onclick={resetQwen3Tts}
                >
                    <RotateCcw class="w-3 h-3" />
                    Reset defaults
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5 h-8 text-xs"
                    onclick={onSavePreset}
                >
                    <Save class="w-3 h-3" />
                    Save as preset
                </Button>
            </div>
        </div>
    {:else if section === "whisper"}
        <div
            class="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground leading-relaxed"
        >
            <Info class="w-4 h-4 mt-0.5 shrink-0" />
            <p>
                Whisper advanced options (language, translation,
                timestamps) are not available yet.
            </p>
        </div>
    {:else if section === "qwen3_asr"}
        <div class="space-y-6">
            <div class="space-y-2">
                <Label class="text-sm font-medium" for="asr-max-tokens">
                    Max tokens
                </Label>
                <Input
                    id="asr-max-tokens"
                    type="number"
                    min={128}
                    max={4096}
                    step={64}
                    value={voiceState.advanced.qwen3Asr.maxTokens}
                    aria-invalid={invalidIds["asr-max-tokens"]
                        ? "true"
                        : undefined}
                    class={invalidClass("asr-max-tokens")}
                    onblur={(e) =>
                        onNumericBlur(
                            {
                                get: () =>
                                    voiceState.advanced.qwen3Asr.maxTokens,
                                set: (v) =>
                                    (voiceState.advanced.qwen3Asr.maxTokens =
                                        v),
                                min: 128,
                                max: 4096,
                                step: 64,
                                id: "asr-max-tokens",
                                label: "max_tokens",
                            },
                            (e.currentTarget as HTMLInputElement).value,
                        )}
                />
            </div>

            <div class="space-y-3">
                <div class="flex justify-between items-center">
                    <Label class="text-sm font-medium">Max chunk (sec)</Label>
                    <span
                        class="text-xs font-mono bg-muted px-2 py-0.5 rounded"
                    >
                        {voiceState.advanced.qwen3Asr.maxChunkSec.toFixed(0)}
                    </span>
                </div>
                <Slider
                    type="multiple"
                    value={qwen3AsrChunkSignal}
                    onValueChange={(v) => {
                        const first = Array.isArray(v) ? v[0] : undefined;
                        if (typeof first === "number") {
                            voiceState.advanced.qwen3Asr.maxChunkSec = first;
                        }
                    }}
                    min={5}
                    max={120}
                    step={1}
                />
            </div>

            <div class="space-y-3">
                <div class="flex justify-between items-center">
                    <Label class="text-sm font-medium">
                        Search expand (sec)
                    </Label>
                    <span
                        class="text-xs font-mono bg-muted px-2 py-0.5 rounded"
                    >
                        {voiceState.advanced.qwen3Asr.searchExpandSec.toFixed(
                            1,
                        )}
                    </span>
                </div>
                <Slider
                    type="multiple"
                    value={qwen3AsrExpandSignal}
                    onValueChange={(v) => {
                        const first = Array.isArray(v) ? v[0] : undefined;
                        if (typeof first === "number") {
                            voiceState.advanced.qwen3Asr.searchExpandSec =
                                first;
                        }
                    }}
                    min={0.5}
                    max={30}
                    step={0.5}
                />
            </div>

            <div class="space-y-2">
                <Label class="text-sm font-medium" for="asr-min-window">
                    Min window (ms)
                </Label>
                <Input
                    id="asr-min-window"
                    type="number"
                    min={10}
                    max={1000}
                    step={10}
                    value={voiceState.advanced.qwen3Asr.minWindowMs}
                    aria-invalid={invalidIds["asr-min-window"]
                        ? "true"
                        : undefined}
                    class={invalidClass("asr-min-window")}
                    onblur={(e) =>
                        onNumericBlur(
                            {
                                get: () =>
                                    voiceState.advanced.qwen3Asr.minWindowMs,
                                set: (v) =>
                                    (voiceState.advanced.qwen3Asr.minWindowMs =
                                        v),
                                min: 10,
                                max: 1000,
                                step: 10,
                                id: "asr-min-window",
                                label: "min_window_ms",
                            },
                            (e.currentTarget as HTMLInputElement).value,
                        )}
                />
            </div>

            <div class="space-y-2">
                <Label class="text-sm font-medium">Response format</Label>
                <Select.Root
                    type="single"
                    value={voiceState.advanced.qwen3Asr.responseFormat}
                    onValueChange={(v) => {
                        if (
                            v === "json" ||
                            v === "verbose_json" ||
                            v === "text" ||
                            v === "srt" ||
                            v === "vtt"
                        ) {
                            voiceState.advanced.qwen3Asr.responseFormat = v;
                        }
                    }}
                >
                    <Select.Trigger class="h-9 text-sm w-full">
                        {voiceState.advanced.qwen3Asr.responseFormat}
                    </Select.Trigger>
                    <Select.Content>
                        {#each ASR_RESPONSE_FORMATS as opt (opt.value)}
                            <Select.Item value={opt.value} label={opt.label}>
                                {opt.label}
                            </Select.Item>
                        {/each}
                    </Select.Content>
                </Select.Root>
            </div>

            <div class="pt-4 border-t flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5 h-8 text-xs"
                    onclick={resetQwen3Asr}
                >
                    <RotateCcw class="w-3 h-3" />
                    Reset defaults
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5 h-8 text-xs"
                    onclick={onSavePreset}
                >
                    <Save class="w-3 h-3" />
                    Save as preset
                </Button>
            </div>
        </div>
    {/if}
</aside>
