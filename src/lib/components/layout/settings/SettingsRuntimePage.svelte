<script lang="ts">
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import { Label } from "$lib/components/ui/label";
	import { appState } from "$lib/state.svelte.js";
	import { openarc } from "$lib/client.svelte.js";
	import {
		Laptop,
		Server,
		Download,
		Loader2,
		Activity,
		CheckCircle2,
		AlertCircle,
	} from "@lucide/svelte";

	let openarcVersion = $state("v1.2.0");
	let connectionStatus = $state<"idle" | "testing" | "success" | "error">(
		"idle",
	);
	let connectionMessage = $state("");

	async function testConnection() {
		connectionStatus = "testing";
		await openarc.configure(
			appState.settings.remoteEndpoint,
			appState.settings.apiKey,
		);
		if (openarc.status && !openarc.error) {
			connectionStatus = "success";
			connectionMessage = "Connected successfully to OpenArc Server.";
		} else {
			connectionStatus = "error";
			connectionMessage =
				openarc.error ||
				"Failed to get a valid response from the server.";
		}
	}
</script>

<div class="space-y-6">
	<!-- Mode selector -->
	<div class="space-y-3">
		<div
			class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
		>
			Connection Mode
		</div>
		<div class="grid grid-cols-2 gap-2">
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="group relative rounded-lg border p-4 cursor-pointer transition-all
					{appState.settings.runtimeMode ===
					'local'
					? 'bg-muted/40 border-primary/50 shadow-sm ring-1 ring-primary/20'
					: 'bg-background border-border/50 hover:border-border'}"
				onclick={() =>
					(appState.settings.runtimeMode =
						"local")}
			>
				<div class="flex items-center gap-2.5">
					<div
						class="w-8 h-8 rounded-md flex items-center justify-center shrink-0 {appState
							.settings.runtimeMode ===
						'local'
							? 'bg-primary/10 text-primary border border-primary/20'
							: 'bg-muted/40 text-muted-foreground'}"
					>
						<Laptop class="w-4 h-4" />
					</div>
					<div class="min-w-0">
						<h4
							class="text-[13px] font-semibold leading-tight"
						>
							Local Server
						</h4>
						<p
							class="text-[10.5px] text-muted-foreground leading-tight mt-0.5"
						>
							Managed on this machine
						</p>
					</div>
				</div>
				<p
					class="text-[11px] text-muted-foreground leading-snug mt-2.5"
				>
					OpenArc Studio manages the
					inference server locally on your
					machine.
				</p>
			</div>

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="group relative rounded-lg border p-4 cursor-pointer transition-all
					{appState.settings.runtimeMode ===
					'remote'
					? 'bg-muted/40 border-primary/50 shadow-sm ring-1 ring-primary/20'
					: 'bg-background border-border/50 hover:border-border'}"
				onclick={() =>
					(appState.settings.runtimeMode =
						"remote")}
			>
				<div class="flex items-center gap-2.5">
					<div
						class="w-8 h-8 rounded-md flex items-center justify-center shrink-0 {appState
							.settings.runtimeMode ===
						'remote'
							? 'bg-primary/10 text-primary border border-primary/20'
							: 'bg-muted/40 text-muted-foreground'}"
					>
						<Server class="w-4 h-4" />
					</div>
					<div class="min-w-0">
						<h4
							class="text-[13px] font-semibold leading-tight"
						>
							Remote Server
						</h4>
						<p
							class="text-[10.5px] text-muted-foreground leading-tight mt-0.5"
						>
							Connect to existing server
						</p>
					</div>
				</div>
				<p
					class="text-[11px] text-muted-foreground leading-snug mt-2.5"
				>
					Connect to an existing OpenArc
					server running elsewhere.
				</p>
			</div>
		</div>
	</div>

	{#if appState.settings.runtimeMode === "local"}
		<!-- Engine version -->
		<div class="space-y-3">
			<div
				class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
			>
				OpenArc Engine
			</div>
			<div
				class="rounded-lg bg-muted/20 border border-border/50 p-4 space-y-3"
			>
				<div class="space-y-1.5">
					<Label
						for="openarc-version"
						class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
					>
						Engine Version
					</Label>
					<div class="flex gap-2">
						<select
							id="openarc-version"
							class="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
							bind:value={openarcVersion}
						>
							<option value="v1.2.0"
								>v1.2.0 (Latest)</option
							>
							<option value="v1.1.5"
								>v1.1.5 (Stable)</option
							>
							<option value="nightly"
								>Nightly Build</option
							>
						</select>
						<Button
							variant="outline"
							size="sm"
							class="h-9 shrink-0"
						>
							Update
						</Button>
					</div>
					<p
						class="text-[11px] text-muted-foreground leading-snug"
					>
						Select the version of the
						OpenArc engine to use.
					</p>
				</div>
			</div>
		</div>

		<!-- Intel software stack -->
		<div class="space-y-3">
			<div
				class="flex items-center justify-between"
			>
				<div
					class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
				>
					Intel Software Stack
				</div>
				<div
					class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20"
				>
					Update Available
				</div>
			</div>
			<div
				class="rounded-lg bg-muted/20 border border-border/50 p-4 space-y-3"
			>
				<p
					class="text-[12px] text-foreground/90 leading-snug"
				>
					Ensure optimal performance and
					compatibility for OpenVINO
					execution across your CPU, GPU, and
					NPU.
				</p>
				<p
					class="text-[11px] text-muted-foreground leading-snug"
				>
					This updates compute runtimes, GPU
					drivers (Intel Arc / iGPU), and NPU
					drivers to the latest validated
					versions for OpenArc.
				</p>

				<div
					class="rounded-md bg-background border border-border/50 p-3 font-mono text-[11px] space-y-1.5"
				>
					<div
						class="flex justify-between items-center"
					>
						<span
							class="text-muted-foreground"
						>
							OpenVINO Runtime
						</span>
						<span>
							<span
								class="text-muted-foreground"
								>2024.4.0</span
							>
							<span
								class="text-primary ml-1.5"
								>→ 2025.1.0</span
							>
						</span>
					</div>
					<div
						class="flex justify-between items-center"
					>
						<span
							class="text-muted-foreground"
						>
							Intel GPU Driver
						</span>
						<span
							class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
						>
							<CheckCircle2
								class="w-3 h-3"
							/>
							Up to date
						</span>
					</div>
					<div
						class="flex justify-between items-center"
					>
						<span
							class="text-muted-foreground"
						>
							Intel NPU Driver
						</span>
						<span class="text-amber-500">
							Update Recommended
						</span>
					</div>
				</div>

				<Button class="w-full gap-2 h-9">
					<Download class="w-4 h-4" />
					Update Intel Software Stack
				</Button>
			</div>
		</div>
	{:else}
		<!-- Remote settings -->
		<div class="space-y-3">
			<div
				class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
			>
				Remote Connection
			</div>
			<div
				class="rounded-lg bg-muted/20 border border-border/50 p-4 space-y-4"
			>
				<div class="space-y-1.5">
					<Label
						for="remote-url"
						class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
					>
						Endpoint URL
					</Label>
					<Input
						id="remote-url"
						bind:value={
							appState.settings
								.remoteEndpoint
						}
						placeholder="http://192.168.1.100:8000"
						class="h-9 bg-background font-mono text-xs"
					/>
				</div>
				<div class="space-y-1.5">
					<Label
						for="remote-key"
						class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
					>
						API Key
					</Label>
					<Input
						id="remote-key"
						type="password"
						bind:value={
							appState.settings.apiKey
						}
						class="h-9 bg-background font-mono text-xs"
					/>
				</div>
				<Button
					class="w-full h-9 gap-2"
					variant="outline"
					onclick={testConnection}
				>
					{#if connectionStatus === "testing"}
						<Loader2
							class="w-4 h-4 animate-spin text-amber-500"
						/>
						Testing...
					{:else if connectionStatus === "success"}
						<CheckCircle2
							class="w-4 h-4 text-emerald-500"
						/>
						Connected
					{:else}
						<Activity class="w-4 h-4" />
						Test Connection
					{/if}
				</Button>

				{#if connectionStatus === "success"}
					<div
						class="flex items-start gap-2 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-md border border-emerald-500/20"
					>
						<CheckCircle2
							class="w-3.5 h-3.5 shrink-0 mt-0.5"
						/>
						<span class="break-words"
							>{connectionMessage}</span
						>
					</div>
				{:else if connectionStatus === "error"}
					<div
						class="flex items-start gap-2 text-[11px] text-destructive bg-destructive/10 px-3 py-2 rounded-md border border-destructive/20 break-all"
					>
						<AlertCircle
							class="w-3.5 h-3.5 shrink-0 mt-0.5"
						/>
						<span>{connectionMessage}</span>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>