<script lang="ts">
	import { Switch } from "$lib/components/ui/switch";
	import { Label } from "$lib/components/ui/label";
	import { appState } from "$lib/state.svelte.js";
	import { setMode, resetMode, mode } from "mode-watcher";
	import { Moon, Sun, Monitor } from "@lucide/svelte";
</script>

<div class="space-y-6">
	<!-- Theme -->
	<div class="space-y-3">
		<div
			class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
		>
			Theme
		</div>
		<div
			class="rounded-lg bg-muted/20 border border-border/50 p-4"
		>
			<div class="grid grid-cols-3 gap-2">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="group relative rounded-md border p-3 flex flex-col items-center gap-2 cursor-pointer transition-all
						{mode.current === 'dark'
						? 'bg-muted/40 border-primary/50 shadow-sm ring-1 ring-primary/20'
						: 'bg-background border-border/50 hover:border-border'}"
					onclick={() => setMode("dark")}
				>
					<div
						class="w-10 h-10 rounded-full bg-slate-900 border border-border/50 flex items-center justify-center"
					>
						<Moon
							class="w-4 h-4 text-slate-300"
						/>
					</div>
					<span
						class="text-[11px] font-semibold"
					>
						Dark
					</span>
				</div>
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="group relative rounded-md border p-3 flex flex-col items-center gap-2 cursor-pointer transition-all
						{mode.current === 'light'
						? 'bg-muted/40 border-primary/50 shadow-sm ring-1 ring-primary/20'
						: 'bg-background border-border/50 hover:border-border'}"
					onclick={() => setMode("light")}
				>
					<div
						class="w-10 h-10 rounded-full bg-slate-100 border border-border/50 flex items-center justify-center"
					>
						<Sun
							class="w-4 h-4 text-amber-500"
						/>
					</div>
					<span
						class="text-[11px] font-semibold"
					>
						Light
					</span>
				</div>
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="group relative rounded-md border p-3 flex flex-col items-center gap-2 cursor-pointer transition-all
						{mode.current === undefined
						? 'bg-muted/40 border-primary/50 shadow-sm ring-1 ring-primary/20'
						: 'bg-background border-border/50 hover:border-border'}"
					onclick={() => resetMode()}
				>
					<div
						class="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-900 border border-border/50 flex items-center justify-center"
					>
						<Monitor
							class="w-4 h-4 text-foreground/80"
						/>
					</div>
					<span
						class="text-[11px] font-semibold"
					>
						System
					</span>
				</div>
			</div>
		</div>
	</div>

	<!-- Chat -->
	<div class="space-y-3">
		<div
			class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
		>
			Chat Interface
		</div>
		<div
			class="rounded-lg bg-muted/20 border border-border/50 divide-y divide-border/50"
		>
			<div
				class="flex items-center justify-between p-4 gap-4"
			>
				<div class="min-w-0">
					<Label
						for="compact-mode"
						class="text-[13px] font-semibold text-foreground"
					>
						Compact Chat Mode
					</Label>
					<p
						class="text-[11px] text-muted-foreground leading-snug mt-0.5"
					>
						Decrease padding and spacing in
						the chat interface.
					</p>
				</div>
				<Switch
					id="compact-mode"
					bind:checked={appState.settings.compactMode}
				/>
			</div>

			<div
				class="flex items-center justify-between p-4 gap-4"
			>
				<div class="min-w-0">
					<Label
						for="auto-scroll"
						class="text-[13px] font-semibold text-foreground"
					>
						Auto-scroll to Latest Message
					</Label>
					<p
						class="text-[11px] text-muted-foreground leading-snug mt-0.5"
					>
						Automatically scroll the chat
						view to the bottom as new
						messages stream in.
					</p>
				</div>
				<Switch
					id="auto-scroll"
					bind:checked={appState.settings.autoScroll}
				/>
			</div>
		</div>
	</div>
</div>