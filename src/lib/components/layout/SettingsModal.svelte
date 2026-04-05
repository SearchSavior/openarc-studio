<script lang="ts">
    import * as Dialog from "$lib/components/ui/dialog";
    import { Input } from "$lib/components/ui/input";
    import { Button } from "$lib/components/ui/button";
    import { Switch } from "$lib/components/ui/switch";
    import { Label } from "$lib/components/ui/label";
    import { Select } from "bits-ui"; 
    import { ScrollArea } from "$lib/components/ui/scroll-area";
    import { appState } from "$lib/state.svelte.js";
    import { openarc } from "$lib/client.svelte.js";
    import { Settings, Palette, Cpu, Server, Activity, Laptop, Database, Info, HardDrive, Download, Loader2, AlertCircle, CheckCircle2 } from "@lucide/svelte";
    import { setMode, resetMode, mode } from "mode-watcher";

    type Tab = "general" | "appearance" | "runtime" | "hardware" | "logs";
    let activeTab = $state<Tab>("general");

    const tabs = [
        { id: "general", label: "General", icon: Settings },
        { id: "appearance", label: "Appearance", icon: Palette },
        { id: "runtime", label: "Runtime", icon: Server },
        { id: "hardware", label: "Hardware", icon: Cpu },
        { id: "logs", label: "System Logs", icon: Activity }
    ] as const;

    let openarcVersion = $state("v1.2.0");
    let connectionStatus = $state<"idle" | "testing" | "success" | "error">("idle");
    let connectionMessage = $state("");

    let logVerbosity = $state(2);
    const logLevelMap: Record<string, number> = {
        'error': 0, 'warn': 1, 'info': 2, 'v1': 3, 'v2': 4, 'v3': 5, 'v4': 6
    };

    $effect(() => {
        // track settings deep for reactivity
        JSON.stringify(appState.settings);
        
        if (appState.settingsOpen) {
            appState.saveSettings();
        }
    });

    async function testConnection() {
        connectionStatus = "testing";
        await openarc.configure(appState.settings.remoteEndpoint, appState.settings.apiKey);
        if (openarc.status && !openarc.error) {
            connectionStatus = "success";
            connectionMessage = "Connected successfully to OpenArc Server.";
        } else {
            connectionStatus = "error";
            connectionMessage = openarc.error || "Failed to get a valid response from the server.";
        }
    }
</script>

<Dialog.Root bind:open={appState.settingsOpen}>
    <Dialog.Content class="sm:max-w-[900px] h-[75vh] p-0 flex flex-row overflow-hidden gap-0 bg-background border shadow-xl">
        <Dialog.Title class="sr-only">Settings</Dialog.Title>
        <Dialog.Description class="sr-only">Configure OpenArc Studio preferences, appearance, runtime, and hardware.</Dialog.Description>

        <div class="w-[240px] flex flex-col border-r bg-muted/10 h-full shrink-0">
            <div class="p-6 pb-2">
                <h2 class="text-lg font-bold tracking-tight">Settings</h2>
            </div>
            <div class="p-3 space-y-1">
                {#each tabs as tab}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div 
                        class="flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors text-sm font-medium
                            {activeTab === tab.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
                        onclick={() => activeTab = tab.id}
                    >
                        <tab.icon class="w-4 h-4 {activeTab === tab.id ? 'text-primary' : 'opacity-70'}" />
                        {tab.label}
                    </div>
                {/each}
            </div>
        </div>

        <div class="flex-1 flex flex-col h-full bg-background overflow-hidden">
            <ScrollArea class="h-full">
                <div class="p-8 max-w-3xl">
                    
                    {#if activeTab === "general"}
                        <div class="space-y-6">
                            <div>
                                <h3 class="text-lg font-semibold mb-1">General Settings</h3>
                                <p class="text-sm text-muted-foreground mb-6">Manage global application behaviors and paths.</p>
                            </div>

                            <div class="space-y-4">
                                <div class="grid gap-2">
                                    <Label for="model-path">Default Model Download Path</Label>
                                    <div class="flex gap-2">
                                        <Input id="model-path" bind:value={appState.settings.defaultModelPath} readonly class="bg-muted/50 font-mono text-sm" />
                                        <Button variant="secondary">Browse</Button>
                                    </div>
                                    <p class="text-[13px] text-muted-foreground">Where OpenArc Studio will download and store models.</p>
                                </div>
                                
                                <div class="pt-4 border-t border-border"></div>

                                <div class="flex items-center justify-between">
                                    <div class="space-y-0.5">
                                        <Label for="start-boot">Start on System Boot</Label>
                                        <p class="text-[13px] text-muted-foreground">Launch OpenArc Studio automatically when you log in.</p>
                                    </div>
                                    <Switch id="start-boot" bind:checked={appState.settings.startOnBoot} />
                                </div>

                                <div class="flex items-center justify-between">
                                    <div class="space-y-0.5">
                                        <Label for="auto-update">Automatic Updates</Label>
                                        <p class="text-[13px] text-muted-foreground">Download and install updates in the background.</p>
                                    </div>
                                    <Switch id="auto-update" bind:checked={appState.settings.autoUpdate} />
                                </div>
                            </div>
                        </div>

                    {:else if activeTab === "appearance"}
                        <div class="space-y-6">
                            <div>
                                <h3 class="text-lg font-semibold mb-1">Appearance</h3>
                                <p class="text-sm text-muted-foreground mb-6">Customize how OpenArc Studio looks and feels.</p>
                            </div>

                            <div class="space-y-6">
                                <div class="space-y-3">
                                    <Label>Theme Preferences</Label>
                                    <div class="grid grid-cols-3 gap-3">
                                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                                        <div 
                                            class="border rounded-md p-4 flex flex-col items-center gap-2 cursor-pointer transition-all {mode.current === 'dark' ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/50'}"
                                            onclick={() => setMode('dark')}
                                        >
                                            <div class="w-10 h-10 rounded-full bg-slate-900 border flex items-center justify-center">
                                                <div class="w-5 h-5 rounded-full bg-slate-800"></div>
                                            </div>
                                            <span class="text-xs font-medium">Dark Mode</span>
                                        </div>
                                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                                        <div 
                                            class="border rounded-md p-4 flex flex-col items-center gap-2 cursor-pointer transition-all {mode.current === 'light' ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/50'}"
                                            onclick={() => setMode('light')}
                                        >
                                            <div class="w-10 h-10 rounded-full bg-slate-100 border flex items-center justify-center">
                                                <div class="w-5 h-5 rounded-full bg-white border"></div>
                                            </div>
                                            <span class="text-xs font-medium">Light Mode</span>
                                        </div>
                                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                                        <div 
                                            class="border rounded-md p-4 flex flex-col items-center gap-2 cursor-pointer transition-all {mode.current === undefined ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/50'}"
                                            onclick={() => resetMode()}
                                        >
                                            <div class="w-10 h-10 rounded-full bg-gradient-to-r from-slate-100 to-slate-900 border flex items-center justify-center"></div>
                                            <span class="text-xs font-medium">System Sync</span>
                                        </div>
                                    </div>
                                </div>

                                <div class="pt-4 border-t border-border"></div>

                                <div class="flex items-center justify-between">
                                    <div class="space-y-0.5">
                                        <Label for="compact-mode">Compact Chat Mode</Label>
                                        <p class="text-[13px] text-muted-foreground">Decrease padding and spacing in the chat interface.</p>
                                    </div>
                                    <Switch id="compact-mode" bind:checked={appState.settings.compactMode} />
                                </div>
                            </div>
                        </div>

                    {:else if activeTab === "runtime"}
                        <div class="space-y-6">
                            <div>
                                <h3 class="text-lg font-semibold mb-1">Runtime Configuration</h3>
                                <p class="text-sm text-muted-foreground mb-6">Choose how OpenArc Studio connects to the inference engine.</p>
                            </div>

                            <div class="grid grid-cols-2 gap-4 mb-6">
                                <!-- svelte-ignore a11y_click_events_have_key_events -->
                                <!-- svelte-ignore a11y_no_static_element_interactions -->
                                <div 
                                    class="border rounded-lg p-4 cursor-pointer transition-all {appState.settings.runtimeMode === 'local' ? 'border-primary ring-1 ring-primary bg-primary/5' : 'hover:bg-muted/50'}"
                                    onclick={() => appState.settings.runtimeMode = 'local'}
                                >
                                    <div class="flex items-center gap-2 mb-2">
                                        <Laptop class="w-5 h-5 {appState.settings.runtimeMode === 'local' ? 'text-primary' : 'text-muted-foreground'}" />
                                        <h4 class="font-medium">Local Server</h4>
                                    </div>
                                    <p class="text-xs text-muted-foreground">OpenArc Studio manages the inference server locally on your machine.</p>
                                </div>

                                <!-- svelte-ignore a11y_click_events_have_key_events -->
                                <!-- svelte-ignore a11y_no_static_element_interactions -->
                                <div 
                                    class="border rounded-lg p-4 cursor-pointer transition-all {appState.settings.runtimeMode === 'remote' ? 'border-primary ring-1 ring-primary bg-primary/5' : 'hover:bg-muted/50'}"
                                    onclick={() => appState.settings.runtimeMode = 'remote'}
                                >
                                    <div class="flex items-center gap-2 mb-2">
                                        <Server class="w-5 h-5 {appState.settings.runtimeMode === 'remote' ? 'text-primary' : 'text-muted-foreground'}" />
                                        <h4 class="font-medium">Remote Server</h4>
                                    </div>
                                    <p class="text-xs text-muted-foreground">Connect to an existing OpenArc server running elsewhere.</p>
                                </div>
                            </div>

                            <div class="bg-muted/30 border rounded-lg p-5">
                                {#if appState.settings.runtimeMode === "local"}
                                    <div class="space-y-6">
                                        <div class="space-y-4">
                                            <h4 class="font-medium text-sm border-b pb-2">Local OpenArc Settings</h4>
                                            <div class="grid gap-2">
                                                <Label for="openarc-version">OpenArc Engine Version</Label>
                                                <div class="flex gap-2">
                                                    <select 
                                                        id="openarc-version" 
                                                        class="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
                                                        bind:value={openarcVersion}
                                                    >
                                                        <option value="v1.2.0">v1.2.0 (Latest)</option>
                                                        <option value="v1.1.5">v1.1.5 (Stable)</option>
                                                        <option value="nightly">Nightly Build</option>
                                                    </select>
                                                    <Button variant="secondary">Update Engine</Button>
                                                </div>
                                                <p class="text-[13px] text-muted-foreground">Select the version of the OpenArc engine to use.</p>
                                            </div>
                                        </div>

                                        <div class="space-y-4">
                                            <div class="flex items-center justify-between border-b pb-2">
                                                <h4 class="font-medium text-sm">Intel® Software Stack</h4>
                                                <div class="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                                    Update Available
                                                </div>
                                            </div>
                                            <div class="grid gap-3">
                                                <div class="flex flex-col gap-1.5">
                                                    <p class="text-sm text-foreground">Ensure optimal performance and compatibility for OpenVINO execution across your CPU, GPU, and NPU.</p>
                                                    <p class="text-[13px] text-muted-foreground">This updates compute runtimes, GPU drivers (Intel Arc / iGPU), and NPU drivers to the latest validated versions for OpenArc.</p>
                                                </div>
                                                
                                                <div class="border rounded-md bg-background/50 p-3 text-sm space-y-2 font-mono">
                                                    <div class="flex justify-between items-center">
                                                        <span class="text-muted-foreground">OpenVINO Runtime:</span>
                                                        <span class="text-foreground">2024.4.0 <span class="text-primary ml-2">→ 2025.1.0</span></span>
                                                    </div>
                                                    <div class="flex justify-between items-center">
                                                        <span class="text-muted-foreground">Intel GPU Driver:</span>
                                                        <span class="text-foreground">Up to date</span>
                                                    </div>
                                                    <div class="flex justify-between items-center">
                                                        <span class="text-muted-foreground">Intel NPU Driver:</span>
                                                        <span class="text-foreground text-yellow-500">Update Recommended</span>
                                                    </div>
                                                </div>

                                                <Button class="w-full gap-2 mt-1">
                                                    <Download class="w-4 h-4" />
                                                    Update Intel Software Stack
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                {:else}
                                    <div class="space-y-4">
                                        <h4 class="font-medium text-sm border-b pb-2">Remote Connection Settings</h4>
                                        <div class="grid gap-2">
                                            <Label for="remote-url">Endpoint URL</Label>
                                            <Input id="remote-url" bind:value={appState.settings.remoteEndpoint} placeholder="http://192.168.1.100:8000" />
                                        </div>
                                        <div class="grid gap-2">
                                            <Label for="remote-key">API Key</Label>
                                            <Input id="remote-key" type="password" bind:value={appState.settings.apiKey} />
                                        </div>
                                        <Button class="w-full mt-2" variant="secondary" onclick={testConnection}>
                                            {#if connectionStatus === 'testing'}
                                                <Loader2 class="w-4 h-4 mr-2 animate-spin" /> Testing...
                                            {:else}
                                                Test Connection
                                            {/if}
                                        </Button>

                                        {#if connectionStatus === 'success'}
                                            <div class="flex items-center gap-2 mt-2 text-sm text-emerald-500 bg-emerald-500/10 p-2 rounded-md">
                                                <CheckCircle2 class="w-4 h-4" /> {connectionMessage}
                                            </div>
                                        {:else if connectionStatus === 'error'}
                                            <div class="flex items-center gap-2 mt-2 text-sm text-destructive bg-destructive/10 p-2 rounded-md break-all">
                                                <AlertCircle class="w-4 h-4 shrink-0" /> {connectionMessage}
                                            </div>
                                        {/if}
                                    </div>
                                {/if}
                            </div>
                        </div>

                    {:else if activeTab === "hardware"}
                        <div class="space-y-6">
                            <div>
                                <h3 class="text-lg font-semibold mb-1">Hardware Information</h3>
                                <p class="text-sm text-muted-foreground mb-6">System capabilities and real-time resource monitor.</p>
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                {#if openarc.metrics?.cpus?.[0]}
                                    {@const cpu = openarc.metrics.cpus[0]}
                                    <div class="border rounded-lg p-4 bg-card shadow-sm">
                                        <div class="flex items-center gap-2 text-muted-foreground mb-3">
                                            <Cpu class="w-4 h-4" />
                                            <h4 class="text-sm font-medium text-foreground">Processor</h4>
                                        </div>
                                        <div class="font-semibold text-[15px] truncate" title={cpu.name}>{cpu.name}</div>
                                        <div class="text-xs text-muted-foreground mt-1">{cpu.cores} Cores / {cpu.threads} Threads</div>
                                        <div class="mt-2 flex items-center justify-between w-full">
                                            <div class="w-full bg-muted rounded-full h-1.5 mr-3">
                                                <div class="bg-emerald-500 h-1.5 rounded-full transition-all duration-300" style="width: {cpu.usage}%"></div>
                                            </div>
                                            <div class="text-[10px] text-muted-foreground whitespace-nowrap">{cpu.usage.toFixed(1)}% Use</div>
                                        </div>
                                    </div>
                                {:else}
                                    <div class="border rounded-lg p-4 bg-card shadow-sm">
                                        <div class="flex items-center gap-2 text-muted-foreground mb-3">
                                            <Cpu class="w-4 h-4" />
                                            <h4 class="text-sm font-medium text-foreground">Processor</h4>
                                        </div>
                                        <div class="font-semibold text-[15px]">Intel® Core™ Ultra</div>
                                        <div class="mt-2 flex items-center gap-1.5 text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded w-fit border border-emerald-500/20">
                                            OpenVINO Compatible
                                        </div>
                                    </div>
                                {/if}
                                
                                <div class="border rounded-lg p-4 bg-card shadow-sm">
                                    <div class="flex items-center gap-2 text-muted-foreground mb-3">
                                        <Database class="w-4 h-4" />
                                        <h4 class="text-sm font-medium text-foreground">System Memory</h4>
                                    </div>
                                    {#if openarc.metrics}
                                        {@const usedGb = (openarc.metrics.used_ram / 1024).toFixed(1)}
                                        {@const totalGb = (openarc.metrics.total_ram / 1024).toFixed(1)}
                                        {@const pct = (openarc.metrics.used_ram / openarc.metrics.total_ram) * 100}
                                        <div class="font-semibold text-[15px]">{totalGb} GB Total RAM</div>
                                        <div class="mt-2 flex items-center justify-between w-full">
                                            <div class="w-full bg-muted rounded-full h-1.5 mr-3">
                                                <div class="bg-primary h-1.5 rounded-full transition-all duration-300" style="width: {pct}%"></div>
                                            </div>
                                            <div class="text-[10px] text-muted-foreground whitespace-nowrap">{usedGb} GB Used</div>
                                        </div>
                                    {:else}
                                        <div class="font-semibold text-[15px]">32.0 GB Total RAM</div>
                                        <div class="mt-1 text-xs text-muted-foreground">14.2 GB Available</div>
                                    {/if}
                                </div>
                            </div>

                            <div class="space-y-3">
                                <h4 class="text-sm font-semibold border-b pb-2 flex items-center gap-2">
                                    <HardDrive class="w-4 h-4 text-muted-foreground" />
                                    Detected GPUs (OpenVINO Devices)
                                </h4>
                                
                                {#if openarc.metrics?.gpus?.length > 0}
                                    {#each openarc.metrics.gpus as gpu}
                                        {@const usedGb = (gpu.used_vram / 1024).toFixed(1)}
                                        {@const totalGb = (gpu.total_vram / 1024).toFixed(1)}
                                        {@const pct = (gpu.used_vram / gpu.total_vram) * 100}
                                        <div class="border rounded-lg p-4 bg-card shadow-sm space-y-3">
                                            <div class="flex justify-between items-start">
                                                <div>
                                                    <div class="font-semibold text-sm">{gpu.id}: {gpu.name}</div>
                                                    <div class="text-xs text-muted-foreground">Graphics Processing Unit</div>
                                                </div>
                                                <div class="text-xs font-mono bg-muted px-2 py-1 rounded">{totalGb} GB {gpu.is_shared ? 'Shared VRAM' : 'VRAM'}</div>
                                            </div>
                                            <div class="w-full bg-muted rounded-full h-1.5">
                                                <div class="bg-primary h-1.5 rounded-full transition-all duration-300" style="width: {pct}%"></div>
                                            </div>
                                            <div class="text-[10px] text-muted-foreground text-right">{usedGb} GB / {totalGb} GB Used ({gpu.usage.toFixed(1)}% Load)</div>
                                        </div>
                                    {/each}
                                {/if}
                                {#if openarc.metrics?.npus?.length > 0}
                                    {#each openarc.metrics.npus as npu}
                                        <div class="border rounded-lg p-4 bg-card shadow-sm space-y-3">
                                            <div class="flex justify-between items-start">
                                                <div>
                                                    <div class="font-semibold text-sm">{npu.id}: {npu.name}</div>
                                                    <div class="text-xs text-muted-foreground">Neural Processing Unit</div>
                                                </div>
                                                <div class="text-xs font-mono bg-muted px-2 py-1 rounded">Dedicated AI</div>
                                            </div>
                                        </div>
                                    {/each}
                                {/if}
                                {#if (!openarc.metrics?.gpus?.length && !openarc.metrics?.npus?.length)}
                                    <div class="border rounded-lg p-4 bg-card shadow-sm space-y-3">
                                        <div class="flex justify-between items-start">
                                            <div>
                                                <div class="font-semibold text-sm">GPU.0: Intel® Arc™ Graphics</div>
                                                <div class="text-xs text-muted-foreground">Integrated GPU</div>
                                            </div>
                                            <div class="text-xs font-mono bg-muted px-2 py-1 rounded">16.0 GB Shared VRAM</div>
                                        </div>
                                        <div class="w-full bg-muted rounded-full h-1.5">
                                            <div class="bg-primary h-1.5 rounded-full" style="width: 15%"></div>
                                        </div>
                                        <div class="text-[10px] text-muted-foreground text-right">2.4 GB / 16.0 GB Used</div>
                                    </div>
                                    
                                    <div class="border rounded-lg p-4 bg-card shadow-sm space-y-3">
                                        <div class="flex justify-between items-start">
                                            <div>
                                                <div class="font-semibold text-sm">NPU: Intel® AI Boost</div>
                                                <div class="text-xs text-muted-foreground">Neural Processing Unit</div>
                                            </div>
                                            <div class="text-xs font-mono bg-muted px-2 py-1 rounded">Dedicated AI</div>
                                        </div>
                                        <div class="w-full bg-muted rounded-full h-1.5">
                                            <div class="bg-blue-500 h-1.5 rounded-full" style="width: 5%"></div>
                                        </div>
                                        <div class="text-[10px] text-muted-foreground text-right">Idle</div>
                                    </div>
                                {/if}
                            </div>

                            <div class="space-y-3 mt-8">
                                <h4 class="text-sm font-semibold border-b pb-2 flex items-center gap-2">
                                    <Activity class="w-4 h-4 text-muted-foreground" />
                                    Resource Monitor
                                </h4>
                                <div class="border rounded-lg p-6 bg-card shadow-sm h-[180px] flex items-center justify-center flex-col text-muted-foreground">
                                    <Activity class="w-8 h-8 mb-2 opacity-20" />
                                    <span class="text-sm font-medium">Real-time telemetry</span>
                                    <span class="text-xs">Waiting for Tauri backend to connect...</span>
                                </div>
                            </div>
                        </div>
                    {:else if activeTab === 'logs'}
                        <div class="space-y-4 animate-in fade-in-50 duration-200 h-full flex flex-col">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h3 class="text-lg font-semibold mb-1">System Logs</h3>
                                    <p class="text-sm text-muted-foreground">Application events, verbose tracing, and error tracking.</p>
                                </div>
                                <div class="flex items-center gap-2">
                                    <select 
                                        bind:value={logVerbosity} 
                                        class="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                    >
                                        <option value={0}>Errors Only</option>
                                        <option value={1}>Warnings & Errors</option>
                                        <option value={2}>Info & Above (Default)</option>
                                        <option value={3}>Verbose 1 (Major Steps)</option>
                                        <option value={4}>Verbose 2 (Minor Steps)</option>
                                        <option value={5}>Verbose 3 (Tracing)</option>
                                        <option value={6}>Verbose 4 (Raw Data)</option>
                                    </select>
                                    <Button variant="outline" size="sm" class="h-8 gap-2" onclick={() => appState.clearLogs()}>
                                        Clear Logs
                                    </Button>
                                </div>
                            </div>
                            
                            <div class="border rounded-md bg-muted/20 flex-1 flex flex-col min-h-[400px]">
                                <ScrollArea class="flex-1">
                                    {@const filteredLogs = appState.logs.filter(l => (logLevelMap[l.level] ?? 2) <= logVerbosity)}
                                    {#if filteredLogs.length === 0}
                                        <div class="h-full flex items-center justify-center text-muted-foreground text-sm py-12">
                                            No logs match the current filter.
                                        </div>
                                    {:else}
                                        <div class="p-2 space-y-1 font-mono text-[11px] leading-tight">
                                            {#each filteredLogs as log}
                                                <div class="flex items-start gap-2 p-1.5 rounded hover:bg-muted/50 border border-transparent {log.level === 'error' ? 'bg-destructive/5 text-destructive border-destructive/10' : log.level === 'warn' ? 'text-amber-500' : log.level === 'info' ? 'text-foreground' : 'text-muted-foreground'}">
                                                    <span class="shrink-0 opacity-50 whitespace-nowrap">
                                                        {log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                    </span>
                                                    <span class="shrink-0 font-bold uppercase w-10">
                                                        {log.level}
                                                    </span>
                                                    <div class="flex-1 flex flex-col gap-1 min-w-0">
                                                        <span class="break-words font-medium">{log.message}</span>
                                                        {#if log.details}
                                                            <span class="break-words opacity-80 whitespace-pre-wrap">{log.details}</span>
                                                        {/if}
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                    {/if}
                                </ScrollArea>
                            </div>
                        </div>
                    {/if}
                    
                </div>
            </ScrollArea>
            
            <div class="p-4 border-t bg-muted/5 flex items-center justify-between shrink-0">
                <div class="flex items-center gap-2 text-xs text-muted-foreground">
                    <Info class="w-4 h-4" /> Changes are saved automatically.
                </div>
                <Button variant="default" onclick={() => appState.settingsOpen = false}>Done</Button>
            </div>
        </div>
    </Dialog.Content>
</Dialog.Root>