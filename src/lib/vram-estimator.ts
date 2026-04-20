// estimates peak vram for openvino models based on weight quantization,
// kv cache precision and target context length. unlike llama.cpp which
// preallocates a fixed context, openvino uses stateful models where the
// kv cache grows dynamically.

import { appState } from "$lib/state.svelte.js";

export type WeightQuantization = "FP16" | "INT8" | "INT4";
export type KVCachePrecision = "FP16" | "INT8";

export type ModelVramMetadata = {
  numHiddenLayers: number;
  numAttentionHeads: number;
  /** number of kv heads (GQA/MQA). falls back to numAttentionHeads for MHA */
  numKeyValueHeads: number;
  hiddenSize: number;
  /** total params in billions (e.g. 8.0 for an 8B model) */
  totalParamsBillions: number;
  /** null if unknown */
  maxPositionEmbeddings: number | null;
};

export type VramEstimatorInputs = {
  weightQuantization: WeightQuantization;
  /** precision of the kv cache entries */
  kvCachePrecision: KVCachePrecision;
  /** max sequence length the user plans to use (tokens) */
  targetContextLength: number;
  /** available VRAM in GB. null skips the OOM check */
  availableVramGB: number | null;
};

export type VramBreakdown = {
  weightVramGB: number;
  kvCacheVramGB: number;
  /** fixed openvino engine overhead */
  overheadVramGB: number;
  totalPeakVramGB: number;
  /** null when availableVramGB is unknown */
  isOom: boolean | null;
  /** fraction of available VRAM consumed (0-1+). null when availableVramGB is unknown */
  utilizationFraction: number | null;
};

export type QuantizationOption = {
  value: string;
  label: string;
  bytesPerValue: number;
  description: string;
};

export type HuggingFaceModelMetadata = {
  modelId: string;
  /** e.g. "8.00B Parameters". "Unknown" if unavailable */
  parameterSize: string;
  /** "FP16" if unquantized or undetected */
  quantization: WeightQuantization;
  quantSource: QuantSource;
  /** 0 if unknown */
  maxContextTokens: number;
  downloads: number;
  /** null if not reported by the API */
  safetensorsTotalBytes: number | null;
  /** null if config.json was unavailable */
  architecture: ModelVramMetadata | null;
};

export type HardwareInfo = {
  /** null if no discrete GPU detected */
  singleGpuVramGB: number | null;
  /** null if no discrete GPU detected */
  totalGpuVramGB: number | null;
  /** Number of discrete GPUs available. */
  gpuCount: number;
  /** Total system RAM in GB. null if unknown. */
  systemRamGB: number | null;
};

/** Classification of the best offload strategy for a given model + hardware. */
export type OffloadTier =
  | "single-gpu"
  | "multi-gpu"
  | "cpu-offload"
  | "partial"
  | "insufficient";

export type QuantSource = "api" | "name" | "config" | "fallback";

export type OffloadAnalysis = {
  /** best achievable offload tier for this model + hardware combo */
  tier: OffloadTier;
  /** 0 if weights alone exceed single GPU */
  singleGpuMaxTokens: number;
  /** equals singleGpuMaxTokens when only one GPU */
  multiGpuMaxTokens: number;
  /** 0 if even cpu offload isn't enough */
  cpuOffloadMaxTokens: number;
  maxModelContextLength: number;
  kvPerTokenGB: number;
  staticGB: number;
  gpuCount: number;
  hasSystemRamData: boolean;
  weightQuantization: WeightQuantization;
  kvCachePrecision: KVCachePrecision;
  weightQuantSource: QuantSource;
};

export const WEIGHT_BYTES: Record<WeightQuantization, number> = {
  FP16: 2,
  INT8: 1,
  INT4: 0.5,
};

export const KV_BYTES: Record<KVCachePrecision, number> = {
  FP16: 2,
  INT8: 1,
};

// fixed overhead for intermediate tensors and opencl context
export const OPENVINO_OVERHEAD_GB = 1.5;

export const WEIGHT_QUANT_OPTIONS: readonly QuantizationOption[] = [
  {
    value: "FP16",
    label: "FP16",
    bytesPerValue: 2,
    description: "Full precision — 2 bytes per parameter",
  },
  {
    value: "INT8",
    label: "INT8",
    bytesPerValue: 1,
    description: "8-bit quantization — 1 byte per parameter",
  },
  {
    value: "INT4",
    label: "INT4",
    bytesPerValue: 0.5,
    description: "4-bit quantization — 0.5 bytes per parameter",
  },
] as const;

export const KV_PRECISION_OPTIONS: readonly QuantizationOption[] = [
  {
    value: "FP16",
    label: "FP16",
    bytesPerValue: 2,
    description: "Full precision cache — 2 bytes per entry",
  },
  {
    value: "INT8",
    label: "INT8",
    bytesPerValue: 1,
    description: "8-bit cache (OpenVINO optimization) — 1 byte per entry",
  },
] as const;

export const CONTEXT_LENGTH_PRESETS: readonly {
  label: string;
  value: number;
}[] = [
  { label: "1K", value: 1024 },
  { label: "2K", value: 2048 },
  { label: "4K", value: 4096 },
  { label: "8K", value: 8192 },
  { label: "16K", value: 16384 },
  { label: "32K", value: 32768 },
];

export const MIN_CONTEXT_LENGTH = 1024;
export const MAX_CONTEXT_LENGTH = 32768;
export const CONTEXT_STEP = 256;
// minimum context considered usable for the partialoffload tier
export const MIN_USABLE_CONTEXT = 4096;
// fallback when model's actual context limit is unknown
export const DEFAULT_MAX_CONTEXT_LENGTH = 32768;

// three additive components:
//   1. weight memory  = totalParamsB x bytesPerWeight
//   2. peak kv cache  = 2 x tokens x layers x kvHeads x headDim x bytesPerKV
//   3. engine overhead = constant 1.5 GB
export function estimateVram(
  model: ModelVramMetadata,
  inputs: VramEstimatorInputs,
): VramBreakdown {
  // step 1 - weight memory
  const weightVramGB =
    model.totalParamsBillions * WEIGHT_BYTES[inputs.weightQuantization];

  // step 2 - peak kv cache memory
  // 2 (K+V) x tokens x layers x kvHeads x headDim x bytesPerKV
  const headDim = model.hiddenSize / model.numAttentionHeads;
  const kvHeads = model.numKeyValueHeads || model.numAttentionHeads;
  const bytesPerKV = KV_BYTES[inputs.kvCachePrecision];
  const maxKVCacheBytes =
    2 *
    inputs.targetContextLength *
    model.numHiddenLayers *
    kvHeads *
    headDim *
    bytesPerKV;
  const kvCacheVramGB = maxKVCacheBytes / 1024 ** 3;

  // step 3 - engine overhead
  const overheadVramGB = OPENVINO_OVERHEAD_GB;

  // step 4 - total peak vram
  const totalPeakVramGB = weightVramGB + kvCacheVramGB + overheadVramGB;

  // oom check
  let isOom: boolean | null = null;
  let utilizationFraction: number | null = null;

  if (inputs.availableVramGB !== null && inputs.availableVramGB > 0) {
    utilizationFraction = totalPeakVramGB / inputs.availableVramGB;
    isOom = totalPeakVramGB > inputs.availableVramGB;
  }

  return {
    weightVramGB,
    kvCacheVramGB,
    overheadVramGB,
    totalPeakVramGB,
    isOom,
    utilizationFraction,
  };
}

// derives ModelVramMetadata from raw config.json. accepts both snake_case and camelCase.
export function parseModelMetadata(
  config: Record<string, unknown>,
): ModelVramMetadata {
  const numAttentionHeads =
    typeof config.num_attention_heads === "number"
      ? config.num_attention_heads
      : typeof config.numAttentionHeads === "number"
        ? config.numAttentionHeads
        : 32;

  const numKeyValueHeads =
    typeof config.num_key_value_heads === "number"
      ? config.num_key_value_heads
      : typeof config.numKeyValueHeads === "number"
        ? config.numKeyValueHeads
        : null;

  const maxPosEmb =
    typeof config.max_position_embeddings === "number"
      ? config.max_position_embeddings
      : typeof config.maxPositionEmbeddings === "number"
        ? config.maxPositionEmbeddings
        : typeof config.max_sequence_length === "number"
          ? config.max_sequence_length
          : typeof config.n_positions === "number"
            ? config.n_positions
            : null;

  return {
    numHiddenLayers:
      typeof config.num_hidden_layers === "number"
        ? config.num_hidden_layers
        : typeof config.numHiddenLayers === "number"
          ? config.numHiddenLayers
          : 32,
    numAttentionHeads,
    numKeyValueHeads: numKeyValueHeads ?? numAttentionHeads,
    hiddenSize:
      typeof config.hidden_size === "number"
        ? config.hidden_size
        : typeof config.hiddenSize === "number"
          ? config.hiddenSize
          : 4096,
    totalParamsBillions: normalizeParamCount(
      typeof config.total_parameters === "number"
        ? config.total_parameters
        : typeof config.total_params_billions === "number"
          ? config.total_params_billions
          : typeof config.num_params === "number"
            ? config.num_params
            : 0,
    ),
    maxPositionEmbeddings: maxPosEmb,
  };
}

// hf config.json stores params as raw count (e.g. 80302612416) or already
// in billions (e.g. 8.03). values >= 1000 are raw counts.
function normalizeParamCount(value: number): number {
  if (value === 0) return 0;
  if (value >= 1000) return value / 1e9;
  return value;
}

// detect weight quantization from repo id, name or tags. openvino models on
// hf typically encode quant in repo name (e.g. "llama-3-8b-int8-ov").
// falls back to FP16 since unquantized openvino repos are typically FP16.
export function detectQuantization(
  modelId: string,
  tags: string[] = [],
): { quant: WeightQuantization; source: QuantSource } {
  const idLower = modelId.toLowerCase();

  // check tags first - some models use "ov:int4" or "ov:int8" tags
  for (const tag of tags) {
    const t = tag.toLowerCase();
    if (t === "ov:int4" || t === "int4" || t === "4bit" || t === "4-bit") {
      return { quant: "INT4", source: "config" };
    }
    if (t === "ov:int8" || t === "int8" || t === "8bit" || t === "8-bit") {
      return { quant: "INT8", source: "config" };
    }
    if (t === "ov:fp16" || t === "fp16" || t === "float16" || t === "f16") {
      return { quant: "FP16", source: "config" };
    }
  }

  // order matters: check int4 before int8
  if (
    /\bint[-_]?4\b/i.test(idLower) ||
    /\b4[-_]?bit\b/i.test(idLower) ||
    /\bw4a16\b/i.test(idLower)
  ) {
    return { quant: "INT4", source: "name" };
  }
  if (/\bint[-_]?8\b/i.test(idLower) || /\b8[-_]?bit\b/i.test(idLower)) {
    return { quant: "INT8", source: "name" };
  }
  if (
    /\bfp[-_]?16\b/i.test(idLower) ||
    /\bfloat[-_]?16\b/i.test(idLower) ||
    /\bf16\b/i.test(idLower) ||
    /\bbf16\b/i.test(idLower) ||
    /\bbfloat16\b/i.test(idLower)
  ) {
    return { quant: "FP16", source: "name" };
  }

  // repo has "ov" but no quant suffix - likely fp16 export but not certain
  return { quant: "FP16", source: "fallback" };
}

// prefers maxPositionEmbeddings from config.json, then name inference, then DEFAULT_MAX_CONTEXT_LENGTH
export function resolveMaxContextLength(
  metadata: ModelVramMetadata,
  modelId?: string,
): number {
  if (
    metadata.maxPositionEmbeddings !== null &&
    metadata.maxPositionEmbeddings > 0
  ) {
    return metadata.maxPositionEmbeddings;
  }

  // try to infer from model name, e.g. "LongCoder-16K", "model-32k"
  if (modelId) {
    const idLower = modelId.toLowerCase();
    const kMatch = idLower.match(/[._-](\d+)k\b/);
    if (kMatch) {
      return parseInt(kMatch[1], 10) * 1024;
    }
    // explicit token counts like "8192", "32768"
    const tokMatch = idLower.match(/[._-](\d{4,5})\b/);
    if (tokMatch) {
      const val = parseInt(tokMatch[1], 10);
      // sanity check: plausible context length (512-131072)
      if (val >= 512 && val <= 131072) {
        return val;
      }
    }
  }

  return DEFAULT_MAX_CONTEXT_LENGTH;
}

// infer param count (billions) from model name when config.json doesn't have total_parameters.
// matches "7B", "0.5B", "74M", etc.
export function inferParamsFromName(name: string): number | null {
  const bMatch = name.match(/(\d+\.?\d*)[Bb]/);
  if (bMatch) {
    return parseFloat(bMatch[1]);
  }
  // millions suffix - convert to billions
  const mMatch = name.match(/(\d+\.?\d*)[Mm]/);
  if (mMatch) {
    return parseFloat(mMatch[1]) / 1000;
  }
  return null;
}

export function formatGB(value: number): string {
  if (value >= 100) return value.toFixed(0);
  if (value >= 1) return value.toFixed(1);
  if (value >= 0.01) return value.toFixed(2);
  return value.toFixed(3);
}

// e.g. 8 -> "8.00B Parameters", 0.074 -> "74M Parameters"
export function formatParamSize(paramsB: number): string {
  if (paramsB <= 0) return "Unknown";
  if (paramsB < 0.001) {
    const val = Math.round(paramsB * 1e6);
    return val + "K Parameters";
  }
  if (paramsB < 1) {
    const val = (paramsB * 1000).toFixed(0);
    return val + "M Parameters";
  }
  return paramsB.toFixed(2) + "B Parameters";
}

// extract quantization from hf hub api tags.
// ov:int4/ov:int8 tags take priority; falls back to FP16 if no signal found.
export function detectQuantizationFromTags(tags: string[]): {
  quant: WeightQuantization;
  source: QuantSource;
} {
  const lowered = tags.map((t) => t.toLowerCase());

  // openvino-specific tags take priority
  if (lowered.includes("ov:int4") || lowered.includes("int4")) {
    return { quant: "INT4", source: "api" };
  }
  if (lowered.includes("ov:int8") || lowered.includes("int8")) {
    return { quant: "INT8", source: "api" };
  }
  if (lowered.includes("ov:fp16") || lowered.includes("fp16")) {
    return { quant: "FP16", source: "api" };
  }

  // generic quantization tags
  if (
    lowered.includes("4bit") ||
    lowered.includes("4-bit") ||
    lowered.includes("awq") ||
    lowered.includes("gptq")
  ) {
    return { quant: "INT4", source: "api" };
  }
  if (lowered.includes("8bit") || lowered.includes("8-bit")) {
    return { quant: "INT8", source: "api" };
  }
  if (
    lowered.includes("float16") ||
    lowered.includes("f16") ||
    lowered.includes("bf16") ||
    lowered.includes("bfloat16")
  ) {
    return { quant: "FP16", source: "api" };
  }

  // gguf repos almost always ship quantized - conservatively assume int4
  if (lowered.includes("gguf")) {
    return { quant: "INT4", source: "api" };
  }

  return { quant: "FP16", source: "fallback" };
}

// fallback chain: safetensors.total -> config.json total_parameters -> name inference
function extractParamCount(
  hubData: Record<string, unknown>,
  configData: Record<string, unknown> | null,
  quantization: WeightQuantization,
  modelId: string,
): { paramsBillions: number; safetensorsTotalBytes: number | null } {
  // 1. safetensors.total - most accurate for openvino models
  const safetensors = hubData.safetensors as
    | { total?: number }
    | undefined
    | null;
  if (
    safetensors &&
    typeof safetensors.total === "number" &&
    safetensors.total > 0
  ) {
    const totalBytes = safetensors.total;
    const bytesPerParam = WEIGHT_BYTES[quantization];
    // derive param count from file size and known quantization
    const paramsB = totalBytes / bytesPerParam / 1e9;
    return { paramsBillions: paramsB, safetensorsTotalBytes: totalBytes };
  }

  // 2. config.json fields
  if (configData) {
    const fromConfig = normalizeParamCount(
      typeof configData.total_parameters === "number"
        ? (configData.total_parameters as number)
        : typeof configData.total_params_billions === "number"
          ? (configData.total_params_billions as number)
          : typeof configData.num_params === "number"
            ? (configData.num_params as number)
            : 0,
    );
    if (fromConfig > 0) {
      return { paramsBillions: fromConfig, safetensorsTotalBytes: null };
    }
  }

  // 3. name inference
  const inferred = inferParamsFromName(modelId);
  if (inferred !== null) {
    return { paramsBillions: inferred, safetensorsTotalBytes: null };
  }

  return { paramsBillions: 0, safetensorsTotalBytes: null };
}

// hf rejects url-encoded slashes in repo IDs (400: "repo name includes an url-encoded slash").
// encode each path segment separately so the "/" stays literal.
export function encodeRepoId(modelId: string): string {
  return modelId
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

const metadataCache = new Map<string, HuggingFaceModelMetadata>();

export function clearMetadataCache(modelId?: string): void {
  if (modelId) {
    metadataCache.delete(modelId);
  } else {
    metadataCache.clear();
  }
}

export async function fetchModelMetadata(
  modelId: string,
): Promise<HuggingFaceModelMetadata> {
  // return cached result if available
  const cached = metadataCache.get(modelId);
  if (cached) {
    appState.addLog("v2", "Using cached HuggingFace metadata", modelId);
    return cached;
  }

  appState.addLog("v1", "Fetching HuggingFace metadata", modelId);

  // defaults for partial-failure returns
  const empty: HuggingFaceModelMetadata = {
    modelId,
    parameterSize: "Unknown",
    quantization: "FP16",
    quantSource: "fallback",
    maxContextTokens: 0,
    downloads: 0,
    safetensorsTotalBytes: null,
    architecture: null,
  };

  // fetch hub api data
  const encodedId = encodeRepoId(modelId);

  let hubData: Record<string, unknown> | null = null;
  let tags: string[] = [];
  let downloads = 0;

  try {
    const res = await fetch(`https://huggingface.co/api/models/${encodedId}`);
    if (res.ok) {
      hubData = (await res.json()) as Record<string, unknown>;
      tags = Array.isArray(hubData.tags) ? (hubData.tags as string[]) : [];
      downloads = typeof hubData.downloads === "number" ? hubData.downloads : 0;
      appState.addLog(
        "v2",
        "Hub API data fetched",
        `tags=${tags.length} downloads=${downloads}`,
      );
    } else {
      appState.addLog(
        "warn",
        "Hub API returned non-OK status",
        `${res.status} ${res.statusText}`,
      );
    }
  } catch (e) {
    // network error - continue with partial data
    appState.addLog(
      "error",
      "Failed to fetch Hub API data",
      e instanceof Error ? e.message : String(e),
    );
  }

  // fetch config.json
  let configData: Record<string, unknown> | null = null;

  try {
    const res = await fetch(
      `https://huggingface.co/${encodedId}/raw/main/config.json`,
    );
    if (res.ok) {
      configData = (await res.json()) as Record<string, unknown>;
      appState.addLog("v2", "config.json fetched successfully");
    } else {
      appState.addLog("v2", "config.json not available", `${res.status}`);
    }
  } catch (e) {
    // missing config is non-fatal
    appState.addLog(
      "v2",
      "config.json fetch failed (non-fatal)",
      e instanceof Error ? e.message : String(e),
    );
  }

  // hub api tags are authoritative; fall back to name-pattern matching
  const fromTags = detectQuantizationFromTags(tags);
  let quantization: WeightQuantization;
  let quantSource: QuantSource;

  if (fromTags.source === "api") {
    quantization = fromTags.quant;
    quantSource = "api";
  } else {
    // hub tags had no quant signal - try name patterns
    const fromName = detectQuantization(modelId, tags);
    quantization = fromName.quant;
    // map "config" (tagbased) to "api" since both originate from metadata
    quantSource = fromName.source === "config" ? "api" : fromName.source;
  }

  appState.addLog(
    "v2",
    "Quantization detected",
    `${quantization} (source: ${quantSource})`,
  );

  // extract parameter count
  const { paramsBillions, safetensorsTotalBytes } = extractParamCount(
    hubData ?? {},
    configData,
    quantization,
    modelId,
  );

  // parse architecture from config.json
  let architecture: ModelVramMetadata | null = null;

  if (configData) {
    architecture = parseModelMetadata(configData);
    // fill in params if config didnt have them
    if (architecture.totalParamsBillions === 0 && paramsBillions > 0) {
      architecture.totalParamsBillions = paramsBillions;
    }
    if (architecture.totalParamsBillions === 0) {
      architecture = null; // cant compute vram without params
    }
  }

  // extract max context tokens
  let maxContextTokens = 0;

  if (configData) {
    maxContextTokens =
      typeof configData.max_position_embeddings === "number"
        ? (configData.max_position_embeddings as number)
        : typeof configData.max_sequence_length === "number"
          ? (configData.max_sequence_length as number)
          : typeof configData.seq_length === "number"
            ? (configData.seq_length as number)
            : typeof configData.n_positions === "number"
              ? (configData.n_positions as number)
              : 0;
  }

  // build result
  const result: HuggingFaceModelMetadata = {
    modelId,
    parameterSize:
      paramsBillions > 0 ? formatParamSize(paramsBillions) : "Unknown",
    quantization,
    quantSource,
    maxContextTokens,
    downloads,
    safetensorsTotalBytes,
    architecture,
  };

  // cache result for future lookups
  metadataCache.set(modelId, result);

  appState.addLog(
    "v1",
    "HuggingFace metadata complete",
    `params=${result.parameterSize} quant=${result.quantization} ctx=${result.maxContextTokens}`,
  );

  return result;
}

// max tokens fitting in memory budget after subtracting static mem (weights + overhead).
// returns 0 if static mem alone exceeds budget.
export function computeMaxTokensForMemory(
  memoryBudgetGB: number,
  staticGB: number,
  kvPerTokenGB: number,
): number {
  const availableForKV = memoryBudgetGB - staticGB;
  if (availableForKV <= 0 || kvPerTokenGB <= 0) return 0;
  return Math.floor(availableForKV / kvPerTokenGB);
}

// computes max context per tier (single GPU, multigpu, cpu offload) and classifies
// the model into an offload tier. thresholds drive the contextlength bar viz:
//   0..singleGpuMaxTokens = one gpu (green)
//   singleGpu..multiGpu   = multi-gpu (blue)
//   multiGpu..cpuOffload  = cpu offload (orange)
//   cpuOffload..max       = unfillable (gray)
export function computeOffloadAnalysis(
  model: ModelVramMetadata,
  weightQuantization: WeightQuantization,
  kvCachePrecision: KVCachePrecision,
  hardware: HardwareInfo,
  maxModelContextLength: number = DEFAULT_MAX_CONTEXT_LENGTH,
  weightQuantSource: "api" | "name" | "config" | "fallback" = "fallback",
): OffloadAnalysis {
  // static memory: weights + overhead (constant regardless of context length)
  const weightGB = model.totalParamsBillions * WEIGHT_BYTES[weightQuantization];
  const staticGB = weightGB + OPENVINO_OVERHEAD_GB;

  // kv cache per token: 2 (K+V) x layers x kv_heads x head_dim x bytesPerKV
  const headDim = model.hiddenSize / model.numAttentionHeads;
  const kvHeads = model.numKeyValueHeads || model.numAttentionHeads;
  const bytesPerKV = KV_BYTES[kvCachePrecision];
  const kvPerTokenBytes =
    2 * model.numHiddenLayers * kvHeads * headDim * bytesPerKV;
  const kvPerTokenGB = kvPerTokenBytes / 1024 ** 3;

  // single gpu tier - uses only the largest discrete GPU
  const singleGpuMaxTokens =
    hardware.singleGpuVramGB !== null
      ? computeMaxTokensForMemory(
          hardware.singleGpuVramGB,
          staticGB,
          kvPerTokenGB,
        )
      : 0;

  // multi gpu tier - falls back to single gpu limit when gpuCount <= 1
  const totalGpuVramGB =
    hardware.totalGpuVramGB ?? hardware.singleGpuVramGB ?? 0;
  const multiGpuMaxTokens =
    hardware.gpuCount > 1
      ? computeMaxTokensForMemory(totalGpuVramGB, staticGB, kvPerTokenGB)
      : singleGpuMaxTokens;

  // cpu offload tier: all GPU VRAM + system RAM. falls back to multi-gpu limit if RAM unknown.
  const totalMemoryGB = totalGpuVramGB + (hardware.systemRamGB ?? 0);
  const hasSystemRamData = hardware.systemRamGB !== null;
  const cpuOffloadMaxTokens = hasSystemRamData
    ? computeMaxTokensForMemory(totalMemoryGB, staticGB, kvPerTokenGB)
    : multiGpuMaxTokens;

  // tier = best scenario for full max context
  let tier: OffloadTier;

  if (singleGpuMaxTokens >= maxModelContextLength) {
    tier = "single-gpu";
  } else if (
    hardware.gpuCount > 1 &&
    multiGpuMaxTokens >= maxModelContextLength
  ) {
    tier = "multi-gpu";
  } else if (cpuOffloadMaxTokens >= maxModelContextLength) {
    tier = "cpu-offload";
  } else if (cpuOffloadMaxTokens >= MIN_USABLE_CONTEXT) {
    tier = "partial";
  } else {
    tier = "insufficient";
  }

  return {
    tier,
    singleGpuMaxTokens,
    multiGpuMaxTokens,
    cpuOffloadMaxTokens,
    maxModelContextLength,
    kvPerTokenGB,
    staticGB,
    gpuCount: hardware.gpuCount,
    hasSystemRamData,
    weightQuantization,
    kvCachePrecision,
    weightQuantSource,
  };
}

// extracts discrete (non-shared) GPU data and system RAM from the openarc metrics payload
export function buildHardwareInfo(metrics: any): HardwareInfo {
  const gpus: any[] = metrics?.gpus ?? [];
  const discreteGpus = gpus.filter((g: any) => !g.is_shared);

  return {
    singleGpuVramGB:
      discreteGpus.length > 0
        ? Math.max(...discreteGpus.map((g: any) => g.total_vram / 1024))
        : null,
    totalGpuVramGB:
      discreteGpus.length > 0
        ? discreteGpus.reduce(
            (sum: number, g: any) => sum + g.total_vram / 1024,
            0,
          )
        : null,
    gpuCount: discreteGpus.length,
    systemRamGB:
      typeof metrics?.total_ram === "number" ? metrics.total_ram / 1024 : null,
  };
}
