import { invoke } from "@tauri-apps/api/core";
import { appState } from "$lib/state.svelte.js";

export type VoiceMode = "tts" | "stt";
export type TtsTab = "generation" | "cloning" | "voice_design";

export type TtsKind =
    | "kokoro"
    | "qwen3_tts_custom_voice"
    | "qwen3_tts_voice_design"
    | "qwen3_tts_voice_clone";

export type SttKind = "whisper" | "qwen3_asr";

export type VoiceProfile = {
    id: string;
    label: string;
    kind: "clone" | "design";
    baseModelName?: string;
    refAudioPath?: string;
    refText?: string;
    xVectorOnly?: boolean;
    voiceDescription?: string;
    instruct?: string;
    language?: string;
    createdAt: number;
};

export type GenerationMeta = {
    id: string;
    model: string;
    input: string;
    voice?: string | null;
    instructions?: string | null;
    language?: string | null;
    voiceProfileId?: string | null;
    path: string;
    bytes: number;
    elapsedMs: number;
    createdAt: number;
};

export type TranscriptionRecord = {
    id: string;
    model: string;
    responseFormat: string;
    sourcePath: string;
    sourceLabel?: string | null;
    body: {
        text?: string;
        language?: string;
        duration?: number;
        metrics?: Record<string, number>;
    };
    elapsedMs: number;
    createdAt: number;
};

export type ActiveGeneration = {
    id: string;
    path: string;
    text: string;
    modelName: string;
    voice?: string | null;
    elapsedMs: number;
    createdAt: number;
};

export type KokoroAdvanced = {
    characterCountChunk: number;
    autoPlay: boolean;
};

export type Qwen3TtsAdvanced = {
    maxNewTokens: number;
    temperature: number;
    topK: number;
    topP: number;
    repetitionPenalty: number;
    doSample: boolean;
    stream: boolean;
    streamChunkFrames: number;
    streamLeftContext: number;
    xVectorOnly: boolean;
};

export type Qwen3AsrAdvanced = {
    language: string;
    maxTokens: number;
    maxChunkSec: number;
    searchExpandSec: number;
    minWindowMs: number;
    responseFormat: "json" | "verbose_json" | "text" | "srt" | "vtt";
};

export type SpeechArgs = {
    model: string;
    input: string;
    voice?: string;
    instructions?: string;
    language?: string;
    responseFormat?: string;
    openarcTts?: Record<string, unknown>;
    voiceProfileId?: string;
};

export type TranscribeArgs = {
    audioPath: string;
    model: string;
    responseFormat?: string;
    openarcAsr?: Record<string, unknown>;
    sourceLabel?: string;
};

export type SpeechResult = {
    id: string;
    path: string;
    metaPath: string;
    bytes: number;
    elapsedMs: number;
    createdAt: number;
};

export type TranscribeResult = {
    id: string;
    path: string;
    body: TranscriptionRecord["body"];
    elapsedMs: number;
    createdAt: number;
};

export type ImportedAudio = {
    id: string;
    path: string;
    bytes: number;
};

// defaults for voiceState.advanced.* blocks. exported so AdvancedAudioConfig
// can "reset to defaults" without drifting from initial values.
// keep in sync with the literal defaults in the voiceState.advanced constructor.
export const KOKORO_DEFAULTS: KokoroAdvanced = {
    characterCountChunk: 100,
    autoPlay: true,
};

export const QWEN3_TTS_DEFAULTS: Qwen3TtsAdvanced = {
    maxNewTokens: 2048,
    temperature: 0.9,
    topK: 50,
    topP: 1.0,
    repetitionPenalty: 1.05,
    doSample: true,
    stream: false,
    streamChunkFrames: 50,
    streamLeftContext: 25,
    xVectorOnly: false,
};

export const QWEN3_ASR_DEFAULTS: Qwen3AsrAdvanced = {
    language: "auto",
    maxTokens: 1024,
    maxChunkSec: 30,
    searchExpandSec: 5,
    minWindowMs: 100,
    responseFormat: "verbose_json",
};

// clone-capable models. openarc worker dispatches on the loaded model_type -
// only qwen3_tts_voice_clone actually takes ref_audio_b64. also accepts
// qwen3_tts_custom_voice with "CustomVoice" in name as fallback for users
// who loaded the same checkpoint under the other type.
export function isVoiceCloneCapable(
    modelType: string | null | undefined,
    name: string | null | undefined,
): boolean {
    if (modelType === "qwen3_tts_voice_clone") return true;
    if (
        modelType === "qwen3_tts_custom_voice" &&
        !!name &&
        name.toLowerCase().includes("customvoice")
    ) {
        return true;
    }
    return false;
}

export const voiceState = $state({
    mode: "tts" as VoiceMode,
    ttsTab: "generation" as TtsTab,

    selectedTtsModel: null as string | null,
    selectedSttModel: null as string | null,
    selectedVoice: null as string | null, // kokoro voice id or profile id
    selectedLanguage: "auto" as string,

    // when set, generation tab synthesizes through the custom voice model
    // using this profile's ref audio/text instead of a preset speaker.
    // cleared when the active tts model cant host a profile.
    selectedProfileId: null as string | null,

    profiles: [] as VoiceProfile[],
    generations: [] as GenerationMeta[],
    transcriptions: [] as TranscriptionRecord[],

    activeGeneration: null as ActiveGeneration | null,
    activeTranscription: null as TranscriptionRecord | null,

    // bumped only on explicit user intent (finished synth or clicking a recent
    // generation). AudioPlayer uses this to gate autoplay so remounting
    // the player on tab switch doesnt replay stale audio.
    playGenerationNonce: 0,

    // oneshot slot: when user picks a recent generation from the sidebar,
    // input text rides here so the generation tab can drop it into the textarea.
    // consumer clears it after use.
    pendingTextToLoad: null as string | null,

    isSynthesizing: false,
    isTranscribing: false,

    advanced: {
        kokoro: { ...KOKORO_DEFAULTS } as KokoroAdvanced,
        qwen3Tts: { ...QWEN3_TTS_DEFAULTS } as Qwen3TtsAdvanced,
        qwen3Asr: { ...QWEN3_ASR_DEFAULTS } as Qwen3AsrAdvanced,
    },

    async loadAll() {
        await Promise.allSettled([
            this.refreshProfiles(),
            this.refreshGenerations(),
            this.refreshTranscriptions(),
            this.loadPresets(),
        ]);
    },

    async refreshProfiles() {
        try {
            const data = await invoke<{ profiles?: VoiceProfile[] } | null>(
                "list_voice_profiles",
            );
            this.profiles = data?.profiles ?? [];
            appState.addLog("v3", `Voice profiles loaded (${this.profiles.length})`);
        } catch (e) {
            appState.addLog("error", "Failed to load voice profiles", String(e));
        }
    },

    async saveProfile(profile: VoiceProfile) {
        const next = this.profiles.filter((p) => p.id !== profile.id);
        next.push(profile);
        await this.persistProfiles(next);
        appState.addLog("info", `Saved voice profile: ${profile.label}`);
    },

    async deleteProfile(profile: VoiceProfile) {
        try {
            await invoke("delete_voice_profile", {
                id: profile.id,
                refAudioPath: profile.refAudioPath ?? null,
            });
            this.profiles = this.profiles.filter((p) => p.id !== profile.id);
            appState.addLog("info", `Deleted voice profile: ${profile.label}`);
        } catch (e) {
            appState.addLog("error", "Failed to delete voice profile", String(e));
        }
    },

    async persistProfiles(profiles: VoiceProfile[]) {
        try {
            await invoke("save_voice_profiles", { profiles: { profiles } });
            this.profiles = profiles;
        } catch (e) {
            appState.addLog("error", "Failed to save voice profiles", String(e));
        }
    },

    async refreshGenerations() {
        try {
            const list = await invoke<GenerationMeta[]>("list_generations");
            this.generations = list.sort((a, b) => b.createdAt - a.createdAt);
        } catch (e) {
            appState.addLog("error", "Failed to list generations", String(e));
        }
    },

    async refreshTranscriptions() {
        try {
            const list = await invoke<TranscriptionRecord[]>("list_transcriptions");
            this.transcriptions = list.sort((a, b) => b.createdAt - a.createdAt);
        } catch (e) {
            appState.addLog("error", "Failed to list transcriptions", String(e));
        }
    },

    async deleteGeneration(id: string) {
        try {
            await invoke("delete_generation", { id });
            this.generations = this.generations.filter((g) => g.id !== id);
            if (this.activeGeneration?.id === id) this.activeGeneration = null;
        } catch (e) {
            appState.addLog("error", "Failed to delete generation", String(e));
        }
    },

    async deleteTranscription(id: string) {
        try {
            await invoke("delete_transcription", { id });
            this.transcriptions = this.transcriptions.filter((t) => t.id !== id);
            if (this.activeTranscription?.id === id) this.activeTranscription = null;
        } catch (e) {
            appState.addLog("error", "Failed to delete transcription", String(e));
        }
    },

    async loadPresets() {
        try {
            const data = await invoke<{
                kokoro?: KokoroAdvanced;
                qwen3Tts?: Qwen3TtsAdvanced;
                qwen3Asr?: Qwen3AsrAdvanced;
            } | null>("load_voice_presets");
            if (!data) return;
            if (data.kokoro) this.advanced.kokoro = { ...this.advanced.kokoro, ...data.kokoro };
            if (data.qwen3Tts)
                this.advanced.qwen3Tts = { ...this.advanced.qwen3Tts, ...data.qwen3Tts };
            if (data.qwen3Asr)
                this.advanced.qwen3Asr = { ...this.advanced.qwen3Asr, ...data.qwen3Asr };
        } catch (e) {
            appState.addLog("v3", "No voice presets on disk", String(e));
        }
    },

    async savePresets() {
        try {
            await invoke("save_voice_presets", { presets: this.advanced });
            appState.addLog("v2", "Voice presets saved");
        } catch (e) {
            appState.addLog("error", "Failed to save voice presets", String(e));
        }
    },

    async synthesize(args: SpeechArgs): Promise<SpeechResult | null> {
        this.isSynthesizing = true;
        appState.addLog(
            "v1",
            "TTS synthesis starting",
            `model=${args.model} voice=${args.voice ?? ""}`,
        );
        try {
            const res = await invoke<SpeechResult>("audio_speech", {
                req: {
                    model: args.model,
                    input: args.input,
                    voice: args.voice,
                    instructions: args.instructions,
                    language: args.language,
                    responseFormat: args.responseFormat,
                    openarcTts: args.openarcTts,
                    voiceProfileId: args.voiceProfileId,
                },
            });
            appState.addLog(
                "info",
                `TTS synthesis complete (${res.elapsedMs}ms, ${res.bytes}B)`,
            );
            this.activeGeneration = {
                id: res.id,
                path: res.path,
                text: args.input,
                modelName: args.model,
                voice: args.voice ?? null,
                elapsedMs: res.elapsedMs,
                createdAt: res.createdAt,
            };
            this.playGenerationNonce += 1;
            await this.refreshGenerations();
            return res;
        } catch (e) {
            appState.addLog("error", "TTS synthesis failed", String(e));
            return null;
        } finally {
            this.isSynthesizing = false;
        }
    },

    async transcribe(args: TranscribeArgs): Promise<TranscribeResult | null> {
        this.isTranscribing = true;
        appState.addLog(
            "v1",
            "Transcription starting",
            `model=${args.model} file=${args.audioPath}`,
        );
        try {
            const res = await invoke<TranscribeResult>("audio_transcribe", {
                req: {
                    audioPath: args.audioPath,
                    model: args.model,
                    responseFormat: args.responseFormat,
                    openarcAsr: args.openarcAsr,
                    sourceLabel: args.sourceLabel,
                },
            });
            appState.addLog("info", `Transcription complete (${res.elapsedMs}ms)`);
            this.activeTranscription = {
                id: res.id,
                model: args.model,
                responseFormat: args.responseFormat ?? "verbose_json",
                sourcePath: args.audioPath,
                sourceLabel: args.sourceLabel ?? null,
                body: res.body,
                elapsedMs: res.elapsedMs,
                createdAt: res.createdAt,
            };
            await this.refreshTranscriptions();
            return res;
        } catch (e) {
            appState.addLog("error", "Transcription failed", String(e));
            return null;
        } finally {
            this.isTranscribing = false;
        }
    },

    async importForTranscription(srcPath: string): Promise<ImportedAudio | null> {
        try {
            return await invoke<ImportedAudio>("import_audio_for_transcription", {
                srcPath,
            });
        } catch (e) {
            appState.addLog("error", "Failed to import audio", String(e));
            return null;
        }
    },

    async importReference(srcPath: string): Promise<ImportedAudio | null> {
        try {
            return await invoke<ImportedAudio>("import_reference_audio", {
                srcPath,
            });
        } catch (e) {
            appState.addLog("error", "Failed to import reference audio", String(e));
            return null;
        }
    },

    async promoteGenerationToReference(
        generationId: string,
        profileId: string,
    ): Promise<ImportedAudio | null> {
        try {
            return await invoke<ImportedAudio>(
                "promote_generation_to_reference",
                { generationId, profileId },
            );
        } catch (e) {
            appState.addLog(
                "error",
                "Failed to promote generation to reference",
                String(e),
            );
            return null;
        }
    },

    async saveRecording(
        audioBytes: Uint8Array,
        mimeType: string,
    ): Promise<ImportedAudio | null> {
        try {
            return await invoke<ImportedAudio>("record_mic_stop_save", {
                audioBytes: Array.from(audioBytes),
                mimeType,
            });
        } catch (e) {
            appState.addLog("error", "Failed to save recording", String(e));
            return null;
        }
    },
});
