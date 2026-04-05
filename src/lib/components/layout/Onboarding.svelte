<script lang="ts">
    import { onMount } from "svelte";
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { appState } from "$lib/state.svelte.js";
    import { openarc } from "$lib/client.svelte.js";
    import { Server, Cpu, ArrowRight, Loader2, CheckCircle2, ChevronRight, Zap } from "@lucide/svelte";
    import { cn } from "$lib/utils";

    let step = $state(1);
    
    let connectionType = $state<"remote" | "local">("remote");
    let hostUrl = $state(appState.settings.remoteEndpoint);
    let apiKey = $state(appState.settings.apiKey);
    let isConnecting = $state(false);
    let connectionError = $state<string | null>(null);

    onMount(() => {
        appState.addLog('info', 'Onboarding component initialized');
    });

    async function handleConnect() {
        if (!hostUrl) return;
        
        isConnecting = true;
        connectionError = null;
        appState.addLog('v1', 'Starting connection to server', hostUrl);
        
        try {
            await openarc.configure(hostUrl, apiKey);
            
            if (openarc.status) {
                appState.settings.remoteEndpoint = hostUrl;
                appState.settings.apiKey = apiKey;
                appState.settings.runtimeMode = connectionType;
                appState.hasCompletedSetup = true;
                appState.saveSettings();
                appState.addLog('info', 'Successfully connected to server');
            } else {
                connectionError = openarc.error || "Failed to get a valid response from the server.";
                appState.addLog('error', 'Failed to connect: invalid response', connectionError);
            }
        } catch (err: any) {
            connectionError = err.toString();
            appState.addLog('error', 'Exception during connection', connectionError!);
        } finally {
            isConnecting = false;
        }
    }

    const nextStep = () => {
        appState.addLog('v2', 'Navigating to next step', `To step ${step + 1}`);
        step++;
    };
    const prevStep = () => {
        appState.addLog('v2', 'Navigating to previous step', `To step ${step - 1}`);
        step--;
    };

    const finishSetup = async () => {
        appState.hasCompletedSetup = true;
        appState.addLog('v1', 'Completed onboarding setup');
        await appState.saveSettings();
    };
</script>

<div class="flex-1 flex items-center justify-center relative overflow-hidden bg-background">
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] opacity-20 pointer-events-none">
        <div class="absolute inset-0 bg-primary/30 blur-[120px] rounded-full mix-blend-screen animate-pulse duration-[4000ms]"></div>
        <div class="absolute top-1/4 right-1/4 w-96 h-96 bg-blue-500/20 blur-[100px] rounded-full mix-blend-screen animate-pulse duration-[5000ms]"></div>
    </div>

    <div class="relative w-full max-w-3xl min-h-[500px] flex flex-col items-center justify-center p-8 z-10">
        
        {#if step === 1}
            <div class="flex flex-col items-center text-center max-w-xl animate-in fade-in zoom-in duration-700">
                <div class="w-20 h-20 bg-gradient-to-br from-primary to-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-primary/20 mb-8 border border-primary/20">
                    <Zap class="w-10 h-10 text-primary-foreground" />
                </div>
                <h1 class="text-4xl font-extrabold tracking-tight mb-4">Welcome to OpenArc Studio</h1>
                <p class="text-lg text-muted-foreground mb-10 leading-relaxed">
                    The unified desktop interface for managing OpenVINO-powered AI inference. Connect to your active server or configure a local deployment.
                </p>
                <Button size="lg" class="h-12 px-8 text-base font-semibold gap-2 rounded-full shadow-lg shadow-primary/20" onclick={nextStep}>
                    Get Started <ArrowRight class="w-5 h-5" />
                </Button>
            </div>
            
        {:else if step === 2}
            <div class="w-full max-w-2xl animate-in slide-in-from-right-8 fade-in duration-500">
                <div class="text-center mb-10">
                    <h2 class="text-3xl font-bold tracking-tight mb-2">Choose Connection Type</h2>
                    <p class="text-muted-foreground">Select how you want to connect to OpenArc.</p>
                </div>
                
                <div class="grid grid-cols-2 gap-6 mb-10">
                    <button 
                        class={cn("relative flex flex-col p-6 rounded-xl border-2 text-left transition-all duration-200", 
                            connectionType === "remote" ? "border-primary bg-primary/5 shadow-md shadow-primary/10" : "border-border/50 hover:border-border hover:bg-muted/30")}
                        onclick={() => connectionType = "remote"}
                    >
                        <div class="mb-4 p-3 bg-primary/10 w-fit rounded-lg">
                            <Server class="w-6 h-6 text-primary" />
                        </div>
                        <h3 class="text-lg font-semibold mb-2">Remote Server</h3>
                        <p class="text-sm text-muted-foreground leading-relaxed">Connect to an existing OpenArc instance running anywhere on your network or internet.</p>
                        {#if connectionType === "remote"}
                            <div class="absolute top-4 right-4 text-primary"><CheckCircle2 class="w-5 h-5" /></div>
                        {/if}
                    </button>
                    
                    <button 
                        class={cn("relative flex flex-col p-6 rounded-xl border-2 text-left transition-all duration-200 opacity-60", 
                            connectionType === "local" ? "border-primary bg-primary/5 shadow-md shadow-primary/10" : "border-border/50")}
                        disabled
                    >
                        <div class="mb-4 p-3 bg-muted w-fit rounded-lg">
                            <Cpu class="w-6 h-6 text-muted-foreground" />
                        </div>
                        <h3 class="text-lg font-semibold mb-2">Local Deployment</h3>
                        <p class="text-sm text-muted-foreground leading-relaxed">Run OpenArc directly on this machine as a background process.</p>
                        <span class="mt-4 text-xs font-semibold text-primary uppercase tracking-widest">Coming Soon</span>
                    </button>
                </div>
                
                <div class="flex justify-between items-center px-2">
                    <Button variant="ghost" onclick={prevStep}>Back</Button>
                    <Button size="lg" class="px-8" onclick={nextStep}>Continue</Button>
                </div>
            </div>
            
        {:else if step === 3}
            <div class="w-full max-w-md animate-in slide-in-from-right-8 fade-in duration-500">
                <div class="text-center mb-8">
                    <div class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Server class="w-6 h-6 text-primary" />
                    </div>
                    <h2 class="text-2xl font-bold tracking-tight mb-2">Configure Remote</h2>
                    <p class="text-muted-foreground text-sm">Enter the connection details for your OpenArc server.</p>
                </div>
                
                <div class="space-y-5 bg-card border rounded-xl p-6 shadow-sm mb-8 relative">
                    {#if connectionError}
                        <div class="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md mb-4 text-center">
                            {connectionError}
                        </div>
                    {/if}
                    
                    <div class="space-y-2">
                        <label for="host" class="text-sm font-semibold">Host URL</label>
                        <Input id="host" bind:value={hostUrl} placeholder="http://192.168.1.100:8000" class="h-11 font-mono text-sm bg-background" />
                    </div>
                    <div class="space-y-2">
                        <label for="api-key" class="text-sm font-semibold">API Key</label>
                        <Input id="api-key" type="password" bind:value={apiKey} placeholder="Enter your API Key" class="h-11 font-mono text-sm bg-background" />
                    </div>
                </div>
                
                <div class="flex justify-between items-center">
                    <Button variant="ghost" onclick={prevStep} disabled={isConnecting}>Back</Button>
                    <Button size="lg" class="px-8" onclick={handleConnect} disabled={isConnecting}>
                        {#if isConnecting}
                            <Loader2 class="w-4 h-4 mr-2 animate-spin" /> Connecting...
                        {:else}
                            Test & Connect
                        {/if}
                    </Button>
                </div>
            </div>
            
        {:else if step === 4}
            <div class="flex flex-col items-center text-center max-w-md animate-in zoom-in-95 fade-in duration-500">
                <div class="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 class="w-10 h-10 text-emerald-500" />
                </div>
                <h2 class="text-3xl font-bold tracking-tight mb-3">Connection Established!</h2>
                <p class="text-muted-foreground mb-8">
                    Successfully connected to OpenArc Server 
                    {#if openarc.version}
                        <span class="font-semibold text-foreground">({openarc.version.version})</span>
                    {/if}.
                    You are now ready to load models and manage your AI workflows.
                </p>
                <Button size="lg" class="w-full h-12 text-base font-semibold" onclick={finishSetup}>
                    Enter OpenArc Studio
                </Button>
            </div>
        {/if}
        
    </div>
    
    <div class="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2">
        {#each [1, 2, 3, 4] as s}
            <div class={cn("h-1.5 rounded-full transition-all duration-300", 
                step === s ? "w-8 bg-primary" : "w-2 bg-muted-foreground/30",
                step > s ? "bg-primary/50 w-2" : "")}>
            </div>
        {/each}
    </div>
</div>
