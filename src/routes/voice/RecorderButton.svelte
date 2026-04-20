<script lang="ts" module>
    import type { ImportedAudio } from "$lib/voice.svelte.js";

    export type RecorderButtonProps = {
        disabled?: boolean;
        onRecorded: (audio: ImportedAudio) => void | Promise<void>;
        maxDurationSec?: number;
        warnDurationSec?: number;
    };
</script>

<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { appState } from "$lib/state.svelte.js";
    import { voiceState } from "$lib/voice.svelte.js";
    import { formatTime } from "$lib/audio";
    import { Mic, Square, Loader2 } from "@lucide/svelte";

    let {
        disabled = false,
        onRecorded,
        maxDurationSec = 600,
        warnDurationSec = 480,
    }: RecorderButtonProps = $props();

    let isRecording = $state(false);
    let isFinalizing = $state(false);
    let elapsedSec = $state(0);
    let errorMsg = $state<string | null>(null);

    let mediaRecorder: MediaRecorder | null = null;
    let mediaStream: MediaStream | null = null;
    let chunks: Blob[] = [];
    let recordedMime = "audio/webm;codecs=opus";
    let timerId: ReturnType<typeof setInterval> | null = null;
    let startedAt = 0;

    const pulseClass = $derived(
        elapsedSec >= warnDurationSec
            ? "bg-amber-500"
            : "bg-destructive",
    );
    const timerClass = $derived(
        elapsedSec >= warnDurationSec
            ? "text-amber-500"
            : "text-destructive",
    );

    function clearTimer() {
        if (timerId !== null) {
            clearInterval(timerId);
            timerId = null;
        }
    }

    function tearDownStream() {
        if (mediaStream) {
            for (const track of mediaStream.getTracks()) {
                try {
                    track.stop();
                } catch {
                    // best-effort cleanup
                }
            }
            mediaStream = null;
        }
        mediaRecorder = null;
        chunks = [];
    }

    function pickMimeType(): string {
        const candidates = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/ogg",
            "audio/mp4",
        ];
        if (typeof MediaRecorder === "undefined") return candidates[0];
        for (const m of candidates) {
            try {
                if (MediaRecorder.isTypeSupported(m)) return m;
            } catch {
                // ignore
            }
        }
        return candidates[0];
    }

    async function start() {
        if (isRecording || isFinalizing || disabled) return;
        errorMsg = null;
        try {
            appState.addLog("v1", "Microphone recording requested");
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error("getUserMedia is not available in this webview");
            }
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });
            recordedMime = pickMimeType();
            const recorder = new MediaRecorder(mediaStream, {
                mimeType: recordedMime,
            });
            mediaRecorder = recorder;
            chunks = [];
            recorder.ondataavailable = (ev) => {
                if (ev.data && ev.data.size > 0) chunks.push(ev.data);
            };
            recorder.onerror = (ev) => {
                appState.addLog(
                    "error",
                    "MediaRecorder error",
                    String((ev as unknown as { error?: unknown }).error ?? ev),
                );
            };
            recorder.onstop = () => {
                void finalize();
            };
            recorder.start(1000);
            isRecording = true;
            startedAt = Date.now();
            elapsedSec = 0;
            clearTimer();
            timerId = setInterval(() => {
                elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
                if (elapsedSec >= maxDurationSec) {
                    appState.addLog(
                        "v1",
                        `Auto-stopping recording at ${maxDurationSec}s`,
                    );
                    void stop();
                }
            }, 250);
            appState.addLog(
                "v2",
                `Recording started (mime=${recordedMime})`,
            );
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errorMsg = msg;
            appState.addLog("error", "Failed to start recording", msg);
            tearDownStream();
            isRecording = false;
            clearTimer();
        }
    }

    async function stop() {
        if (!isRecording) return;
        const recorder = mediaRecorder;
        if (!recorder) return;
        try {
            if (recorder.state !== "inactive") {
                recorder.stop();
            }
        } catch (e) {
            appState.addLog(
                "warn",
                "Stop called on inactive recorder",
                String(e),
            );
        }
        isRecording = false;
        clearTimer();
    }

    async function finalize() {
        isFinalizing = true;
        try {
            const collected = chunks.slice();
            const mime = recordedMime;
            tearDownStream();
            if (collected.length === 0) {
                appState.addLog(
                    "warn",
                    "Recording produced no audio chunks",
                );
                return;
            }
            const blob = new Blob(collected, { type: mime });
            const buf = await blob.arrayBuffer();
            const bytes = new Uint8Array(buf);
            appState.addLog(
                "v2",
                `Recording stopped (${blob.size} bytes, ${elapsedSec}s)`,
            );
            const result = await voiceState.saveRecording(bytes, mime);
            if (!result) {
                appState.addLog("error", "Saving recording returned null");
                return;
            }
            appState.addLog(
                "info",
                `Recording saved (${result.bytes}B)`,
                result.path,
            );
            await onRecorded(result);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            appState.addLog("error", "Failed to finalize recording", msg);
        } finally {
            isFinalizing = false;
            elapsedSec = 0;
        }
    }

    function toggle() {
        if (isRecording) {
            void stop();
        } else {
            void start();
        }
    }

    $effect(() => {
        return () => {
            clearTimer();
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                try {
                    mediaRecorder.stop();
                } catch {
                    // ignore
                }
            }
            tearDownStream();
        };
    });
</script>

<div class="flex items-center gap-3" data-slot="recorder-button">
    <Button
        type="button"
        variant={isRecording ? "destructive" : "secondary"}
        class="gap-2"
        disabled={disabled || isFinalizing}
        onclick={toggle}
    >
        {#if isFinalizing}
            <Loader2 class="w-4 h-4 animate-spin" />
            Saving...
        {:else if isRecording}
            <Square class="w-4 h-4 fill-current" />
            Stop Recording
        {:else}
            <Mic class="w-4 h-4" />
            Record with Microphone
        {/if}
    </Button>

    {#if isRecording}
        <div class="flex items-center gap-2">
            <span
                class="inline-block w-2.5 h-2.5 rounded-full {pulseClass} animate-pulse"
                aria-hidden="true"
            ></span>
            <span
                class="font-mono text-sm {timerClass}"
                aria-live="polite"
            >
                {formatTime(elapsedSec)}
            </span>
            {#if elapsedSec >= warnDurationSec}
                <span class="text-xs text-amber-500">
                    approaching {formatTime(maxDurationSec)} cap
                </span>
            {/if}
        </div>
    {/if}

    {#if errorMsg && !isRecording}
        <span class="text-xs text-destructive">{errorMsg}</span>
    {/if}
</div>
