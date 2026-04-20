export type ModelTypeValue =
  | "llm"
  | "vlm"
  | "whisper"
  | "qwen3_asr"
  | "kokoro"
  | "qwen3_tts_custom_voice"
  | "qwen3_tts_voice_design"
  | "qwen3_tts_voice_clone"
  | "emb"
  | "rerank";

export type ModelTypeCategory =
  | "LLM"
  | "VLM"
  | "STT"
  | "TTS"
  | "EMB"
  | "RERANK";

export type EngineValue = "optimum" | "ovgenai" | "openvino";

export type ModelTypeEntry = {
  /** snake_case value matching the OpenArc backend ModelType enum, sent to /openarc/load */
  value: ModelTypeValue;
  /** uppercase label written to openarc.json for backwardscompat with existing configs */
  label: string;
  description: string;
  category: ModelTypeCategory;
  engine: EngineValue;
};

export const MODEL_TYPES: readonly ModelTypeEntry[] = [
  {
    value: "llm",
    label: "LLM",
    description: "LLM — Text Generation",
    category: "LLM",
    engine: "ovgenai",
  },
  {
    value: "vlm",
    label: "VLM",
    description: "VLM — Vision-Language",
    category: "VLM",
    engine: "ovgenai",
  },
  {
    value: "whisper",
    label: "WHISPER",
    description: "Whisper — Speech-to-Text",
    category: "STT",
    engine: "optimum",
  },
  {
    value: "qwen3_asr",
    label: "QWEN3_ASR",
    description: "Qwen3 ASR — Speech-to-Text",
    category: "STT",
    engine: "optimum",
  },
  {
    value: "kokoro",
    label: "KOKORO",
    description: "Kokoro — Text-to-Speech",
    category: "TTS",
    engine: "openvino",
  },
  {
    value: "qwen3_tts_custom_voice",
    label: "QWEN3_TTS_CUSTOM_VOICE",
    description: "Qwen3-TTS — Preset Speaker",
    category: "TTS",
    engine: "openvino",
  },
  {
    value: "qwen3_tts_voice_design",
    label: "QWEN3_TTS_VOICE_DESIGN",
    description: "Qwen3-TTS — Voice Design",
    category: "TTS",
    engine: "openvino",
  },
  {
    value: "qwen3_tts_voice_clone",
    label: "QWEN3_TTS_VOICE_CLONE",
    description: "Qwen3-TTS — Voice Cloning",
    category: "TTS",
    engine: "openvino",
  },
  {
    value: "emb",
    label: "EMB",
    description: "Embedding",
    category: "EMB",
    engine: "optimum",
  },
  {
    value: "rerank",
    label: "RERANK",
    description: "Reranker",
    category: "RERANK",
    engine: "optimum",
  },
];

// legacy uppercase shorthands stored in older openarc.json files
const LEGACY_ALIASES: Record<string, ModelTypeValue> = {
  stt: "whisper",
  tts: "kokoro",
  embedding: "emb",
  reranker: "rerank",
};

export function resolveModelType(
  arch: string | null | undefined,
): ModelTypeEntry | null {
  if (!arch) return null;
  const key = String(arch).toLowerCase().trim();
  if (!key) return null;

  const exact = MODEL_TYPES.find((t) => t.value === key);
  if (exact) return exact;

  const aliased = LEGACY_ALIASES[key];
  if (aliased) {
    return MODEL_TYPES.find((t) => t.value === aliased) ?? null;
  }

  return null;
}

export function getModelCategory(
  arch: string | null | undefined,
): ModelTypeCategory | "UNKNOWN" {
  return resolveModelType(arch)?.category ?? "UNKNOWN";
}

/**
 * heuristically infer model type from folder name, repo id or path when no
 * openarc.json declares one. returns null if no signal is strong enough.
 *
 * qwen3-tts variants share a checkpoint but differ in routing mode; defaults
 * to qwen3_tts_custom_voice unless the string mentions "clone" or "design".
 */
export function detectModelType(
  ...inputs: Array<string | null | undefined>
): ModelTypeValue | null {
  const s = inputs
    .filter((x): x is string => !!x)
    .join(" ")
    .toLowerCase();
  if (!s) return null;

  const has = (needle: string) => s.includes(needle);
  const hasWord = (re: RegExp) => re.test(s);

  if (has("qwen3")) {
    if (has("tts")) {
      if (has("base")) return "qwen3_tts_voice_clone";
      if (has("design")) return "qwen3_tts_voice_design";
      return "qwen3_tts_custom_voice";
    }
    if (has("asr")) return "qwen3_asr";
  }

  if (has("whisper")) return "whisper";
  if (has("kokoro")) return "kokoro";

  if (has("rerank") || has("reranker")) return "rerank";

  if (
    has("embedding") ||
    hasWord(/\b(bge|gte|e5|jina-embed|nomic-embed|snowflake-arctic-embed)\b/) ||
    hasWord(/-embed(ding)?\b/)
  ) {
    return "emb";
  }

  if (
    has("vision") ||
    has("vlm") ||
    hasWord(/-vl\b/) ||
    hasWord(/\bllava\b/) ||
    hasWord(/\bpix2struct\b/) ||
    hasWord(/\bminicpm[-_]?v\b/)
  ) {
    return "vlm";
  }

  return null;
}

export function getArchColor(arch: string | null | undefined): string {
  switch (getModelCategory(arch)) {
    case "LLM":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "VLM":
      return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    case "STT":
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "TTS":
      return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    case "EMB":
      return "bg-pink-500/10 text-pink-500 border-pink-500/20";
    case "RERANK":
      return "bg-cyan-500/10 text-cyan-500 border-cyan-500/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function getArchAccent(arch: string | null | undefined): string {
  switch (getModelCategory(arch)) {
    case "LLM":
      return "bg-blue-500";
    case "VLM":
      return "bg-purple-500";
    case "STT":
      return "bg-emerald-500";
    case "TTS":
      return "bg-amber-500";
    case "EMB":
      return "bg-pink-500";
    case "RERANK":
      return "bg-cyan-500";
    default:
      return "bg-muted-foreground/40";
  }
}
