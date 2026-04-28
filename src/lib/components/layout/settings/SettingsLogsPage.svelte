openarc/openarc-studio/src/lib/components/layout/settings/SettingsLogsPage.svelte
```

```svelte
<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { appState } from "$lib/state.svelte.js";
	import { Activity } from "@lucide/svelte";

	let logVerbosity = $state(2);
	const logLevelMap: Record<string, number> = {
		error: 0,
		warn: 1,
		info: 2,
		v1: 3,
		v2: 4,
		v3: 5,
		v4: 6,
	};

	const filteredLogs = $derived(
		appState.logs.filter(
			(l) => (logLevelMap[l.level] ?? 2) <= logVerbosity,
		),
	);
</script>

<div class="space-y-3">
	<div
		class="flex items-center justify-between gap-3 flex-wrap"
	>
		<div
			class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
		>
			Event Stream
		</div>
		<div class="flex items-center gap-2">
			<select
				bind:value={logVerbosity}
				class="h-8 rounded-md border border-input bg-background px-2 py-1 text-[11px] shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
			>
				<option value={0}>Errors Only</option>
				<option value={1}
					>Warnings & Errors</option
				>
				<option value={2}
					>Info & Above</option
				>
				<option value={3}
					>Verbose 1 (Major Steps)</option
				>
				<option value={4}
					>Verbose 2 (Minor Steps)</option
				>
				<option value={5}
					>Verbose 3 (Tracing)</option
				>
				<option value={6}
					>Verbose 4 (Raw Data)</option
				>
			</select>
			<Button
				variant="outline"
				size="sm"
				class="h-8 gap-1.5 text-xs"
				onclick={() => appState.clearLogs()}
			>
				Clear
			</Button>
		</div>
	</div>

	<div
		class="flex items-center gap-2 flex-wrap text-[11px]"
	>
		<div
			class="inline-flex items-center gap-1.5 bg-muted/50 text-foreground px-2 py-1 rounded-md border"
		>
			<span class="tabular-nums font-semibold"
				>{filteredLogs.length}</span
			>
			<span class="text-muted-foreground"
				>shown</span
			>
		</div>
		<div
			class="inline-flex items-center gap-1.5 bg-muted/50 text-foreground px-2 py-1 rounded-md border"
		>
			<span class="tabular-nums font-semibold"
				>{appState.logs.length}</span
			>
			<span class="text-muted-foreground"
				>total</span
			>
		</div>
	</div>

	<div
		class="rounded-lg border border-border/50 bg-muted/20 overflow-hidden"
	>
		{#if filteredLogs.length === 0}
			<div
				class="h-[360px] flex flex-col items-center justify-center text-muted-foreground text-sm gap-2"
			>
				<Activity class="w-6 h-6 opacity-30" />
				<span class="text-[12px] font-medium">
					No logs match the current filter
				</span>
			</div>
		{:else}
			<div
				class="p-2 space-y-0.5 font-mono text-[11px] leading-tight max-h-[480px] overflow-auto"
			>
				{#each filteredLogs as log}
					<div
						class="flex items-start gap-2 p-1.5 rounded-md border border-transparent transition-colors {log.level ===
						'error'
							? 'bg-destructive/5 text-destructive border-destructive/10 hover:bg-destructive/10'
							: log.level === 'warn'
							  ? 'text-amber-500 hover:bg-muted/50'
							  : log.level === 'info'
							    ? 'text-foreground hover:bg-muted/50'
							    : 'text-muted-foreground hover:bg-muted/50'}"
					>
						<span
							class="shrink-0 opacity-50 whitespace-nowrap tabular-nums"
						>
							{log.timestamp.toLocaleTimeString(
								[],
								{
									hour12: false,
									hour: "2-digit",
									minute: "2-digit",
									second: "2-digit",
								},
							)}
						</span>
						<span
							class="shrink-0 font-bold uppercase w-10 tracking-wider"
						>
							{log.level}
						</span>
						<div
							class="flex-1 flex flex-col gap-1 min-w-0"
						>
							<span
								class="break-words font-medium"
								>{log.message}</span
							>
							{#if log.details}
								<span
									class="break-words opacity-80 whitespace-pre-wrap"
									>{log.details}</span
								>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>