<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Textarea } from "$lib/components/ui/textarea";
    import { Slider } from "$lib/components/ui/slider";
    import { Label } from "$lib/components/ui/label";
    import { Input } from "$lib/components/ui/input";
    import * as Select from "$lib/components/ui/select";
    import { appState } from "$lib/state.svelte.js";
    import {
        voiceState,
        type SpeechArgs,
        type VoiceProfile,
    } from "$lib/voice.svelte.js";
    import { openarc } from "$lib/client.svelte.js";
    import { goto } from "$app/navigation";
    import {
        ChevronDown,
        ChevronRight,
        Info,
        Loader2,
        Lock,
        Play,
        Trash2,
        Unlock,
    } from "@lucide/svelte";
    import AudioPlayer from "./AudioPlayer.svelte";

    type Gender = "female" | "male" | "androgynous";
    type Age = "young" | "middle_aged" | "elderly";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type RawModel = { model_name?: string; model_type?: string } & Record<string, any>;

    const DEFAULT_SAMPLE_PHRASE =
        "When the sunlight strikes raindrops in the air, they act as a prism and form a rainbow. The rainbow is a division of white light into many beautiful colors. These take the shape of a long round arch, with its path high above, and its two ends apparently beyond the horizon. There is, according to legend, a boiling pot of gold at one end.";

    function labelForGender(g: Gender): string {
        switch (g) {
            case "female":
                return "Female";
            case "male":
                return "Male";
            case "androgynous":
                return "Androgynous";
        }
    }

    function labelForAge(a: Age): string {
        switch (a) {
            case "young":
                return "Young";
            case "middle_aged":
                return "Middle-aged";
            case "elderly":
                return "Elderly";
        }
    }

    // 50 is the "unspecified" centre. ±10 deadzone drops out near-middle
    // clicks so users dont get phantom prompt text they didnt ask for.
    function pitchToLabel(v: number): "deeper" | "higher" | null {
        if (v < 40) return "deeper";
        if (v > 60) return "higher";
        return null;
    }

    // clarity default is 20 (crisp/clear). below 20 is omitted as the default range.
    function clarityToLabel(
        v: number,
    ): "clear" | "neutral" | "breathy/raspy" | null {
        if (v < 20) return null;
        if (v < 40) return "clear";
        if (v <= 60) return null; // neutral - noise, omit
        return "breathy/raspy";
    }

    function composePrompt(
        description: string,
        gender: Gender | null,
        age: Age | null,
        pitchSignal: number,
        clarityLabel: string | null,
    ): string {
        const parts: string[] = [];
        const base = description.trim();
        if (base) parts.push(base.endsWith(".") ? base : `${base}.`);
        if (gender) parts.push(`Gender: ${labelForGender(gender)}.`);
        if (age) parts.push(`Age: ${labelForAge(age)}.`);
        const pitchLabel = pitchToLabel(pitchSignal);
        if (pitchLabel) parts.push(`Pitch: ${pitchLabel}.`);
        if (clarityLabel) parts.push(`Clarity: ${clarityLabel}.`);
        return parts.join(" ");
    }

    let description = $state("");
    let gender = $state<Gender | null>(null);
    let age = $state<Age | null>(null);
    let pitchSignal = $state<number[]>([50]);
    let claritySignal = $state<number[]>([20]);
    let samplePhrase = $state(DEFAULT_SAMPLE_PHRASE);
    let samplePhraseUnlocked = $state(false);
    let profileName = $state("");
    let previewOpen = $state(false);

    // captures the generation id for the current form state. cleared on any
    // form edit so user cant save stale audio under a new prompt. tied to a
    // specific id to survive other tabs mutating voiceState.activeGeneration.
    let previewGenerationId = $state<string | null>(null);
    let previewSamplePhrase = $state<string | null>(null);
    let previewPrompt = $state<string | null>(null);

    let selectedDesignModel = $state<string | null>(null);

    const designModels = $derived.by<string[]>(() => {
        const raw = (openarc.status?.models ?? []) as RawModel[];
        return raw
            .filter((m) => m?.model_type === "qwen3_tts_voice_design")
            .map((m) => String(m.model_name ?? ""))
            .filter((n) => n.length > 0);
    });

    // autoselect first model, re-run if current one disappears
    $effect(() => {
        const list = designModels;
        const current = selectedDesignModel;
        const stillValid = !!current && list.includes(current);
        if (!stillValid) {
            selectedDesignModel = list[0] ?? null;
        }
    });

    const hasModel = $derived(selectedDesignModel !== null);

    const clarityLabel = $derived(clarityToLabel(claritySignal[0] ?? 20));

    const composedPrompt = $derived(
        composePrompt(
            description,
            gender,
            age,
            pitchSignal[0] ?? 50,
            clarityLabel,
        ),
    );

    const designProfiles = $derived(
        voiceState.profiles.filter((p) => p.kind === "design"),
    );

    const canGenerate = $derived(
        !!composedPrompt.trim() &&
            !!selectedDesignModel &&
            !!samplePhrase.trim() &&
            !voiceState.isSynthesizing,
    );

    // only requires that any preview was generated - dropped when form drifts
    const hasPreview = $derived(previewGenerationId !== null);

    const canSave = $derived(
        profileName.trim().length > 0 &&
            composedPrompt.trim().length > 0 &&
            !!selectedDesignModel &&
            hasPreview,
    );

    // clear preview when form drifts so user cant save stale audio under a new prompt
    $effect(() => {
        const phrase = samplePhrase;
        const prompt = composedPrompt;
        if (previewGenerationId === null) return;
        if (previewSamplePhrase !== phrase || previewPrompt !== prompt) {
            previewGenerationId = null;
            previewSamplePhrase = null;
            previewPrompt = null;
        }
    });

    const GENDER_OPTIONS: { value: Gender | "__auto__"; label: string }[] = [
        { value: "__auto__", label: "Let Model Decide" },
        { value: "female", label: "Female" },
        { value: "male", label: "Male" },
        { value: "androgynous", label: "Androgynous" },
    ];

    const AGE_OPTIONS: { value: Age | "__auto__"; label: string }[] = [
        { value: "__auto__", label: "Let Model Decide" },
        { value: "young", label: "Young" },
        { value: "middle_aged", label: "Middle-aged" },
        { value: "elderly", label: "Elderly" },
    ];

    const genderValue = $derived(gender ?? "__auto__");
    const ageValue = $derived(age ?? "__auto__");

    function onGenderChange(v: string | undefined) {
        if (!v || v === "__auto__") {
            gender = null;
            return;
        }
        gender = v as Gender;
    }

    function onAgeChange(v: string | undefined) {
        if (!v || v === "__auto__") {
            age = null;
            return;
        }
        age = v as Age;
    }

    async function onGenerate() {
        if (!canGenerate || !selectedDesignModel) return;
        const adv = voiceState.advanced.qwen3Tts;
        const phrase = samplePhrase;
        const args: SpeechArgs = {
            model: selectedDesignModel,
            input: phrase,
            instructions: composedPrompt,
            responseFormat: "wav",
            openarcTts: {
                qwen3_tts: {
                    input: phrase,
                    voice_description: composedPrompt,
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
        appState.addLog("v1", "Voice-design preview starting");
        appState.addLog("v4", "Voice-design payload", JSON.stringify(args));
        previewGenerationId = null;
        previewSamplePhrase = null;
        previewPrompt = null;
        const prompt = composedPrompt;
        const res = await voiceState.synthesize(args);
        if (res) {
            previewGenerationId = res.id;
            previewSamplePhrase = phrase;
            previewPrompt = prompt;
        }
    }

    async function onSave() {
        if (!canSave || !selectedDesignModel) return;
        const genId = previewGenerationId;
        const phrase = previewSamplePhrase;
        if (!genId || !phrase) return;

        const profileId = crypto.randomUUID();
        appState.addLog(
            "v1",
            `Saving design profile: ${profileName.trim()}`,
            profileId,
        );
        const refAudio = await voiceState.promoteGenerationToReference(
            genId,
            profileId,
        );
        if (!refAudio) {
            appState.addLog(
                "error",
                "Could not copy preview audio into references",
                profileId,
            );
            return;
        }
        const profile: VoiceProfile = {
            id: profileId,
            label: profileName.trim(),
            kind: "design",
            baseModelName: selectedDesignModel,
            voiceDescription: composedPrompt,
            refAudioPath: refAudio.path,
            refText: phrase,
            createdAt: Date.now(),
        };
        await voiceState.saveProfile(profile);
        const landed = voiceState.profiles.some((p) => p.id === profile.id);
        if (!landed) {
            appState.addLog(
                "error",
                "Design profile did not persist",
                profile.id,
            );
            return;
        }
        appState.addLog("info", `Design profile ready: ${profile.label}`);
        // clear only name so user can iterate on same prompt
        profileName = "";
    }

    function loadProfile(profile: VoiceProfile) {
        description = profile.voiceDescription ?? "";
        gender = null;
        age = null;
        pitchSignal = [50];
        claritySignal = [20];
        if (profile.baseModelName && designModels.includes(profile.baseModelName)) {
            selectedDesignModel = profile.baseModelName;
        }
        profileName = profile.label;
        appState.addLog(
            "v2",
            "Loaded design profile into form",
            profile.id,
        );
    }

    async function onDelete(profile: VoiceProfile) {
        const ok = window.confirm(
            `Delete voice design "${profile.label}"? This cannot be undone.`,
        );
        if (!ok) return;
        await voiceState.deleteProfile(profile);
    }

    function gotoModels() {
        void goto("/models");
    }

    function formatCreated(ms: number): string {
        try {
            return new Date(ms).toLocaleString();
        } catch {
            return "";
        }
    }
</script>

<div class="grid grid-cols-3 gap-6 pt-2">
    <div class="col-span-2 space-y-6">
        <div class="space-y-2">
            <Label class="text-sm font-semibold">
                Voice description
            </Label>
                <p class="text-xs text-muted-foreground">
                    Describe the voice you want the model to synthesize.
                    Structured controls below get folded into this prompt.
                </p>
                <Textarea
                    bind:value={description}
                    placeholder="E.g., A warm, deep, and raspy elderly voice with a slow cadence and a subtle British accent..."
                    class="resize-y min-h-[120px]"
                />
            </div>

            <div class="grid grid-cols-2 gap-6">
                <div class="space-y-2">
                    <Label class="text-sm font-semibold">Gender</Label>
                    <Select.Root
                        type="single"
                        value={genderValue}
                        onValueChange={onGenderChange}
                    >
                        <Select.Trigger class="h-9 text-sm w-full">
                            {GENDER_OPTIONS.find((o) => o.value === genderValue)
                                ?.label ?? "Let Model Decide"}
                        </Select.Trigger>
                        <Select.Content>
                            {#each GENDER_OPTIONS as opt (opt.value)}
                                <Select.Item
                                    value={opt.value}
                                    label={opt.label}
                                >
                                    {opt.label}
                                </Select.Item>
                            {/each}
                        </Select.Content>
                    </Select.Root>
                </div>
                <div class="space-y-2">
                    <Label class="text-sm font-semibold">Age</Label>
                    <Select.Root
                        type="single"
                        value={ageValue}
                        onValueChange={onAgeChange}
                    >
                        <Select.Trigger class="h-9 text-sm w-full">
                            {AGE_OPTIONS.find((o) => o.value === ageValue)
                                ?.label ?? "Let Model Decide"}
                        </Select.Trigger>
                        <Select.Content>
                            {#each AGE_OPTIONS as opt (opt.value)}
                                <Select.Item
                                    value={opt.value}
                                    label={opt.label}
                                >
                                    {opt.label}
                                </Select.Item>
                            {/each}
                        </Select.Content>
                    </Select.Root>
                </div>
            </div>

            <div class="space-y-3 pt-2">
                <div class="flex justify-between items-center">
                    <Label class="text-sm font-semibold">Pitch</Label>
                    <span
                        class="text-xs font-mono bg-muted px-2 py-0.5 rounded"
                    >
                        {pitchToLabel(pitchSignal[0] ?? 50) ?? "unspecified"}
                    </span>
                </div>
                <Slider
                    type="multiple"
                    bind:value={pitchSignal}
                    max={100}
                    step={1}
                />
                <div
                    class="flex justify-between text-xs text-muted-foreground"
                >
                    <span>Deeper</span>
                    <span>Higher</span>
                </div>
            </div>

            <div class="space-y-3 pt-2">
                <div class="flex justify-between items-center">
                    <Label class="text-sm font-semibold">
                        Breathiness / clarity
                    </Label>
                    <span
                        class="text-xs font-mono bg-muted px-2 py-0.5 rounded"
                    >
                        {clarityLabel ?? "unspecified"}
                    </span>
                </div>
                <Slider
                    type="multiple"
                    bind:value={claritySignal}
                    max={100}
                    step={1}
                />
                <div
                    class="flex justify-between text-xs text-muted-foreground"
                >
                    <span>Crisp / Clear</span>
                    <span>Breathy / Raspy</span>
                </div>
            </div>

            <div class="space-y-2">
                <div class="flex items-center justify-between gap-2">
                    <Label class="text-sm font-semibold">Sample phrase</Label>
                    <Button
                        variant="ghost"
                        size="sm"
                        class="h-7 px-2 text-xs gap-1.5"
                        onclick={() =>
                            (samplePhraseUnlocked = !samplePhraseUnlocked)}
                        title={samplePhraseUnlocked
                            ? "Lock sample phrase"
                            : "Edit sample phrase"}
                    >
                        {#if samplePhraseUnlocked}
                            <Unlock class="w-3.5 h-3.5" />
                            Lock
                        {:else}
                            <Lock class="w-3.5 h-3.5" />
                            Edit
                        {/if}
                    </Button>
                </div>
                <p class="text-xs text-muted-foreground">
                    The text rendered when you click Generate preview. Kept
                    locked by default so every design uses the same reference
                    passage — unlock if you want to change it.
                </p>
                <Textarea
                    bind:value={samplePhrase}
                    disabled={!samplePhraseUnlocked}
                    placeholder={DEFAULT_SAMPLE_PHRASE}
                    class="resize-y min-h-[120px]"
                />
            </div>

            <div class="rounded-md border bg-muted/5">
                <button
                    type="button"
                    class="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-semibold hover:bg-muted/20"
                    onclick={() => (previewOpen = !previewOpen)}
                    aria-expanded={previewOpen}
                >
                    {#if previewOpen}
                        <ChevronDown class="w-4 h-4" />
                    {:else}
                        <ChevronRight class="w-4 h-4" />
                    {/if}
                    Final prompt
                    <span
                        class="ml-auto text-xs text-muted-foreground font-normal"
                    >
                        {composedPrompt.length} chars
                    </span>
                </button>
                {#if previewOpen}
                    <div class="px-3 pb-3">
                        {#if composedPrompt.trim()}
                            <pre
                                class="font-mono text-xs whitespace-pre-wrap break-words rounded bg-background border px-3 py-2 text-muted-foreground"
                            >{composedPrompt}</pre>
                        {:else}
                            <p class="text-xs text-muted-foreground italic">
                                Empty — add a description or tweak the controls.
                            </p>
                        {/if}
                    </div>
                {/if}
            </div>

            <div
                class="flex items-start gap-2 rounded-md border border-dashed bg-muted/5 p-3 text-xs text-muted-foreground"
            >
                <Info class="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                    Voice Design generates a new interpretation each run. Save
                    the preview if you like it — exact reproducibility is not
                    guaranteed.
                </p>
            </div>

            <div class="pt-2 flex items-center gap-3">
                <Button
                    size="lg"
                    class="gap-2"
                    disabled={!canGenerate}
                    onclick={onGenerate}
                >
                    {#if voiceState.isSynthesizing}
                        <Loader2 class="w-4 h-4 animate-spin" />
                        Generating...
                    {:else}
                        <Play class="w-4 h-4 fill-current" />
                        Generate preview
                    {/if}
                </Button>
                {#if !hasModel}
                    <span class="text-xs text-muted-foreground">
                        Load a voice-design model to continue.
                    </span>
                {:else if !composedPrompt.trim()}
                    <span class="text-xs text-muted-foreground">
                        Add a description or adjust a control.
                    </span>
                {/if}
            </div>

            <AudioPlayer
                class="mt-2"
                src={voiceState.activeGeneration?.path ?? null}
                kind="file"
                autoplay={voiceState.advanced.kokoro.autoPlay}
                playToken={voiceState.playGenerationNonce}
            />

            <div class="pt-6 border-t space-y-3">
                <div>
                    <h3 class="text-base font-semibold">Save as profile</h3>
                    <p class="text-xs text-muted-foreground">
                        Save the rendered preview as a reusable voice. The
                        generated audio and sample phrase become the
                        reference for the custom-voice model.
                    </p>
                </div>
                <div class="flex items-center gap-3">
                    <Input
                        bind:value={profileName}
                        placeholder="E.g., Storyteller Narrator"
                        class="max-w-md"
                    />
                    <Button
                        disabled={!canSave}
                        onclick={onSave}
                    >
                        Save voice profile
                    </Button>
                </div>
                {#if !canSave}
                    <p class="text-xs text-muted-foreground">
                        {#if profileName.trim().length === 0}
                            Give this profile a name to enable saving.
                        {:else if !selectedDesignModel}
                            Select a voice-design model first.
                        {:else if !composedPrompt.trim()}
                            Write a description or adjust a control to
                            build a prompt.
                        {:else if !hasPreview}
                            Generate a preview of this prompt before
                            saving.
                        {/if}
                    </p>
                {/if}
            </div>
    </div>

    <div class="space-y-4 p-5 border rounded-xl bg-muted/5 h-fit">
            <div class="space-y-1">
                <h3 class="text-sm font-semibold">Design Model</h3>
                {#if designModels.length === 0}
                    <div
                        class="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground"
                    >
                        <Info class="w-4 h-4 mt-0.5 shrink-0" />
                        <div class="space-y-2">
                            <p>
                                No <code class="font-mono">
                                    qwen3_tts_voice_design
                                </code>
                                model is loaded.
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
                        value={selectedDesignModel ?? undefined}
                        onValueChange={(v) =>
                            (selectedDesignModel = v ?? null)}
                    >
                        <Select.Trigger class="h-9 text-sm w-full" title={selectedDesignModel ?? undefined}>
                            <span class="truncate min-w-0 flex-1 text-left">
                                {selectedDesignModel ?? "Select model"}
                            </span>
                        </Select.Trigger>
                        <Select.Content>
                            {#each designModels as name (name)}
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
                    Saved designs
                    <span
                        class="ml-1 text-xs text-muted-foreground font-normal"
                    >
                        ({designProfiles.length})
                    </span>
                </h3>
                {#if designProfiles.length === 0}
                    <p class="text-xs text-muted-foreground">
                        No design profiles yet. Save one from the form.
                    </p>
                {:else}
                    <ul class="space-y-1.5">
                        {#each designProfiles as profile (profile.id)}
                            <li>
                                <div
                                    class="flex items-center gap-2 p-2 rounded-md border bg-background hover:bg-muted/30 transition-colors"
                                >
                                    <button
                                        type="button"
                                        class="flex-1 min-w-0 text-left"
                                        onclick={() => loadProfile(profile)}
                                        title="Load into form"
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

            <div
                class="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground"
            >
                <Info class="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                    Structured controls are folded into the prompt at submit
                    time. The backend has no dedicated
                    <code class="font-mono">pitch</code>
                    /
                    <code class="font-mono">age</code>
                    fields.
                </p>
            </div>
    </div>
</div>
