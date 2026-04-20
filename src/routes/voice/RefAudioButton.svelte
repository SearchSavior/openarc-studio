<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { appState } from "$lib/state.svelte.js";
    import { cn } from "$lib/utils.js";
    import { Play, Square, Loader2 } from "@lucide/svelte";

    let {
        filePath,
        disabled = false,
        class: className,
    }: {
        filePath: string | undefined;
        disabled?: boolean;
        class?: string;
    } = $props();

    let audioEl = $state<HTMLAudioElement | null>(null);
    let isPlaying = $state(false);
    let isLoading = $state(false);
    let blobUrl = $state<string | null>(null);
    let wantPlay = $state(false);

    // attempt playback when conditions align: blob loaded, element mounted,
    // readyState >= 2. called from multiple sites so first one to see it wins.
    function tryPlay() {
        if (!wantPlay || !audioEl || !blobUrl) return;
        if (audioEl.readyState < 2) return;
        wantPlay = false;
        const p = audioEl.play();
        if (p && typeof p.catch === "function") {
            p.catch((err: unknown) => {
                const name = (err as { name?: string })?.name;
                if (name !== "AbortError" && name !== "NotAllowedError") {
                    appState.addLog("v3", "Ref audio play failed", String(err));
                }
            });
        }
    }

    async function loadAudio(): Promise<string | null> {
        if (!filePath) return null;
        if (blobUrl) return blobUrl;

        isLoading = true;
        try {
            const b64 = await invoke<string>("read_audio_file", {
                path: filePath,
            });
            const raw = atob(b64);
            const arr = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
            const blob = new Blob([arr], { type: "audio/wav" });
            blobUrl = URL.createObjectURL(blob);
            appState.addLog("v3", "Ref audio blob created", filePath);
            return blobUrl;
        } catch (e) {
            appState.addLog("error", "Failed to load reference audio", String(e));
            return null;
        } finally {
            isLoading = false;
        }
    }

    function stop() {
        if (audioEl) {
            audioEl.pause();
            audioEl.currentTime = 0;
        }
        isPlaying = false;
        wantPlay = false;
    }

    async function toggle(event: MouseEvent) {
        event.stopPropagation();

        if (disabled || !filePath) return;

        if (isLoading) {
            wantPlay = false;
            return;
        }

        if (isPlaying) {
            stop();
            return;
        }

        wantPlay = true;
        const url = await loadAudio();
        if (!url || !wantPlay) return;
        tryPlay();
    }

    // reevaluate when blob is ready or the audio element mounts
    $effect(() => {
        void blobUrl;
        void audioEl;
        tryPlay();
    });

    function onLoadedMetadata() {
        tryPlay();
    }

    function onPlay() {
        isPlaying = true;
    }

    function onEnded() {
        isPlaying = false;
    }

    function onError() {
        isPlaying = false;
        wantPlay = false;
        appState.addLog("error", "Ref audio playback error", filePath ?? "");
    }

    // revoke object url on destroy to avoid memory leak
    $effect(() => {
        const url = blobUrl;
        return () => {
            if (url) URL.revokeObjectURL(url);
        };
    });

    const canPlay = $derived(!!filePath && !disabled);
</script>

<button
    type="button"
    data-slot="ref-audio-button"
    class={cn(
        "inline-flex items-center justify-center rounded-full h-7 w-7 shrink-0 transition-colors",
        canPlay
            ? "text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer"
            : "text-muted-foreground/40 cursor-not-allowed",
        isPlaying && "text-primary hover:text-primary",
        className,
    )}
    disabled={!canPlay}
    onclick={toggle}
    title={isPlaying ? "Stop" : "Play reference audio"}
    aria-label={isPlaying ? "Stop" : "Play reference audio"}
>
    {#if isLoading}
        <Loader2 class="w-3.5 h-3.5 animate-spin" />
    {:else if isPlaying}
        <Square class="w-3 h-3 fill-current" />
    {:else}
        <Play class="w-3.5 h-3.5 fill-current ml-px" />
    {/if}
</button>

{#if blobUrl}
    <audio
        bind:this={audioEl}
        src={blobUrl}
        preload="metadata"
        onloadedmetadata={onLoadedMetadata}
        onplay={onPlay}
        onended={onEnded}
        onerror={onError}
    ></audio>
{/if}
