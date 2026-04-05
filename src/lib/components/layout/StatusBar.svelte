<script lang="ts">
  import { Circle, AlertCircle } from "@lucide/svelte";
  import { openarc } from "$lib/client.svelte.js";
  import { appState } from "$lib/state.svelte.js";
  import { onMount } from "svelte";

  onMount(() => {
    appState.addLog('info', 'StatusBar component initialized');
  });

  let lastState = $state('');
  
  $effect(() => {
    let currentState = 'disconnected';
    if (openarc.status && !openarc.error) currentState = 'connected';
    else if (openarc.loading) currentState = 'connecting';

    if (currentState !== lastState) {
        if (lastState !== '') {
            appState.addLog('v1', `OpenArc connection status changed to: ${currentState}`);
        }
        lastState = currentState;
    }
  });
</script>

<footer
  class="h-8 border-t flex items-center justify-between px-4 text-xs text-muted-foreground bg-background shrink-0 z-50 relative"
>
  <div class="flex items-center gap-2">
    <span>OpenArc Studio v0.1.0</span>
  </div>
  <div class="flex items-center gap-4">
    {#if openarc.status && !openarc.error}
      <div class="flex items-center gap-1.5 font-medium text-emerald-500">
        <div class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </div>
        Connected
      </div>
      {#if openarc.version?.version}
        <div class="h-3 w-px bg-border"></div>
        <span class="font-medium text-foreground">OpenArc {openarc.version.version}</span>
      {/if}
    {:else if openarc.loading}
      <div class="flex items-center gap-1.5 font-medium text-amber-500">
        <div class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </div>
        Connecting...
      </div>
    {:else}
      <div class="flex items-center gap-1.5 font-medium text-destructive">
        <AlertCircle class="w-3.5 h-3.5" />
        Disconnected
      </div>
    {/if}
  </div>
</footer>
