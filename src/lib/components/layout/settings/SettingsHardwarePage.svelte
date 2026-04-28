<script lang="ts">
	import { openarc } from "$lib/client.svelte.js";
	import { Cpu, Database, HardDrive, Activity } from "@lucide/svelte";
</script>

<div class="space-y-6">
	<!-- Processor & Memory -->
	<div class="space-y-3">
		<div
			class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
		>
			System
		</div>
		<div class="grid grid-cols-2 gap-2">
			{#if openarc.metrics?.cpus?.[0]}
				{@const cpu = openarc.metrics.cpus[0]}
				<div
					class="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2.5"
				>
					<div class="flex items-center gap-2">
						<div
							class="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
						>
							<Cpu class="w-3 h-3 text-primary" />
						</div>
						<h4
							class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
						>
							Processor
						</h4>
					</div>
					<div
						class="font-semibold text-[13px] truncate"
						title={cpu.name}
					>
						{cpu.name}
					</div>
					<div class="text-[11px] text-muted-foreground">
						{cpu.cores} Cores · {cpu.threads} Threads
					</div>
					<div class="flex items-center gap-2">
						<div
							class="flex-1 bg-background rounded-full h-1.5 overflow-hidden border border-border/50"
						>
							<div
								class="bg-emerald-500 h-full rounded-full transition-all duration-300"
								style="width: {cpu.usage}%"
							></div>
						</div>
						<div
							class="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap"
						>
							{cpu.usage.toFixed(1)}%
						</div>
					</div>
				</div>
			{:else}
				<div
					class="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2.5"
				>
					<div class="flex items-center gap-2">
						<div
							class="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
						>
							<Cpu class="w-3 h-3 text-primary" />
						</div>
						<h4
							class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
						>
							Processor
						</h4>
					</div>
					<div class="font-semibold text-[13px]">
						Intel Core Ultra
					</div>
					<div
						class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md w-fit border border-emerald-500/20"
					>
						OpenVINO Compatible
					</div>
				</div>
			{/if}

			<div
				class="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2.5"
			>
				<div class="flex items-center gap-2">
					<div
						class="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
					>
						<Database class="w-3 h-3 text-primary" />
					</div>
					<h4
						class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
					>
						System Memory
					</h4>
				</div>
				{#if openarc.metrics}
					{@const usedGb = (
						openarc.metrics.used_ram / 1024
					).toFixed(1)}
					{@const totalGb = (
						openarc.metrics.total_ram / 1024
					).toFixed(1)}
					{@const pct =
						(openarc.metrics.used_ram /
							openarc.metrics.total_ram) *
						100}
					<div class="font-semibold text-[13px]">
						{totalGb} GB Total RAM
					</div>
					<div class="text-[11px] text-muted-foreground">
						{usedGb} GB in use
					</div>
					<div class="flex items-center gap-2">
						<div
							class="flex-1 bg-background rounded-full h-1.5 overflow-hidden border border-border/50"
						>
							<div
								class="bg-primary h-full rounded-full transition-all duration-300"
								style="width: {pct}%"
							></div>
						</div>
						<div
							class="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap"
						>
							{pct.toFixed(0)}%
						</div>
					</div>
				{:else}
					<div class="font-semibold text-[13px]">
						32.0 GB Total RAM
					</div>
					<div class="text-[11px] text-muted-foreground">
						14.2 GB Available
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Accelerators -->
	<div class="space-y-3">
		<div
			class="flex items-center justify-between"
		>
			<div
				class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"
			>
				<HardDrive class="w-3 h-3" />
				Accelerators (OpenVINO Devices)
			</div>
		</div>

		<div class="space-y-2">
			{#if openarc.metrics?.gpus?.length > 0}
				{#each openarc.metrics.gpus as gpu}
					{@const usedGb = (
						gpu.used_vram / 1024
					).toFixed(1)}
					{@const totalGb = (
						gpu.total_vram / 1024
					).toFixed(1)}
					{@const pct =
						(gpu.used_vram /
							gpu.total_vram) *
						100}
					<div
						class="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3"
					>
						<div
							class="flex justify-between items-start gap-3"
						>
							<div class="min-w-0">
								<div
									class="font-semibold text-[13px] truncate"
								>
									{gpu.id}: {gpu.name}
								</div>
								<div
									class="text-[11px] text-muted-foreground mt-0.5"
								>
									Graphics Processing
									Unit
								</div>
							</div>
							<div
								class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border font-mono shrink-0"
							>
								{totalGb} GB
								{gpu.is_shared
									? "Shared"
									: "VRAM"}
							</div>
						</div>
						<div
							class="flex items-center gap-2"
						>
							<div
								class="flex-1 bg-background rounded-full h-1.5 overflow-hidden border border-border/50"
							>
								<div
									class="bg-primary h-full rounded-full transition-all duration-300"
									style="width: {pct}%"
								></div>
							</div>
							<div
								class="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap"
							>
								{usedGb} / {totalGb} GB
								· {gpu.usage.toFixed(1)}%
							</div>
						</div>
					</div>
				{/each}
			{/if}
			{#if openarc.metrics?.npus?.length > 0}
				{#each openarc.metrics.npus as npu}
					<div
						class="rounded-lg border border-border/50 bg-muted/20 p-4"
					>
						<div
							class="flex justify-between items-start gap-3"
						>
							<div class="min-w-0">
								<div
									class="font-semibold text-[13px] truncate"
								>
									{npu.id}: {npu.name}
								</div>
								<div
									class="text-[11px] text-muted-foreground mt-0.5"
								>
									Neural Processing
									Unit
								</div>
							</div>
							<div
								class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border shrink-0"
							>
								Dedicated AI
							</div>
						</div>
					</div>
				{/each}
			{/if}
			{#if !openarc.metrics?.gpus?.length && !openarc.metrics?.npus?.length}
				<div
					class="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3"
				>
					<div
						class="flex justify-between items-start gap-3"
					>
						<div class="min-w-0">
							<div
								class="font-semibold text-[13px] truncate"
							>
								GPU.0: Intel Arc
								Graphics
							</div>
							<div
								class="text-[11px] text-muted-foreground mt-0.5"
							>
								Integrated GPU
							</div>
						</div>
						<div
							class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border font-mono shrink-0"
						>
							16.0 GB Shared
						</div>
					</div>
					<div class="flex items-center gap-2">
						<div
							class="flex-1 bg-background rounded-full h-1.5 overflow-hidden border border-border/50"
						>
							<div
								class="bg-primary h-full rounded-full"
								style="width: 15%"
							></div>
						</div>
						<div
							class="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap"
						>
							2.4 / 16.0 GB
						</div>
					</div>
				</div>

				<div
					class="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3"
				>
					<div
						class="flex justify-between items-start gap-3"
					>
						<div class="min-w-0">
							<div
								class="font-semibold text-[13px] truncate"
							>
								NPU: Intel AI Boost
							</div>
							<div
								class="text-[11px] text-muted-foreground mt-0.5"
							>
								Neural Processing Unit
							</div>
						</div>
						<div
							class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border shrink-0"
						>
							Dedicated AI
						</div>
					</div>
					<div class="flex items-center gap-2">
						<div
							class="flex-1 bg-background rounded-full h-1.5 overflow-hidden border border-border/50"
						>
							<div
								class="bg-blue-500 h-full rounded-full"
								style="width: 5%"
							></div>
						</div>
						<div
							class="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap"
						>
							Idle
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Resource monitor -->
	<div class="space-y-3">
		<div
			class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"
		>
			<Activity class="w-3 h-3" />
			Resource Monitor
		</div>
		<div
			class="rounded-lg border border-border/50 bg-muted/20 p-6 h-[180px] flex items-center justify-center flex-col text-muted-foreground"
		>
			<Activity class="w-8 h-8 mb-2 opacity-30" />
			<span class="text-sm font-semibold">
				Real-time telemetry
			</span>
			<span class="text-[11px] mt-0.5 text-muted-foreground">
				Waiting for Tauri backend to connect
			</span>
		</div>
	</div>
</div>