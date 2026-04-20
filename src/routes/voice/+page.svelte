<script lang="ts">
    import { onMount } from "svelte";
    import { AudioLines, Mic, Sparkles, Users, Wand2, FileAudio, FileText } from "@lucide/svelte";
    import { appState } from "$lib/state.svelte.js";
    import { voiceState } from "$lib/voice.svelte.js";
    import { getArchAccent } from "$lib/model-types";
    import TtsGeneration from "./TtsGeneration.svelte";
    import VoiceCloning from "./VoiceCloning.svelte";
    import VoiceDesign from "./VoiceDesign.svelte";
    import SpeechToText from "./SpeechToText.svelte";
    import VoiceLibrarySidebar from "./VoiceLibrarySidebar.svelte";
    import AdvancedAudioConfig from "./AdvancedAudioConfig.svelte";

    onMount(() => {
        appState.addLog("info", "Voice Studio initialized");
        voiceState.loadAll();
    });

    const isTts = $derived(voiceState.mode === "tts");
    const modeAccent = $derived(getArchAccent(isTts ? "tts" : "stt"));
    const generationsCount = $derived(voiceState.generations.length);
    const transcriptionsCount = $derived(voiceState.transcriptions.length);
    const profilesCount = $derived(voiceState.profiles.length);
</script>

<div class="flex h-full w-full overflow-hidden bg-background">
    {#if appState.leftPanelOpen}
        <VoiceLibrarySidebar />
    {/if}

    <main class="flex-1 h-full flex flex-col min-w-0 bg-background overflow-hidden">
        <header
            class="shrink-0 border-b bg-gradient-to-b from-muted/20 to-background"
        >
            <div class="flex items-center justify-between gap-4 px-6 py-4">
                <div class="flex items-center gap-3 min-w-0">
                    <div
                        class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
                    >
                        {#if isTts}
                            <AudioLines class="w-4 h-4 text-primary" />
                        {:else}
                            <Mic class="w-4 h-4 text-primary" />
                        {/if}
                    </div>
                    <div class="min-w-0">
                        <h1
                            class="text-base font-bold tracking-tight leading-tight"
                        >
                            Voice studio
                        </h1>
                        <p
                            class="text-xs text-muted-foreground leading-tight mt-0.5"
                        >
                            {#if isTts}
                                Synthesize speech, clone voices, or design new ones.
                            {:else}
                                Transcribe audio into text with Whisper or Qwen3 ASR.
                            {/if}
                        </p>
                    </div>
                </div>

                <div class="flex items-center gap-1.5 shrink-0">
                    <button
                        type="button"
                        aria-pressed={isTts}
                        onclick={() => (voiceState.mode = "tts")}
                        class="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors {isTts
                            ? 'bg-foreground text-background border-foreground'
                            : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/50'}"
                    >
                        <span
                            class="w-1.5 h-1.5 rounded-full {getArchAccent('tts')}"
                        ></span>
                        Text-to-speech
                    </button>
                    <button
                        type="button"
                        aria-pressed={!isTts}
                        onclick={() => (voiceState.mode = "stt")}
                        class="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors {!isTts
                            ? 'bg-foreground text-background border-foreground'
                            : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/50'}"
                    >
                        <span
                            class="w-1.5 h-1.5 rounded-full {getArchAccent('stt')}"
                        ></span>
                        Speech-to-text
                    </button>
                </div>
            </div>

            <div class="h-[2px] w-full {modeAccent} opacity-80"></div>
        </header>

        <div class="flex-1 min-h-0 overflow-y-auto">
            <div class="max-w-4xl mx-auto flex flex-col gap-5 px-6 py-5 pb-8">
                {#if isTts}
                    <div class="flex items-center justify-between gap-3">
                        <div class="flex items-center gap-2">
                            <span
                                class="h-[2px] w-3 rounded-full {getArchAccent('tts')}"
                            ></span>
                            <span
                                class="text-[10px] font-bold uppercase tracking-widest text-foreground/80"
                            >
                                TTS mode
                            </span>
                            <span
                                class="text-[10px] text-muted-foreground tabular-nums"
                            >
                                {generationsCount} generation{generationsCount === 1 ? '' : 's'}
                                · {profilesCount} profile{profilesCount === 1 ? '' : 's'}
                            </span>
                        </div>

                        <div class="flex items-center gap-1.5 shrink-0">
                            <button
                                type="button"
                                aria-pressed={voiceState.ttsTab === 'generation'}
                                onclick={() => (voiceState.ttsTab = 'generation')}
                                class="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors {voiceState.ttsTab === 'generation'
                                    ? 'bg-foreground text-background border-foreground'
                                    : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/50'}"
                            >
                                <Sparkles class="w-3 h-3" />
                                Generation
                            </button>
                            <button
                                type="button"
                                aria-pressed={voiceState.ttsTab === 'cloning'}
                                onclick={() => (voiceState.ttsTab = 'cloning')}
                                class="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors {voiceState.ttsTab === 'cloning'
                                    ? 'bg-foreground text-background border-foreground'
                                    : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/50'}"
                            >
                                <Users class="w-3 h-3" />
                                Voice cloning
                            </button>
                            <button
                                type="button"
                                aria-pressed={voiceState.ttsTab === 'voice_design'}
                                onclick={() => (voiceState.ttsTab = 'voice_design')}
                                class="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors {voiceState.ttsTab === 'voice_design'
                                    ? 'bg-foreground text-background border-foreground'
                                    : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/50'}"
                            >
                                <Wand2 class="w-3 h-3" />
                                Voice design
                            </button>
                        </div>
                    </div>

                    <div class="flex flex-wrap items-center gap-1.5">
                        <span
                            class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border"
                        >
                            <FileAudio class="w-3 h-3 text-muted-foreground" />
                            <span class="text-muted-foreground">Generations</span>
                            <span class="font-medium tabular-nums">{generationsCount}</span>
                        </span>
                        <span
                            class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border"
                        >
                            <Users class="w-3 h-3 text-muted-foreground" />
                            <span class="text-muted-foreground">Voice profiles</span>
                            <span class="font-medium tabular-nums">{profilesCount}</span>
                        </span>
                    </div>

                    {#if voiceState.ttsTab === "generation"}
                        <TtsGeneration />
                    {:else if voiceState.ttsTab === "cloning"}
                        <VoiceCloning />
                    {:else}
                        <VoiceDesign />
                    {/if}
                {:else}
                    <div class="flex items-center justify-between gap-3">
                        <div class="flex items-center gap-2">
                            <span
                                class="h-[2px] w-3 rounded-full {getArchAccent('stt')}"
                            ></span>
                            <span
                                class="text-[10px] font-bold uppercase tracking-widest text-foreground/80"
                            >
                                STT mode
                            </span>
                            <span
                                class="text-[10px] text-muted-foreground tabular-nums"
                            >
                                {transcriptionsCount} transcript{transcriptionsCount === 1 ? '' : 's'}
                            </span>
                        </div>

                        <div class="flex flex-wrap items-center gap-1.5">
                            <span
                                class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border"
                            >
                                <FileText class="w-3 h-3 text-muted-foreground" />
                                <span class="text-muted-foreground">Transcriptions</span>
                                <span class="font-medium tabular-nums">{transcriptionsCount}</span>
                            </span>
                        </div>
                    </div>

                    <SpeechToText />
                {/if}
            </div>
        </div>
    </main>

    {#if appState.rightPanelOpen}
        <AdvancedAudioConfig />
    {/if}
</div>
