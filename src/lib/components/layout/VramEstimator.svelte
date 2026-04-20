<script lang="ts">
    import { cn } from "$lib/utils.js";
    import { Slider } from "$lib/components/ui/slider";
    import { Input } from "$lib/components/ui/input";
    import { AlertTriangle, MemoryStick, Gauge, Cpu } from "@lucide/svelte";
    import { appState } from "$lib/state.svelte.js";
    import { openarc } from "$lib/client.svelte.js";
    import {
        estimateVram,
        formatGB,
        inferParamsFromName,
        WEIGHT_QUANT_OPTIONS,
        KV_PRECISION_OPTIONS,
        CONTEXT_LENGTH_PRESETS,
        MIN_CONTEXT_LENGTH,
        MAX_CONTEXT_LENGTH,
        CONTEXT_STEP,
        type ModelVramMetadata,
        type VramBreakdown,
        type WeightQuantization,
        type KVCachePrecision,
    } from "$lib/vram-estimator.js";

    let {
        modelMetadata = null,
        modelName = "",
    }: {
        modelMetadata: ModelVramMetadata | null;
        modelName?: string;
    } = $props();

    let weightQuantization = $state<WeightQuantization>("INT8");
    let kvCachePrecision = $state<KVCachePrecision>("FP16");
    let targetContextLength = $state(4096);
    let availableVramGB = $state<number | null>(null);

    const effectiveMetadata = $derived.by<ModelVramMetadata>(() => {
        if (modelMetadata) return modelMetadata;
        const inferred = inferParamsFromName(modelName);
        return {
            numHiddenLayers: 32,
            numAttentionHeads: 32,
            numKeyValueHeads: 32,
            hiddenSize: 4096,
            totalParamsBillions: inferred ?? 7,
            maxPositionEmbeddings: null,
        };
    });

    const breakdown = $derived.by<VramBreakdown>(() => {
        return estimateVram(effectiveMetadata, {
            weightQuantization,
            kvCachePrecision,
            targetContextLength,
            availableVramGB,
        });
    });

    const gpus = $derived(openarc.metrics?.gpus || []);

    $effect(() => {
        if (availableVramGB === null && gpus.length > 0) {
            const discreteGpu = gpus.find((g: any) => !g.is_shared);
            if (discreteGpu) {
                availableVramGB = parseFloat(
                    (discreteGpu.total_vram / 1024).toFixed(1),
                );
                appState.addLog(
                    "v2",
                    `Auto-detected GPU VRAM: ${availableVramGB} GB`,
                );
            }
        }
    });

    const barTotalGB = $derived.by(() => {
        if (availableVramGB !== null && availableVramGB > 0) {
            return Math.max(availableVramGB, breakdown.totalPeakVramGB);
        }
        return breakdown.totalPeakVramGB;
    });

    const weightPercent = $derived(
        barTotalGB > 0 ? (breakdown.weightVramGB / barTotalGB) * 100 : 0,
    );
    const kvPercent = $derived(
        barTotalGB > 0 ? (breakdown.kvCacheVramGB / barTotalGB) * 100 : 0,
    );
    const overheadPercent = $derived(
        barTotalGB > 0 ? (breakdown.overheadVramGB / barTotalGB) * 100 : 0,
    );
</script>

<div class="space-y-5" data-slot="vram-estimator">
    <!-- Section Header -->
    <h4
        class="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
    >
        <MemoryStick class="w-3.5 h-3.5 text-primary" />
        VRAM Estimator
    </h4>

    <!-- Stacked Progress Bar -->
    <div class="space-y-2">
        <div
            class="relative h-8 w-full rounded-lg overflow-hidden border border-border/50 bg-muted/20"
        >
            <!-- Weights segment -->
            <div
                class="absolute top-0 left-0 h-full bg-blue-500/70 transition-all duration-300 ease-out"
                style="width: {weightPercent}%"
            >
                <div
                    class="h-full w-full flex items-center justify-center text-[10px] font-bold text-white"
                >
                    {#if weightPercent > 12}
                        {formatGB(breakdown.weightVramGB)} GB
                    {/if}
                </div>
            </div>
            <!-- KV Cache segment -->
            <div
                class="absolute top-0 h-full bg-amber-500/70 transition-all duration-300 ease-out"
                style="left: {weightPercent}%; width: {kvPercent}%"
            >
                <div
                    class="h-full w-full flex items-center justify-center text-[10px] font-bold text-white"
                >
                    {#if kvPercent > 12}
                        {formatGB(breakdown.kvCacheVramGB)} GB
                    {/if}
                </div>
            </div>
            <!-- Overhead segment -->
            <div
                class="absolute top-0 h-full bg-muted-foreground/30 transition-all duration-300 ease-out"
                style="left: {weightPercent +
                    kvPercent}%; width: {overheadPercent}%"
            >
                <div
                    class="h-full w-full flex items-center justify-center text-[10px] font-bold text-muted-foreground"
                >
                    {#if overheadPercent > 14}
                        {formatGB(breakdown.overheadVramGB)} GB
                    {/if}
                </div>
            </div>
        </div>

        <!-- Legend -->
        <div class="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span class="flex items-center gap-1.5">
                <span class="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500/70"
                ></span>
                Weights
            </span>
            <span class="flex items-center gap-1.5">
                <span
                    class="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500/70"
                ></span>
                KV Cache
            </span>
            <span class="flex items-center gap-1.5">
                <span
                    class="inline-block w-2.5 h-2.5 rounded-sm bg-muted-foreground/30"
                ></span>
                Overhead
            </span>
        </div>

        <!-- Total + OOM Warning -->
        <div class="flex items-center justify-between">
            <span
                class={cn(
                    "text-sm font-bold",
                    breakdown.isOom
                        ? "text-destructive"
                        : breakdown.utilizationFraction !== null &&
                            breakdown.utilizationFraction > 0.85
                          ? "text-amber-500"
                          : "text-foreground",
                )}
            >
                {formatGB(breakdown.totalPeakVramGB)} GB peak
            </span>
            {#if breakdown.utilizationFraction !== null}
                <span
                    class={cn(
                        "text-xs font-medium",
                        breakdown.isOom
                            ? "text-destructive"
                            : breakdown.utilizationFraction > 0.85
                              ? "text-amber-500"
                              : "text-muted-foreground",
                    )}
                >
                    {Math.round((breakdown.utilizationFraction ?? 0) * 100)}% of {formatGB(
                        availableVramGB ?? 0,
                    )} GB
                </span>
            {/if}
        </div>

        {#if breakdown.isOom}
            <div
                class="bg-destructive/10 text-destructive text-xs px-3 py-2 rounded-md flex items-start gap-2 border border-destructive/20"
            >
                <AlertTriangle class="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>
                    <span class="font-semibold">Out of Memory Risk</span>
                    <p class="mt-0.5 text-destructive/80">
                        Peak VRAM exceeds available memory by
                        {formatGB(
                            breakdown.totalPeakVramGB - (availableVramGB ?? 0),
                        )} GB. Consider reducing context length, using lower quantization,
                        or INT8 KV cache.
                    </p>
                </div>
            </div>
        {:else if breakdown.utilizationFraction !== null && breakdown.utilizationFraction > 0.85}
            <div
                class="bg-amber-500/10 text-amber-500 text-xs px-3 py-2 rounded-md flex items-start gap-2 border border-amber-500/20"
            >
                <Gauge class="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                    <span class="font-semibold">High utilization</span> —
                    {formatGB(
                        (availableVramGB ?? 0) - breakdown.totalPeakVramGB,
                    )} GB headroom remaining.
                </span>
            </div>
        {/if}
    </div>

    <!-- Controls -->
    <div class="space-y-3 p-3 bg-muted/20 border border-border/50 rounded-lg">
        <!-- Weight Quantization -->
        <div class="grid gap-1.5">
            <label
                for="vram-weight-quant"
                class="text-[10px] font-medium text-muted-foreground uppercase"
            >
                Weight Quantization
            </label>
            <select
                id="vram-weight-quant"
                bind:value={weightQuantization}
                class="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 py-1 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
                {#each WEIGHT_QUANT_OPTIONS as opt}
                    <option value={opt.value}
                        >{opt.label} — {opt.description}</option
                    >
                {/each}
            </select>
        </div>

        <!-- KV Cache Precision -->
        <div class="grid gap-1.5">
            <label
                for="vram-kv-precision"
                class="text-[10px] font-medium text-muted-foreground uppercase"
            >
                KV Cache Precision
            </label>
            <select
                id="vram-kv-precision"
                bind:value={kvCachePrecision}
                class="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 py-1 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
                {#each KV_PRECISION_OPTIONS as opt}
                    <option value={opt.value}
                        >{opt.label} — {opt.description}</option
                    >
                {/each}
            </select>
        </div>

        <!-- Target Context Length -->
        <div class="grid gap-1.5">
            <div class="flex items-center justify-between">
                <label
                    for="vram-ctx-slider"
                    class="text-[10px] font-medium text-muted-foreground uppercase"
                >
                    Target Context Length
                </label>
                <span class="text-xs font-mono font-semibold text-primary">
                    {targetContextLength.toLocaleString()} tokens
                </span>
            </div>
            <Slider
                id="vram-ctx-slider"
                type="single"
                value={targetContextLength}
                onValueChange={(v: number) => (targetContextLength = v)}
                min={MIN_CONTEXT_LENGTH}
                max={MAX_CONTEXT_LENGTH}
                step={CONTEXT_STEP}
            />
            <!-- Quick presets -->
            <div class="flex items-center gap-1 flex-wrap">
                {#each CONTEXT_LENGTH_PRESETS as preset}
                    <button
                        type="button"
                        class={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors border",
                            targetContextLength === preset.value
                                ? "bg-primary/15 text-primary border-primary/30"
                                : "bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground",
                        )}
                        onclick={() => (targetContextLength = preset.value)}
                    >
                        {preset.label}
                    </button>
                {/each}
            </div>
        </div>

        <!-- Available VRAM -->
        <div class="grid gap-1.5">
            <div class="flex items-center justify-between">
                <label
                    for="vram-available"
                    class="text-[10px] font-medium text-muted-foreground uppercase flex items-center gap-1"
                >
                    <Cpu class="w-3 h-3" />
                    Available VRAM
                </label>
                {#if gpus.length > 0}
                    <span class="text-[10px] text-muted-foreground">
                        Auto-detected from server
                    </span>
                {/if}
            </div>
            <div class="flex items-center gap-2">
                <Input
                    id="vram-available"
                    type="number"
                    step="0.5"
                    min="1"
                    value={availableVramGB !== null ? availableVramGB : ""}
                    oninput={(e: Event) => {
                        const val = parseFloat(
                            (e.target as HTMLInputElement).value,
                        );
                        availableVramGB = isNaN(val) || val <= 0 ? null : val;
                    }}
                    class="h-8 text-xs bg-background"
                    placeholder="e.g. 16"
                />
                <span class="text-xs text-muted-foreground shrink-0">GB</span>
            </div>
            {#if gpus.length > 0}
                <div class="flex flex-wrap gap-1 mt-0.5">
                    {#each gpus as gpu}
                        <button
                            type="button"
                            class={cn(
                                "px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors border",
                                availableVramGB ===
                                    parseFloat(
                                        (gpu.total_vram / 1024).toFixed(1),
                                    )
                                    ? "bg-primary/15 text-primary border-primary/30"
                                    : "bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground",
                            )}
                            onclick={() => {
                                availableVramGB = parseFloat(
                                    (gpu.total_vram / 1024).toFixed(1),
                                );
                            }}
                        >
                            {gpu.is_shared
                                ? "Shared"
                                : `${(gpu.total_vram / 1024).toFixed(1)} GB`}
                            — {gpu.name || gpu.id}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    </div>

    <!-- Breakdown Table -->
    <div class="text-[11px] space-y-1.5">
        <div class="flex items-center justify-between px-1">
            <span class="text-muted-foreground flex items-center gap-1.5">
                <span class="inline-block w-2 h-2 rounded-sm bg-blue-500/70"
                ></span>
                Model Weights
            </span>
            <span class="font-mono font-semibold"
                >{formatGB(breakdown.weightVramGB)} GB</span
            >
        </div>
        <div class="flex items-center justify-between px-1">
            <span class="text-muted-foreground flex items-center gap-1.5">
                <span class="inline-block w-2 h-2 rounded-sm bg-amber-500/70"
                ></span>
                KV Cache (peak at {targetContextLength.toLocaleString()} tokens)
            </span>
            <span class="font-mono font-semibold"
                >{formatGB(breakdown.kvCacheVramGB)} GB</span
            >
        </div>
        <div class="flex items-center justify-between px-1">
            <span class="text-muted-foreground flex items-center gap-1.5">
                <span
                    class="inline-block w-2 h-2 rounded-sm bg-muted-foreground/30"
                ></span>
                OpenVINO Overhead
            </span>
            <span class="font-mono font-semibold"
                >{formatGB(breakdown.overheadVramGB)} GB</span
            >
        </div>
        <div
            class="border-t border-border/50 pt-1.5 flex items-center justify-between px-1"
        >
            <span class="font-semibold text-foreground">Total Peak VRAM</span>
            <span
                class={cn(
                    "font-mono font-bold",
                    breakdown.isOom
                        ? "text-destructive"
                        : breakdown.utilizationFraction !== null &&
                            breakdown.utilizationFraction > 0.85
                          ? "text-amber-500"
                          : "text-foreground",
                )}
            >
                {formatGB(breakdown.totalPeakVramGB)} GB
            </span>
        </div>
    </div>
</div>
