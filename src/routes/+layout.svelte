<script lang="ts">
    import { ModeWatcher } from "mode-watcher";
    import { onMount } from "svelte";
    import "./layout.css";

    import TopBar from "$lib/components/layout/TopBar.svelte";
    import TitleBar from "$lib/components/layout/TitleBar.svelte";
    import SideNav from "$lib/components/layout/SideNav.svelte";
    import StatusBar from "$lib/components/layout/StatusBar.svelte";
    import ModelDownloaderModal from "$lib/components/layout/ModelDownloaderModal.svelte";
    import SettingsModal from "$lib/components/layout/SettingsModal.svelte";
    import Onboarding from "$lib/components/layout/Onboarding.svelte";
    import { appState } from "$lib/state.svelte.js";
    import { openarc } from "$lib/client.svelte.js";

    let { children } = $props();
    let isInitialized = $state(false);

    onMount(async () => {
        appState.addLog('info', 'Application layout mounted');
        await appState.loadSettings();
        if (appState.hasCompletedSetup) {
            try {
                await openarc.configure(appState.settings.remoteEndpoint, appState.settings.apiKey);
            } catch (e) {
                appState.addLog('error', 'Failed to connect on startup', e instanceof Error ? e.message : String(e));
                console.error("Failed to connect on startup", e);
            }
        }
        isInitialized = true;
    });
</script>

<ModeWatcher defaultMode="dark" />

<div class="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden rounded-lg shadow-2xl border">
    <TitleBar />
    
    {#if isInitialized}
        {#if !appState.hasCompletedSetup}
            <Onboarding />
        {:else}
            <TopBar />

            <div class="flex flex-1 overflow-hidden">
                <SideNav />

                <main class="flex-1 bg-background flex overflow-hidden">
                    {@render children?.()}
                </main>
            </div>

            <StatusBar />
        {/if}
    {/if}
</div>

{#if isInitialized && appState.hasCompletedSetup}
    <ModelDownloaderModal />
    <SettingsModal />
{/if}
