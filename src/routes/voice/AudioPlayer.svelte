<script lang="ts" module>
    export type AudioPlayerProps = {
        src: string | null;
        kind?: "file" | "stream";
        autoplay?: boolean;
        // monotonic counter bumped by parent on explicit user intent (finished
        // synth or recent-generation click). player only autoplays when this
        // increments past the mount value - remounting with existing src never replays.
        playToken?: number;
        class?: string;
        onEnded?: () => void;
    };
</script>

<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { untrack } from "svelte";
    import { Button } from "$lib/components/ui/button";
    import { cn } from "$lib/utils.js";
    import { formatTime } from "$lib/audio";
    import { appState } from "$lib/state.svelte.js";
    import { Play, Pause, Square, ExternalLink } from "@lucide/svelte";

    let {
        src,
        kind = "file",
        autoplay = false,
        playToken = 0,
        class: className,
        onEnded,
    }: AudioPlayerProps = $props();

    let audioEl = $state<HTMLAudioElement | null>(null);
    let isPlaying = $state(false);
    let currentTime = $state(0);
    let duration = $state(0);
    let playbackRate = $state(1);
    let errorMessage = $state<string | null>(null);
    let blobUrl = $state<string | null>(null);

    const speedOptions = [0.5, 1, 1.25, 1.5, 2];

    $effect(() => {
        if (kind === "stream" && src) {
            appState.addLog(
                "warn",
                "AudioPlayer stream mode not implemented",
                "TODO: wire AudioWorklet-based L16 playback for Qwen3-TTS",
            );
            errorMessage = "Streaming playback not implemented yet";
        }
    });

    $effect(() => {
        const filePath = src;
        errorMessage = null;
        currentTime = 0;
        duration = 0;
        isPlaying = false;

        const oldUrl = untrack(() => blobUrl);
        if (oldUrl) {
            URL.revokeObjectURL(oldUrl);
            blobUrl = null;
        }

        if (!filePath || kind !== "file") return;

        let cancelled = false;
        (async () => {
            try {
                const b64 = await invoke<string>("read_audio_file", {
                    path: filePath,
                });
                if (cancelled) return;
                const raw = atob(b64);
                const arr = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
                const blob = new Blob([arr], { type: "audio/wav" });
                blobUrl = URL.createObjectURL(blob);
                appState.addLog("v3", "Audio blob created", filePath);
            } catch (e) {
                if (cancelled) return;
                errorMessage = "Failed to load audio";
                appState.addLog(
                    "error",
                    "Failed to read audio file",
                    String(e),
                );
            }
        })();

        return () => {
            cancelled = true;
        };
    });

    $effect(() => {
        if (audioEl) audioEl.playbackRate = playbackRate;
    });

    let baselinePlayToken = $state<number | null>(null);
    let pendingPlay = $state(false);

    function tryPendingPlay() {
        if (!pendingPlay) return;
        const el = audioEl;
        if (!el || !blobUrl) return;
        if (el.readyState < 2) return;
        pendingPlay = false;
        const p = el.play();
        if (p && typeof p.catch === "function") {
            p.catch((err: unknown) => {
                const name = (err as { name?: string })?.name;
                if (name !== "AbortError" && name !== "NotAllowedError") {
                    appState.addLog("v3", "Autoplay failed", String(err));
                }
            });
        }
    }

    $effect(() => {
        const token = playToken;
        if (baselinePlayToken === null) {
            baselinePlayToken = token;
            return;
        }
        if (token === baselinePlayToken) return;
        baselinePlayToken = token;
        if (!autoplay) return;
        pendingPlay = true;
        tryPendingPlay();
    });

    $effect(() => {
        // reattempt once the blob is ready to play
        void blobUrl;
        tryPendingPlay();
    });

    function togglePlay() {
        if (!audioEl || !blobUrl) return;
        if (audioEl.paused) {
            const p = audioEl.play();
            if (p && typeof p.catch === "function") {
                p.catch((err: unknown) => {
                    const name = (err as { name?: string })?.name;
                    if (name !== "AbortError") {
                        appState.addLog("v3", "Play failed", String(err));
                    }
                });
            }
        } else {
            audioEl.pause();
        }
    }

    function stop() {
        if (!audioEl) return;
        audioEl.pause();
        audioEl.currentTime = 0;
        currentTime = 0;
        isPlaying = false;
    }

    function onSeek(e: Event) {
        const target = e.currentTarget as HTMLInputElement;
        const next = Number(target.value);
        if (audioEl && Number.isFinite(next)) {
            audioEl.currentTime = next;
            currentTime = next;
        }
    }

    async function openInSystem() {
        if (!src) return;
        try {
            const mod = await import("@tauri-apps/plugin-opener");
            await mod.openPath(src);
        } catch (e) {
            appState.addLog("v2", "openPath unavailable", String(e));
        }
    }

    function onLoadedMetadata() {
        if (!audioEl) return;
        duration = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
        tryPendingPlay();
    }

    function onTimeUpdate() {
        if (!audioEl) return;
        currentTime = audioEl.currentTime;
    }

    function onPlay() {
        isPlaying = true;
    }

    function onPause() {
        isPlaying = false;
    }

    function onEndedInternal() {
        isPlaying = false;
        currentTime = 0;
        onEnded?.();
    }

    function onError() {
        errorMessage = "Failed to load audio";
        isPlaying = false;
        currentTime = 0;
        duration = 0;
        appState.addLog("error", "Audio element failed to decode", src ?? "");
    }

    const hasAudio = $derived(!!blobUrl);
    const seekMax = $derived(duration > 0 ? duration : 0);
</script>

<div
    data-slot="audio-player"
    class={cn(
        "p-4 border rounded-lg bg-muted/20 flex items-center gap-4",
        className,
    )}
>
    <Button
        variant="secondary"
        size="icon"
        class="rounded-full h-12 w-12 shrink-0"
        disabled={!hasAudio}
        onclick={togglePlay}
        aria-label={isPlaying ? "Pause" : "Play"}
    >
        {#if isPlaying}
            <Pause class="w-5 h-5" />
        {:else}
            <Play class="w-5 h-5 ml-0.5" />
        {/if}
    </Button>

    <Button
        variant="ghost"
        size="icon"
        class="rounded-full h-9 w-9 shrink-0"
        disabled={!hasAudio}
        onclick={stop}
        aria-label="Stop"
    >
        <Square class="w-4 h-4" />
    </Button>

    <div class="flex-1 min-w-0 space-y-1.5">
        {#if hasAudio}
            <input
                type="range"
                min="0"
                max={seekMax}
                step="0.01"
                value={currentTime}
                oninput={onSeek}
                class="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                aria-label="Seek"
            />
            <div
                class="flex justify-between items-center text-xs text-muted-foreground font-mono gap-3"
            >
                <span>{formatTime(currentTime)}</span>
                {#if errorMessage}
                    <span class="text-destructive font-sans truncate">
                        {errorMessage}
                    </span>
                {/if}
                <span class="flex items-center gap-2">
                    <select
                        class="bg-transparent border border-input rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                        bind:value={playbackRate}
                        aria-label="Playback speed"
                    >
                        {#each speedOptions as opt (opt)}
                            <option value={opt}>{opt}x</option>
                        {/each}
                    </select>
                    <button
                        type="button"
                        class="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                        onclick={openInSystem}
                        aria-label="Open in system player"
                        title="Open in system player"
                    >
                        <ExternalLink class="w-3.5 h-3.5" />
                    </button>
                    <span>{formatTime(duration)}</span>
                </span>
            </div>
        {:else}
            <div class="h-2 bg-muted rounded-full overflow-hidden">
                <div class="h-full bg-primary/30 w-0"></div>
            </div>
            <div
                class="flex justify-between text-xs text-muted-foreground font-mono"
            >
                <span>No audio yet</span>
                <span>0:00</span>
            </div>
        {/if}
    </div>

    {#if blobUrl}
        <audio
            bind:this={audioEl}
            src={blobUrl}
            preload="metadata"
            onloadedmetadata={onLoadedMetadata}
            ontimeupdate={onTimeUpdate}
            onplay={onPlay}
            onpause={onPause}
            onended={onEndedInternal}
            onerror={onError}
        ></audio>
    {/if}
</div>
