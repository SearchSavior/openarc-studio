<script lang="ts">
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import { Switch } from "$lib/components/ui/switch";
	import { Label } from "$lib/components/ui/label";
	import { appState } from "$lib/state.svelte.js";
	import {
		FolderOpen,
		Globe,
		Loader2,
		AlertCircle,
		RefreshCw,
	} from "@lucide/svelte";
	import {
		fetchCuratedManifest,
		isCuratedLoading,
		getCuratedError,
	} from "$lib/curated-models.svelte.js";

	async function refreshCuratedManifest() {
		await fetchCuratedManifest();
		appState.addLog(
			"v1",
			"Curated manifest refresh triggered from Settings",
		);
	}
</script>

<div class="space-y-6">
	<!-- Paths & Sources -->
	<div class="space-y-3">
		<div
			class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
		>
			Paths & Sources
		</div>
		<div
			class="rounded-lg bg-muted/20 border border-border/50 p-4 space-y-4"
		>
			<div class="space-y-1.5">
				<Label
					for="model-path"
					class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
				>
					<FolderOpen class="w-3 h-3" />
					Default Model Download Path
				</Label>
				<div class="flex gap-2">
					<Input
						id="model-path"
						bind:value={appState.settings.defaultModelPath}
						readonly
						disabled={appState.settings.runtimeMode === "remote"}
						class="h-9 bg-background font-mono text-xs disabled:opacity-50"
					/>
					<Button
						variant="outline"
						size="sm"
						class="h-9 shrink-0"
						disabled={appState.settings.runtimeMode === "remote"}
					>
						Browse
					</Button>
				</div>
				{#if appState.settings.runtimeMode === "local"}
					<p
						class="text-[11px] text-muted-foreground leading-snug"
					>
						Where OpenArc Studio will download
						and store models.
					</p>
				{:else}
					<p
						class="text-[11px] text-amber-600 dark:text-amber-400 leading-snug"
					>
						Only Available for Local Instances
					</p>
				{/if}
			</div>

			<div class="h-px bg-border/60 -mx-4"></div>

			<div class="space-y-1.5">
				<Label
					for="curated-url"
					class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
				>
					<Globe class="w-3 h-3" />
					Curated Models Manifest URL
				</Label>
				<div class="flex gap-2">
					<Input
						id="curated-url"
						bind:value={appState.settings.curatedManifestUrl}
						placeholder="https://raw.githubusercontent.com/.../curated-manifest.json"
						class="h-9 bg-background font-mono text-xs"
					/>
					<Button
						variant="outline"
						size="sm"
						class="h-9 shrink-0 gap-1.5"
						disabled={isCuratedLoading()}
						onclick={refreshCuratedManifest}
					>
						{#if isCuratedLoading()}
							<Loader2
								class="w-3.5 h-3.5 animate-spin"
							/>
						{:else}
							<RefreshCw
								class="w-3.5 h-3.5"
							/>
						{/if}
						Refresh
					</Button>
				</div>
				<p
					class="text-[11px] text-muted-foreground leading-snug"
				>
					URL to a JSON manifest of
					pre-configured models. Leave empty
					to use the default curated list.
				</p>
				{#if getCuratedError()}
					<div
						class="flex items-start gap-1.5 text-[11px] text-destructive bg-destructive/10 px-2 py-1.5 rounded-md border border-destructive/20 mt-1"
					>
						<AlertCircle
							class="w-3 h-3 shrink-0 mt-0.5"
						/>
						<span class="break-words"
							>{getCuratedError()}</span
						>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Startup -->
	<div class="space-y-3">
		<div
			class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
		>
			Startup & Updates
		</div>
		<div
			class="rounded-lg bg-muted/20 border border-border/50 divide-y divide-border/50"
		>
			<div
				class="flex items-center justify-between p-4 gap-4"
			>
				<div class="min-w-0">
					<Label
						for="start-boot"
						class="text-[13px] font-semibold text-foreground"
					>
						Start on System Boot
					</Label>
					<p
						class="text-[11px] text-muted-foreground leading-snug mt-0.5"
					>
						Launch OpenArc Studio
						automatically when you log in.
					</p>
				</div>
				<Switch
					id="start-boot"
					bind:checked={appState.settings.startOnBoot}
				/>
			</div>

			<div
				class="flex items-center justify-between p-4 gap-4"
			>
				<div class="min-w-0">
					<Label
						for="auto-update"
						class="text-[13px] font-semibold text-foreground"
					>
						Automatic Updates
					</Label>
					<p
						class="text-[11px] text-muted-foreground leading-snug mt-0.5"
					>
						Download and install updates in
						the background.
					</p>
				</div>
				<Switch
					id="auto-update"
					bind:checked={appState.settings.autoUpdate}
				/>
			</div>

		</div>
	</div>
</div>