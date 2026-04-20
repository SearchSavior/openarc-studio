// kokoro tts voice catalog mirroring KokoroVoice and KokoroLanguage from
// OpenArc's backend at src/server/models/openvino.py.
//
// voice IDs follow {lang_prefix}{gender}_{name} convention; the language
// prefix is the singleletter lang_code kokoro expects on /v1/audio/speech
// (e.g. af_bella -> lang_code "a"). mirrors the python enum exactly.

export type KokoroLangCode =
    | "a" // American English
    | "b" // British English
    | "j" // Japanese
    | "z" // Mandarin Chinese
    | "e" // Spanish
    | "f" // French
    | "h" // Hindi
    | "i" // Italian
    | "p"; // Brazilian Portuguese

export type KokoroGender = "f" | "m";

export type KokoroVoice = {
    id: string;
    label: string;
    langCode: KokoroLangCode;
    gender: KokoroGender;
};

export type KokoroLanguage = {
    code: KokoroLangCode;
    label: string;
};

export const KOKORO_LANGUAGES: readonly KokoroLanguage[] = [
    { code: "a", label: "American English" },
    { code: "b", label: "British English" },
    { code: "j", label: "Japanese" },
    { code: "z", label: "Mandarin Chinese" },
    { code: "e", label: "Spanish" },
    { code: "f", label: "French" },
    { code: "h", label: "Hindi" },
    { code: "i", label: "Italian" },
    { code: "p", label: "Brazilian Portuguese" },
] as const;

// labels use title-cased name suffix + language/gender tag for readability
export const KOKORO_VOICES: readonly KokoroVoice[] = [
    // American English - 11F 9M
    { id: "af_heart", label: "Heart (American Female)", langCode: "a", gender: "f" },
    { id: "af_alloy", label: "Alloy (American Female)", langCode: "a", gender: "f" },
    { id: "af_aoede", label: "Aoede (American Female)", langCode: "a", gender: "f" },
    { id: "af_bella", label: "Bella (American Female)", langCode: "a", gender: "f" },
    { id: "af_jessica", label: "Jessica (American Female)", langCode: "a", gender: "f" },
    { id: "af_kore", label: "Kore (American Female)", langCode: "a", gender: "f" },
    { id: "af_nicole", label: "Nicole (American Female)", langCode: "a", gender: "f" },
    { id: "af_nova", label: "Nova (American Female)", langCode: "a", gender: "f" },
    { id: "af_river", label: "River (American Female)", langCode: "a", gender: "f" },
    { id: "af_sarah", label: "Sarah (American Female)", langCode: "a", gender: "f" },
    { id: "af_sky", label: "Sky (American Female)", langCode: "a", gender: "f" },
    { id: "am_adam", label: "Adam (American Male)", langCode: "a", gender: "m" },
    { id: "am_echo", label: "Echo (American Male)", langCode: "a", gender: "m" },
    { id: "am_eric", label: "Eric (American Male)", langCode: "a", gender: "m" },
    { id: "am_fenrir", label: "Fenrir (American Male)", langCode: "a", gender: "m" },
    { id: "am_liam", label: "Liam (American Male)", langCode: "a", gender: "m" },
    { id: "am_michael", label: "Michael (American Male)", langCode: "a", gender: "m" },
    { id: "am_onyx", label: "Onyx (American Male)", langCode: "a", gender: "m" },
    { id: "am_puck", label: "Puck (American Male)", langCode: "a", gender: "m" },
    { id: "am_santa", label: "Santa (American Male)", langCode: "a", gender: "m" },

    // British English - 4F 4M
    { id: "bf_alice", label: "Alice (British Female)", langCode: "b", gender: "f" },
    { id: "bf_emma", label: "Emma (British Female)", langCode: "b", gender: "f" },
    { id: "bf_isabella", label: "Isabella (British Female)", langCode: "b", gender: "f" },
    { id: "bf_lily", label: "Lily (British Female)", langCode: "b", gender: "f" },
    { id: "bm_daniel", label: "Daniel (British Male)", langCode: "b", gender: "m" },
    { id: "bm_fable", label: "Fable (British Male)", langCode: "b", gender: "m" },
    { id: "bm_george", label: "George (British Male)", langCode: "b", gender: "m" },
    { id: "bm_lewis", label: "Lewis (British Male)", langCode: "b", gender: "m" },

    // Japanese - 4F 1M
    { id: "jf_alpha", label: "Alpha (Japanese Female)", langCode: "j", gender: "f" },
    { id: "jf_gongitsune", label: "Gongitsune (Japanese Female)", langCode: "j", gender: "f" },
    { id: "jf_nezumi", label: "Nezumi (Japanese Female)", langCode: "j", gender: "f" },
    { id: "jf_tebukuro", label: "Tebukuro (Japanese Female)", langCode: "j", gender: "f" },
    { id: "jm_kumo", label: "Kumo (Japanese Male)", langCode: "j", gender: "m" },

    // Mandarin Chinese - 4F 4M
    { id: "zf_xiaobei", label: "Xiaobei (Chinese Female)", langCode: "z", gender: "f" },
    { id: "zf_xiaoni", label: "Xiaoni (Chinese Female)", langCode: "z", gender: "f" },
    { id: "zf_xiaoxiao", label: "Xiaoxiao (Chinese Female)", langCode: "z", gender: "f" },
    { id: "zf_xiaoyi", label: "Xiaoyi (Chinese Female)", langCode: "z", gender: "f" },
    { id: "zm_yunjian", label: "Yunjian (Chinese Male)", langCode: "z", gender: "m" },
    { id: "zm_yunxi", label: "Yunxi (Chinese Male)", langCode: "z", gender: "m" },
    { id: "zm_yunxia", label: "Yunxia (Chinese Male)", langCode: "z", gender: "m" },
    { id: "zm_yunyang", label: "Yunyang (Chinese Male)", langCode: "z", gender: "m" },

    // Spanish - 1F 2M
    { id: "ef_dora", label: "Dora (Spanish Female)", langCode: "e", gender: "f" },
    { id: "em_alex", label: "Alex (Spanish Male)", langCode: "e", gender: "m" },
    { id: "em_santa", label: "Santa (Spanish Male)", langCode: "e", gender: "m" },

    // French - 1F
    { id: "ff_siwis", label: "Siwis (French Female)", langCode: "f", gender: "f" },

    // Hindi - 2F 2M
    { id: "hf_alpha", label: "Alpha (Hindi Female)", langCode: "h", gender: "f" },
    { id: "hf_beta", label: "Beta (Hindi Female)", langCode: "h", gender: "f" },
    { id: "hm_omega", label: "Omega (Hindi Male)", langCode: "h", gender: "m" },
    { id: "hm_psi", label: "Psi (Hindi Male)", langCode: "h", gender: "m" },

    // Italian - 1F 1M
    { id: "if_sara", label: "Sara (Italian Female)", langCode: "i", gender: "f" },
    { id: "im_nicola", label: "Nicola (Italian Male)", langCode: "i", gender: "m" },

    // Brazilian Portuguese - 1F 2M
    { id: "pf_dora", label: "Dora (Portuguese Female)", langCode: "p", gender: "f" },
    { id: "pm_alex", label: "Alex (Portuguese Male)", langCode: "p", gender: "m" },
    { id: "pm_santa", label: "Santa (Portuguese Male)", langCode: "p", gender: "m" },
] as const;

export function voicesForLanguage(code: KokoroLangCode): readonly KokoroVoice[] {
    return KOKORO_VOICES.filter((v) => v.langCode === code);
}

export function kokoroLanguageLabel(code: KokoroLangCode): string {
    return KOKORO_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
