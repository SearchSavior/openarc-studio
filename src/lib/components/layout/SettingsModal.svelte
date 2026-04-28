<script lang="ts">
	import * as Dialog from "$lib/components/ui/dialog";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Button } from "$lib/components/ui/button";
	import { appState } from "$lib/state.svelte.js";
	import {
		Settings,
		Info,
		Palette,
		Server,
		Cpu,
		Activity,
		Sparkles,
		CheckCircle2,
	} from "@lucide/svelte";
	import SettingsGeneralPage from "./settings/SettingsGeneralPage.svelte";
	import SettingsAppearancePage from "./settings/SettingsAppearancePage.svelte";
	import SettingsRuntimePage from "./settings/SettingsRuntimePage.svelte";
	import SettingsHardwarePage from "./settings/SettingsHardwarePage.svelte";
	import SettingsLogsPage from "./settings/SettingsLogsPage.svelte";
	import SettingsExperimentalPage from "./settings/SettingsExperimentalPage.svelte";

	type Tab = "general" | "appearance" | "runtime" | "hardware" | "logs" | "experimental";
	let activeTab = $state<Tab>("general");

	const tabs = [
		{
			id: "general" as const,
			label: "General",
			description: "Global behavior and paths",
			icon: Settings,
		},
		{
			id: "appearance" as const,
			label: "Appearance",
			description: "Theme and layout",
			icon: Palette,
		},
		{
			id: "runtime" as const,
			label: "Runtime",
			description: "Local or remote server",
			icon: Server,
		},
		{
			id: "hardware" as const,
			label: "Hardware",
			description: "System capabilities",
			icon: Cpu,
		},
		{
			id: "logs" as const,
			label: "System Logs",
			description: "Events and tracing",
			icon: Activity,
		},
		{
			id: "experimental" as const,
			label: "Experimental Features",
			description: "Features in active development",
			icon: Sparkles,
		},
	] as const;

	const activeTabMeta = $derived(
		tabs.find((t) => t.id === activeTab) ?? tabs[0],
	);

	$effect(() => {
		// track settings deep for reactivity
		JSON.stringify(appState.settings);

		if (appState.settingsOpen) {
			appState.saveSettings();
		}
	});
</script>

<Dialog.Root bind:open={appState.settingsOpen}>
	<Dialog.Content
		class="sm:max-w-[1040px] w-[94vw] h-[84vh] p-0 flex flex-row overflow-hidden gap-0 bg-background border shadow-2xl"
	>
		<Dialog.Title class="sr-only">Settings</Dialog.Title>
		<Dialog.Description class="sr-only">
			Configure OpenArc Studio preferences, appearance, runtime, and
			hardware.
		</Dialog.Description>

		<!-- Left nav -->
		<div
			class="w-[260px] shrink-0 border-r flex flex-col h-full overflow-hidden bg-muted/10"
		>
			<div
				class="shrink-0 px-4 pt-5 pb-4 border-b bg-gradient-to-b from-muted/30 to-transparent"
			>
				<div class="flex items-center gap-3">
					<div
						class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
					>
						<Settings class="w-4 h-4 text-primary" />
					</div>
					<div class="min-w-0">
						<h2
							class="text-sm font-bold tracking-tight leading-tight"
						>
							Settings
						</h2>
						<p
							class="text-[11px] text-muted-foreground leading-tight mt-0.5"
						>
							Preferences and connection
						</p>
					</div>
				</div>
			</div>

			<ScrollArea class="flex-1 min-h-0">
				<div class="p-2 space-y-1">
					{#each tabs as tab}
						{@const isActive = activeTab === tab.id}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="group relative flex items-center gap-2.5 px-2.5 py-2 rounded-md border cursor-pointer transition-all
								{isActive
								? 'bg-muted/40 border-primary/50 shadow-sm ring-1 ring-primary/20'
								: 'bg-transparent border-transparent hover:bg-background hover:border-border'}"
							onclick={() => (activeTab = tab.id)}
						>
							<div
								class="w-1 self-stretch rounded-full bg-primary {isActive
									? 'opacity-100'
									: 'opacity-0 group-hover:opacity-40'}"
							></div>
							<div
								class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 {isActive
									? 'bg-primary/10 text-primary'
									: 'bg-muted/40 text-muted-foreground group-hover:text-foreground'}"
							>
								<tab.icon class="w-3.5 h-3.5" />
							</div>
							<div class="flex-1 min-w-0">
								<div
									class="text-[13px] font-semibold leading-tight {isActive
										? 'text-foreground'
										: 'text-foreground/90'}"
								>
									{tab.label}
								</div>
								<div
									class="text-[10.5px] text-muted-foreground truncate leading-tight mt-0.5"
								>
									{tab.description}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</ScrollArea>

			<div
				class="shrink-0 border-t px-4 py-3 bg-muted/20 flex items-center gap-2 text-[10.5px] text-muted-foreground"
			>
				<Info class="w-3.5 h-3.5 shrink-0" />
				<span class="leading-tight">
					Changes are saved automatically
				</span>
			</div>
		</div>

		<!-- Right content panel -->
		<div class="flex-1 flex flex-col bg-background overflow-hidden min-w-0">
			<!-- Gradient header -->
			<div
				class="shrink-0 px-6 pt-5 pb-4 border-b bg-gradient-to-b from-muted/20 to-background"
			>
				<div class="flex items-center gap-3 pr-10">
					<div
						class="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
					>
						<activeTabMeta.icon class="w-4 h-4 text-primary" />
					</div>
					<div class="min-w-0">
						<h3
							class="text-base font-bold tracking-tight leading-tight"
						>
							{activeTabMeta.label}
						</h3>
						<p
							class="text-xs text-muted-foreground leading-tight mt-0.5"
						>
							{activeTabMeta.description}
						</p>
					</div>
				</div>
			</div>

			<!-- Scrollable form body -->
			<ScrollArea class="flex-1 min-h-0">
				<div class="px-6 py-5 max-w-3xl">
					{#if activeTab === "general"}
						<SettingsGeneralPage />
					{:else if activeTab === "appearance"}
						<SettingsAppearancePage />
					{:else if activeTab === "runtime"}
						<SettingsRuntimePage />
					{:else if activeTab === "hardware"}
						<SettingsHardwarePage />
					{:else if activeTab === "logs"}
						<SettingsLogsPage />
					{:else if activeTab === "experimental"}
						<SettingsExperimentalPage />
					{/if}
				</div>
			</ScrollArea>

			<!-- Footer -->
			<div
				class="shrink-0 px-5 py-3 border-t bg-muted/10 flex items-center justify-between gap-3"
			>
				<div
					class="flex items-center gap-1.5 text-[11px] text-muted-foreground"
				>
					<CheckCircle2 class="w-3.5 h-3.5 text-emerald-500" />
					<span>Changes saved automatically</span>
				</div>
				<Button
					size="sm"
					class="h-8"
					onclick={() => (appState.settingsOpen = false)}
				>
					Done
				</Button>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>