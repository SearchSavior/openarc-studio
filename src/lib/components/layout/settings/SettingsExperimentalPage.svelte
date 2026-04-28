<script lang="ts">
	import { Switch } from "$lib/components/ui/switch";
	import { Label } from "$lib/components/ui/label";
	import { appState } from "$lib/state.svelte.js";
	import { Sparkles, AlertTriangle } from "@lucide/svelte";
</script>

<div class="space-y-6">
	<!-- Experimental warning -->
	<div
		class="flex items-start gap-2.5 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-2.5 rounded-md border border-amber-500/20"
	>
		<AlertTriangle class="w-3.5 h-3.5 shrink-0 mt-0.5" />
		<span class="leading-snug">
			These features are in active development and may change or break
			between releases.
		</span>
	</div>

	<!-- UI experiments -->
	<div class="space-y-3">
		<div
			class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"
		>
			<Sparkles class="w-3 h-3" />
			UI Experiments
		</div>
		<div
			class="rounded-lg bg-muted/20 border border-border/50 divide-y divide-border/50"
		>
			<div
				class="flex items-center justify-between p-4 gap-4"
			>
				<div class="min-w-0">
					<Label
						for="show-vram-estimator"
						class="text-[13px] font-semibold text-foreground"
					>
						VRAM Usage Estimator
					</Label>
					<p
						class="text-[11px] text-muted-foreground leading-snug mt-0.5"
					>
						Show the VRAM estimation panel in
						model views.
					</p>
					<p
						class="text-[11px] text-amber-600 dark:text-amber-400 leading-snug mt-1.5"
					>
						The formula and detection system is flawed and <b>will</b>,
						in most cases, <b>show a completely wrong estimation</b>.
					</p>
				</div>
				<Switch
					id="show-vram-estimator"
					bind:checked={appState.settings.showVramEstimator}
				/>
			</div>
		</div>
	</div>
</div>
