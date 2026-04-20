<script lang="ts">
    import {
        CheckCircle2,
        AlertCircle,
        RefreshCw,
        Cpu,
        MemoryStick,
        ArrowRight,
        Info,
    } from "@lucide/svelte";
    import {
        type OffloadAnalysis,
        type OffloadTier,
        type QuantSource,
        formatGB,
    } from "$lib/vram-estimator.js";

    let { analysis }: { analysis: OffloadAnalysis } = $props();

    const totalTokens = $derived(analysis.maxModelContextLength);

    const greenTokens = $derived(analysis.singleGpuMaxTokens);
    const blueTokens = $derived(
        analysis.gpuCount > 1
            ? Math.max(
                  0,
                  analysis.multiGpuMaxTokens - analysis.singleGpuMaxTokens,
              )
            : 0,
    );
    const orangeTokens = $derived(
        analysis.hasSystemRamData
            ? Math.max(
                  0,
                  analysis.cpuOffloadMaxTokens - analysis.multiGpuMaxTokens,
              )
            : 0,
    );
    const grayTokens = $derived(
        Math.max(
            0,
            analysis.maxModelContextLength - analysis.cpuOffloadMaxTokens,
        ),
    );

    const greenPct = $derived(
        totalTokens > 0 ? (greenTokens / totalTokens) * 100 : 0,
    );
    const bluePct = $derived(
        totalTokens > 0 ? (blueTokens / totalTokens) * 100 : 0,
    );
    const orangePct = $derived(
        totalTokens > 0 ? (orangeTokens / totalTokens) * 100 : 0,
    );
    const grayPct = $derived(
        totalTokens > 0 ? (grayTokens / totalTokens) * 100 : 0,
    );

    type TierConfig = {
        icon: typeof CheckCircle2;
        label: string;
        sublabel: string;
        bgClass: string;
        textClass: string;
        borderClass: string;
    };

    const tierConfig = $derived.by<TierConfig>(() => {
        switch (analysis.tier) {
            case "single-gpu":
                return {
                    icon: CheckCircle2,
                    label: "Full Single GPU Offload",
                    sublabel: `Entire model + max context fits on one GPU`,
                    bgClass: "bg-emerald-500/10",
                    textClass: "text-emerald-600 dark:text-emerald-400",
                    borderClass: "border-emerald-500/20",
                };
            case "multi-gpu":
                return {
                    icon: RefreshCw,
                    label: "Full Multi-GPU Offload",
                    sublabel: `Entire model + max context fits across ${analysis.gpuCount} GPUs`,
                    bgClass: "bg-blue-500/10",
                    textClass: "text-blue-600 dark:text-blue-400",
                    borderClass: "border-blue-500/20",
                };
            case "cpu-offload":
                return {
                    icon: Cpu,
                    label: "CPU + GPU Offload Required",
                    sublabel: `Full context possible with CPU+GPU (up to ${analysis.cpuOffloadMaxTokens.toLocaleString()} tokens)`,
                    bgClass: "bg-orange-500/10",
                    textClass: "text-orange-600 dark:text-orange-400",
                    borderClass: "border-orange-500/20",
                };
            case "partial":
                return {
                    icon: AlertCircle,
                    label: "Partial Offload Only",
                    sublabel: `Up to ${analysis.cpuOffloadMaxTokens.toLocaleString()} tokens possible with CPU+GPU`,
                    bgClass: "bg-amber-500/10",
                    textClass: "text-amber-600 dark:text-amber-400",
                    borderClass: "border-amber-500/20",
                };
            case "insufficient":
                return {
                    icon: AlertCircle,
                    label: "Insufficient Memory",
                    sublabel:
                        "Even minimal context cannot fit in available memory",
                    bgClass: "bg-destructive/10",
                    textClass: "text-destructive",
                    borderClass: "border-destructive/20",
                };
        }
    });

    function formatTokens(n: number): string {
        if (n >= 1000) {
            const k = n / 1000;
            return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
        }
        return n.toString();
    }

    const hasBlueSegment = $derived(blueTokens > 0);
    const hasOrangeSegment = $derived(orangeTokens > 0);
    const hasGraySegment = $derived(grayTokens > 0);
    const hasAnySegments = $derived(
        greenTokens > 0 || hasBlueSegment || hasOrangeSegment,
    );
</script>

<div class="space-y-3" data-slot="vram-offload-bar">
    <!-- Tier Badge -->
    <div
        class="flex items-center gap-2 px-3 py-2 rounded-lg border {tierConfig.bgClass} {tierConfig.borderClass}"
    >
        <tierConfig.icon class="w-4 h-4 shrink-0 {tierConfig.textClass}" />
        <div class="min-w-0">
            <div class="text-xs font-semibold {tierConfig.textClass}">
                {tierConfig.label}
            </div>
            <div class="text-[10px] text-muted-foreground mt-0.5">
                {tierConfig.sublabel}
            </div>
        </div>
    </div>

    <!-- Context Length Bar -->
    {#if hasAnySegments || hasGraySegment}
        <div class="space-y-2">
            <div class="flex items-center justify-between">
                <span
                    class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1"
                >
                    <MemoryStick class="w-3 h-3" />
                    Context Length Offload Tiers
                </span>
                <span class="text-[10px] text-muted-foreground">
                    0 → {formatTokens(analysis.maxModelContextLength)} tokens
                </span>
            </div>

            <!-- Stacked bar -->
            <div
                class="relative h-7 w-full rounded-lg overflow-hidden border border-border/50 bg-muted/20"
            >
                <!-- Green: single GPU -->
                {#if greenPct > 0}
                    <div
                        class="absolute top-0 left-0 h-full bg-emerald-500/70 transition-all duration-300"
                        style="width: {greenPct}%"
                    >
                        <div
                            class="h-full w-full flex items-center justify-center text-[9px] font-bold text-white px-1 truncate"
                        >
                            {#if greenPct > 8}
                                {formatTokens(greenTokens)}
                            {:else if greenPct > 4}
                                {formatTokens(greenTokens)}
                            {/if}
                        </div>
                    </div>
                {/if}

                <!-- Blue: multi-GPU -->
                {#if bluePct > 0}
                    <div
                        class="absolute top-0 h-full bg-blue-500/70 transition-all duration-300"
                        style="left: {greenPct}%; width: {bluePct}%"
                    >
                        <div
                            class="h-full w-full flex items-center justify-center text-[9px] font-bold text-white px-1 truncate"
                        >
                            {#if bluePct > 8}
                                <ArrowRight class="w-2.5 h-2.5 mr-0.5" />
                                {formatTokens(analysis.multiGpuMaxTokens)}
                            {:else if bluePct > 4}
                                <ArrowRight class="w-2.5 h-2.5" />
                            {/if}
                        </div>
                    </div>
                {/if}

                <!-- Orange: CPU offload -->
                {#if orangePct > 0}
                    <div
                        class="absolute top-0 h-full bg-orange-500/70 transition-all duration-300"
                        style="left: {greenPct + bluePct}%; width: {orangePct}%"
                    >
                        <div
                            class="h-full w-full flex items-center justify-center text-[9px] font-bold text-white px-1 truncate"
                        >
                            {#if orangePct > 8}
                                <Cpu class="w-2.5 h-2.5 mr-0.5" />
                                {formatTokens(analysis.cpuOffloadMaxTokens)}
                            {:else if orangePct > 4}
                                <Cpu class="w-2.5 h-2.5" />
                            {/if}
                        </div>
                    </div>
                {/if}

                <!-- Gray: unfillable -->
                {#if grayPct > 0}
                    <div
                        class="absolute top-0 h-full bg-muted-foreground/20 transition-all duration-300"
                        style="left: {greenPct +
                            bluePct +
                            orangePct}%; width: {grayPct}%"
                    >
                        <div
                            class="h-full w-full flex items-center justify-center text-[9px] font-bold text-muted-foreground/60 px-1 truncate"
                        >
                            {#if grayPct > 6}
                                ✕
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Legend -->
            <div
                class="flex items-center gap-3 text-[9px] text-muted-foreground flex-wrap"
            >
                <span class="flex items-center gap-1">
                    <span
                        class="inline-block w-2 h-2 rounded-sm bg-emerald-500/70"
                    ></span>
                    Single GPU
                </span>
                {#if hasBlueSegment}
                    <span class="flex items-center gap-1">
                        <span
                            class="inline-block w-2 h-2 rounded-sm bg-blue-500/70"
                        ></span>
                        Multi-GPU
                    </span>
                {/if}
                {#if hasOrangeSegment}
                    <span class="flex items-center gap-1">
                        <span
                            class="inline-block w-2 h-2 rounded-sm bg-orange-500/70"
                        ></span>
                        CPU Offload
                    </span>
                {/if}
                {#if hasGraySegment}
                    <span class="flex items-center gap-1">
                        <span
                            class="inline-block w-2 h-2 rounded-sm bg-muted-foreground/20"
                        ></span>
                        Won't Fit
                    </span>
                {/if}
            </div>

            <!-- Token boundary annotations -->
            <div class="text-[10px] text-muted-foreground space-y-0.5">
                {#if greenTokens > 0 && greenTokens < analysis.maxModelContextLength}
                    <div class="flex items-center gap-1.5">
                        <span
                            class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/70"
                        ></span>
                        <span
                            >Up to <span
                                class="font-semibold text-emerald-600 dark:text-emerald-400"
                                >{formatTokens(greenTokens)}</span
                            > tokens — single GPU</span
                        >
                    </div>
                {:else if greenTokens === 0}
                    <div class="flex items-center gap-1.5">
                        <span
                            class="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/20"
                        ></span>
                        <span
                            >Weights alone exceed single GPU VRAM ({formatGB(
                                analysis.staticGB,
                            )} GB needed)</span
                        >
                    </div>
                {/if}

                {#if hasBlueSegment}
                    <div class="flex items-center gap-1.5">
                        <span
                            class="inline-block w-1.5 h-1.5 rounded-full bg-blue-500/70"
                        ></span>
                        <span
                            >{formatTokens(greenTokens)} –
                            <span
                                class="font-semibold text-blue-600 dark:text-blue-400"
                                >{formatTokens(
                                    analysis.multiGpuMaxTokens,
                                )}</span
                            >
                            tokens — multi-GPU ({analysis.gpuCount} GPUs)</span
                        >
                    </div>
                {/if}

                {#if hasOrangeSegment}
                    <div class="flex items-center gap-1.5">
                        <span
                            class="inline-block w-1.5 h-1.5 rounded-full bg-orange-500/70"
                        ></span>
                        <span
                            >{formatTokens(analysis.multiGpuMaxTokens)} –
                            <span
                                class="font-semibold text-orange-600 dark:text-orange-400"
                                >{formatTokens(
                                    analysis.cpuOffloadMaxTokens,
                                )}</span
                            > tokens — CPU + GPU offload</span
                        >
                    </div>
                {/if}

                {#if hasGraySegment}
                    <div class="flex items-center gap-1.5">
                        <span
                            class="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/20"
                        ></span>
                        <span
                            >Beyond <span
                                class="font-semibold text-muted-foreground"
                                >{formatTokens(
                                    analysis.cpuOffloadMaxTokens,
                                )}</span
                            > — insufficient memory</span
                        >
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    <!-- Static memory info -->
    <div
        class="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap"
    >
        <span
            >Static: <span class="font-mono font-medium"
                >{formatGB(analysis.staticGB)} GB</span
            ></span
        >
        <span class="text-border">|</span>
        <span
            >KV per 1K tokens: <span class="font-mono font-medium"
                >{formatGB(analysis.kvPerTokenGB * 1024)} GB</span
            ></span
        >
        <span class="text-border">|</span>
        <span
            >Weights: <span class="font-mono font-medium"
                >{analysis.weightQuantization}</span
            >
            {#if analysis.weightQuantSource === "api"}
                <span class="text-emerald-600 dark:text-emerald-400"
                    >(from API)</span
                >
            {:else if analysis.weightQuantSource === "name"}
                <span class="text-emerald-600 dark:text-emerald-400"
                    >(detected)</span
                >
            {:else if analysis.weightQuantSource === "config"}
                <span class="text-emerald-600 dark:text-emerald-400"
                    >(from config)</span
                >
            {:else}
                <span class="text-amber-600 dark:text-amber-400">(assumed)</span
                >
            {/if}</span
        >
    </div>

    <!-- Estimation disclaimer -->
    <div
        class="flex items-start gap-1.5 text-[9px] text-muted-foreground/60 italic"
    >
        <Info class="w-2.5 h-2.5 shrink-0 mt-0.5" />
        <span>
            These numbers are estimates only. Actual VRAM usage depends on
            runtime behavior, model architecture quirks, and OpenVINO
            optimizations.
            {#if analysis.weightQuantSource === "fallback"}
                Weight quantization was not detected from the Hub API, model
                name, or tags and is assumed to be {analysis.weightQuantization} —
                verify the actual format before relying on these numbers.
            {/if}
        </span>
    </div>
</div>
