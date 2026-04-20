export function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function filenameFromPath(p: string): string {
    const cleaned = p.replace(/\\/g, "/").replace(/\/+$/, "");
    const idx = cleaned.lastIndexOf("/");
    return idx === -1 ? cleaned : cleaned.slice(idx + 1);
}

export function relativeTime(ms: number): string {
    const diff = Date.now() - ms;
    if (diff < 60_000) return "just now";
    const m = Math.round(diff / 60_000);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    return `${d}d ago`;
}

export async function fileToBase64(file: Blob): Promise<string> {
    const buf = await file.arrayBuffer();
    return bytesToBase64(new Uint8Array(buf));
}

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(
            null,
            Array.from(bytes.subarray(i, i + chunk)),
        );
    }
    return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

/**
 * Assemble a WAV container around raw PCM L16 chunks (signed 16-bit LE).
 * Used to let the browser play Qwen3-TTS streaming output after buffering.
 */
export function wavFromPcmL16(
    chunks: Uint8Array[],
    sampleRate = 24000,
    channels = 1,
): Blob {
    const dataLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataLength, true);
    let offset = 44;
    for (const chunk of chunks) {
        new Uint8Array(buffer, offset).set(chunk);
        offset += chunk.length;
    }
    return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

const AUDIO_EXTENSIONS = [
    "wav", "mp3", "flac", "m4a", "ogg", "opus", "aac", "webm",
];

export function hasAudioExtension(name: string): boolean {
    const lower = name.toLowerCase();
    return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`));
}
