// bundled qwen3-tts predefined speaker tokens mirroring the Speaker StrEnum
// in OpenArc's backend (9 voices with codec IDs). some speakers default to a
// dialect on the engine side (eric = sichuan, dylan = beijing) so the label
// surfaces that hint for sensible language override.
//
// TODO: replace with a /v1/audio/speakers discovery endpoint once the backend exposes one

export type Qwen3TtsSpeaker = {
    id: string;
    label: string;
};

export const QWEN3_TTS_SPEAKERS: readonly Qwen3TtsSpeaker[] = [
    { id: "serena", label: "Serena" },
    { id: "vivian", label: "Vivian" },
    { id: "uncle_fu", label: "Uncle Fu" },
    { id: "ryan", label: "Ryan" },
    { id: "aiden", label: "Aiden" },
    { id: "ono_anna", label: "Ono Anna" },
    { id: "sohee", label: "Sohee" },
    { id: "eric", label: "Eric (Sichuan dialect)" },
    { id: "dylan", label: "Dylan (Beijing dialect)" },
] as const;

// language codes accepted by OV_Qwen3TTSGenConfig.language - "auto" is a ui sentinel,
// maps to null on the wire (backend autodetects when omitted).
export type Qwen3TtsLanguage = {
    code: string;
    label: string;
};

export const QWEN3_TTS_LANGUAGES: readonly Qwen3TtsLanguage[] = [
    { code: "auto", label: "Auto-detect" },
    { code: "english", label: "English" },
    { code: "chinese", label: "Chinese" },
    { code: "japanese", label: "Japanese" },
    { code: "korean", label: "Korean" },
    { code: "spanish", label: "Spanish" },
    { code: "french", label: "French" },
    { code: "german", label: "German" },
    { code: "italian", label: "Italian" },
    { code: "portuguese", label: "Portuguese" },
    { code: "russian", label: "Russian" },
    { code: "beijing_dialect", label: "Beijing dialect" },
    { code: "sichuan_dialect", label: "Sichuan dialect" },
] as const;
