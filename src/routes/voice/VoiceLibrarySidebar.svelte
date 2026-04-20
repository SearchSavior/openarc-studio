<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { ScrollArea } from "$lib/components/ui/scroll-area";
    import * as Popover from "$lib/components/ui/popover";
    import * as Tooltip from "$lib/components/ui/tooltip";
    import { appState } from "$lib/state.svelte.js";
    import {
        voiceState,
        type VoiceProfile,
        type GenerationMeta,
        type TranscriptionRecord,
    } from "$lib/voice.svelte.js";
    import {
        filenameFromPath,
        formatBytes,
        formatTime,
        relativeTime,
    } from "$lib/audio";
    import {
        AudioWaveform,
        ChevronDown,
        ChevronRight,
        Copy,
        Download,
        FileAudio,
        FileText,
        Mic,
        MoreHorizontal,
        Plus,
        Search,
        Sparkles,
        Trash2,
        Users,
    } from "@lucide/svelte";

    // dropdown-menu is not in this workspace (only popover ships), so the "New"
    // splitbutton is emulated with a Popover rendering three action items.

    let search = $state("");

    let sectionsOpen = $state({
        profiles: true,
        generations: true,
        transcriptions: true,
    });

    let newMenuOpen = $state(false);

    // no save-dialog tauri command is wired up yet; shown in tooltip on disabled export buttons
    const exportDisabledReason =
        "Export is not available yet — saving to disk isn't wired up.";

    function initialsOf(label: string): string {
        const trimmed = label.trim();
        if (!trimmed) return "?";
        const parts = trimmed.split(/\s+/).filter((p) => p.length > 0);
        if (parts.length === 0) return "?";
        if (parts.length === 1) {
            const first = parts[0] ?? "";
            return first.slice(0, 2).toUpperCase();
        }
        const a = parts[0]?.[0] ?? "";
        const b = parts[1]?.[0] ?? "";
        return (a + b).toUpperCase();
    }

    function truncate(text: string, max: number): string {
        const trimmed = text.trim();
        if (trimmed.length <= max) return trimmed;
        return `${trimmed.slice(0, max)}…`;
    }

    const needle = $derived(search.trim().toLowerCase());
    const isSearching = $derived(needle.length > 0);

    function matchText(...fields: (string | null | undefined)[]): boolean {
        if (!needle) return true;
        for (const f of fields) {
            if (!f) continue;
            if (f.toLowerCase().includes(needle)) return true;
        }
        return false;
    }

    const clonedProfiles = $derived.by<VoiceProfile[]>(() =>
        voiceState.profiles
            .filter((p) => p.kind === "clone")
            .filter((p) =>
                matchText(p.label, p.refText, p.baseModelName, p.language),
            )
            .sort((a, b) => b.createdAt - a.createdAt),
    );

    const designedProfiles = $derived.by<VoiceProfile[]>(() =>
        voiceState.profiles
            .filter((p) => p.kind === "design")
            .filter((p) =>
                matchText(p.label, p.voiceDescription, p.baseModelName),
            )
            .sort((a, b) => b.createdAt - a.createdAt),
    );

    const recentGenerations = $derived.by<GenerationMeta[]>(() =>
        voiceState.generations
            .slice(0, 20)
            .filter((g) => matchText(g.input, g.model, g.voice)),
    );

    const recentTranscriptions = $derived.by<TranscriptionRecord[]>(() =>
        voiceState.transcriptions
            .slice(0, 20)
            .filter((t) =>
                matchText(t.body.text, t.sourceLabel, t.sourcePath, t.model),
            ),
    );

    // hide kokoro preset row when search doesnt match, avoids stray unfiltered entry
    const showKokoroPresets = $derived(
        !isSearching || matchText("Kokoro presets"),
    );

    function toggleSection(key: keyof typeof sectionsOpen) {
        sectionsOpen[key] = !sectionsOpen[key];
    }

    function goTtsGeneration() {
        voiceState.mode = "tts";
        voiceState.ttsTab = "generation";
    }

    function goCloning() {
        voiceState.mode = "tts";
        voiceState.ttsTab = "cloning";
    }

    function goStt() {
        voiceState.mode = "stt";
    }

    function onNewTts() {
        newMenuOpen = false;
        voiceState.activeGeneration = null;
        goTtsGeneration();
        appState.addLog("v2", "Sidebar: new TTS generation");
    }

    function onNewTranscription() {
        newMenuOpen = false;
        voiceState.activeTranscription = null;
        goStt();
        appState.addLog("v2", "Sidebar: new transcription");
    }

    function onNewProfile() {
        newMenuOpen = false;
        goCloning();
        appState.addLog("v2", "Sidebar: new voice profile (clone)");
    }

    function openKokoroPresets() {
        // TODO: full voice browser dialog. for now just jump to generation tab.
        goTtsGeneration();
        appState.addLog("v2", "Sidebar: Kokoro presets clicked");
    }

    function selectProfile(profile: VoiceProfile) {
        voiceState.selectedVoice = profile.id;
        goTtsGeneration();
        appState.addLog(
            "v2",
            "Profile selected from sidebar",
            `${profile.kind}:${profile.label}`,
        );
    }

    async function renameProfile(profile: VoiceProfile) {
        const next = window.prompt("Rename voice profile", profile.label);
        if (next === null) return;
        const trimmed = next.trim();
        if (!trimmed || trimmed === profile.label) return;
        await voiceState.saveProfile({ ...profile, label: trimmed });
        appState.addLog(
            "info",
            `Renamed voice profile`,
            `${profile.label} → ${trimmed}`,
        );
    }

    async function duplicateProfile(profile: VoiceProfile) {
        const copy: VoiceProfile = {
            ...profile,
            id: crypto.randomUUID(),
            label: `${profile.label} (copy)`,
            createdAt: Date.now(),
        };
        await voiceState.saveProfile(copy);
        appState.addLog("info", `Duplicated voice profile: ${profile.label}`);
    }

    async function confirmDeleteProfile(profile: VoiceProfile) {
        const ok = window.confirm(
            `Delete voice profile "${profile.label}"? This cannot be undone.`,
        );
        if (!ok) return;
        await voiceState.deleteProfile(profile);
    }

    function selectGeneration(g: GenerationMeta) {
        voiceState.activeGeneration = {
            id: g.id,
            path: g.path,
            text: g.input,
            modelName: g.model,
            voice: g.voice ?? null,
            elapsedMs: g.elapsedMs,
            createdAt: g.createdAt,
        };
        voiceState.pendingTextToLoad = g.input;
        voiceState.playGenerationNonce += 1;
        goTtsGeneration();
        appState.addLog("v2", "Generation selected from sidebar", g.id);
    }

    async function copyGenerationText(g: GenerationMeta) {
        try {
            await navigator.clipboard.writeText(g.input);
            appState.addLog("v2", "Copied generation text");
        } catch (e) {
            appState.addLog(
                "error",
                "Failed to copy generation text",
                String(e),
            );
        }
    }

    async function confirmDeleteGeneration(g: GenerationMeta) {
        const preview = truncate(g.input, 40) || g.id;
        const ok = window.confirm(`Delete generation "${preview}"?`);
        if (!ok) return;
        await voiceState.deleteGeneration(g.id);
    }

    function selectTranscription(t: TranscriptionRecord) {
        voiceState.activeTranscription = t;
        goStt();
        appState.addLog("v2", "Transcription selected from sidebar", t.id);
    }

    async function copyTranscriptionText(t: TranscriptionRecord) {
        try {
            await navigator.clipboard.writeText(t.body.text ?? "");
            appState.addLog("v2", "Copied transcription text");
        } catch (e) {
            appState.addLog(
                "error",
                "Failed to copy transcription text",
                String(e),
            );
        }
    }

    async function openTranscriptionSource(t: TranscriptionRecord) {
        // plugin-opener is installed - same lazy-import pattern as AudioPlayer
        try {
            const mod = await import("@tauri-apps/plugin-opener");
            await mod.openPath(t.sourcePath);
            appState.addLog("v2", "Opened transcription source", t.sourcePath);
        } catch (e) {
            appState.addLog("warn", "openPath unavailable", String(e));
        }
    }

    async function confirmDeleteTranscription(t: TranscriptionRecord) {
        const preview =
            truncate(t.body.text ?? "", 40) ||
            t.sourceLabel ||
            filenameFromPath(t.sourcePath);
        const ok = window.confirm(`Delete transcription "${preview}"?`);
        if (!ok) return;
        await voiceState.deleteTranscription(t.id);
    }
</script>

<aside
    class="w-[300px] shrink-0 border-r bg-muted/20 flex flex-col h-full transition-all duration-200"
>
    <div class="p-3 border-b space-y-2.5">
        <div class="font-bold text-base flex items-center gap-2">
            <AudioWaveform class="w-4 h-4 text-primary" />
            Voice Studio
        </div>

        <Popover.Root bind:open={newMenuOpen}>
            <Popover.Trigger>
                {#snippet child({ props })}
                    <Button
                        {...props}
                        variant="default"
                        size="sm"
                        class="w-full justify-start gap-2 h-8"
                    >
                        <Plus class="w-3.5 h-3.5" />
                        New
                        <ChevronDown class="w-3.5 h-3.5 ml-auto" />
                    </Button>
                {/snippet}
            </Popover.Trigger>
            <Popover.Content class="w-56 p-1" align="start" sideOffset={4}>
                <button
                    type="button"
                    class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent hover:text-accent-foreground text-left"
                    onclick={onNewTts}
                >
                    <FileAudio class="w-4 h-4" />
                    New TTS generation
                </button>
                <button
                    type="button"
                    class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent hover:text-accent-foreground text-left"
                    onclick={onNewTranscription}
                >
                    <Mic class="w-4 h-4" />
                    New transcription
                </button>
                <button
                    type="button"
                    class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent hover:text-accent-foreground text-left"
                    onclick={onNewProfile}
                >
                    <Sparkles class="w-4 h-4" />
                    New voice profile (clone)
                </button>
            </Popover.Content>
        </Popover.Root>

        <div class="relative">
            <Search
                class="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"
            />
            <Input
                bind:value={search}
                type="text"
                placeholder="Search profiles, generations, transcriptions…"
                class="h-8 pl-7 text-xs"
            />
        </div>
    </div>

    <ScrollArea class="flex-1 min-h-0">
        <div class="p-2 space-y-1">
            <!-- Voice Profiles -->
            <div>
                <button
                    type="button"
                    class="w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    onclick={() => toggleSection("profiles")}
                >
                    {#if sectionsOpen.profiles}
                        <ChevronDown class="w-3 h-3" />
                    {:else}
                        <ChevronRight class="w-3 h-3" />
                    {/if}
                    Voice Profiles
                </button>

                {#if sectionsOpen.profiles}
                    <div class="mt-1 space-y-2">
                        <!-- Kokoro presets group -->
                        {#if showKokoroPresets}
                            <div>
                                <div
                                    class="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70"
                                >
                                    Kokoro presets
                                </div>
                                <button
                                    type="button"
                                    class="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md text-sm hover:bg-accent hover:text-accent-foreground text-left"
                                    onclick={openKokoroPresets}
                                >
                                    <span
                                        class="w-7 h-7 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center"
                                    >
                                        <Users class="w-3.5 h-3.5" />
                                    </span>
                                    <span class="flex-1 min-w-0">
                                        <span
                                            class="block truncate font-medium"
                                        >
                                            Kokoro presets
                                        </span>
                                        <span
                                            class="block text-[10px] text-muted-foreground"
                                        >
                                            53 built-in voices
                                        </span>
                                    </span>
                                </button>
                            </div>
                        {/if}

                        <!-- Cloned voices -->
                        <div>
                            <div
                                class="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70"
                            >
                                Cloned voices
                            </div>
                            {#if clonedProfiles.length === 0}
                                <div
                                    class="px-1.5 py-1 text-xs text-muted-foreground italic"
                                >
                                    {isSearching
                                        ? "No matches"
                                        : "No saved voices yet"}
                                </div>
                            {:else}
                                {#each clonedProfiles as profile (profile.id)}
                                    <div
                                        class="group flex items-center gap-1 pr-1 rounded-md hover:bg-accent"
                                    >
                                        <button
                                            type="button"
                                            class="flex-1 min-w-0 flex items-center gap-2 px-1.5 py-1.5 text-left"
                                            onclick={() =>
                                                selectProfile(profile)}
                                        >
                                            <span
                                                class="w-7 h-7 shrink-0 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center"
                                            >
                                                {initialsOf(profile.label)}
                                            </span>
                                            <span class="flex-1 min-w-0">
                                                <span
                                                    class="block truncate text-sm"
                                                >
                                                    {profile.label}
                                                </span>
                                                <span
                                                    class="block text-[10px] text-muted-foreground"
                                                >
                                                    {relativeTime(
                                                        profile.createdAt,
                                                    )}
                                                </span>
                                            </span>
                                        </button>
                                        <Popover.Root>
                                            <Popover.Trigger>
                                                {#snippet child({ props })}
                                                    <button
                                                        {...props}
                                                        type="button"
                                                        class="shrink-0 p-1 rounded hover:bg-muted-foreground/10 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                        aria-label="Profile actions"
                                                    >
                                                        <MoreHorizontal
                                                            class="w-3.5 h-3.5"
                                                        />
                                                    </button>
                                                {/snippet}
                                            </Popover.Trigger>
                                            <Popover.Content
                                                class="w-48 p-1"
                                                align="end"
                                                sideOffset={4}
                                            >
                                                <button
                                                    type="button"
                                                    class="w-full px-2 py-1.5 rounded text-sm hover:bg-accent hover:text-accent-foreground text-left"
                                                    onclick={() =>
                                                        renameProfile(profile)}
                                                >
                                                    Rename
                                                </button>
                                                <button
                                                    type="button"
                                                    class="w-full px-2 py-1.5 rounded text-sm hover:bg-accent hover:text-accent-foreground text-left"
                                                    onclick={() =>
                                                        duplicateProfile(
                                                            profile,
                                                        )}
                                                >
                                                    Duplicate
                                                </button>
                                                <Tooltip.Provider>
                                                    <Tooltip.Root>
                                                        <Tooltip.Trigger>
                                                            {#snippet child({
                                                                props,
                                                            })}
                                                                <button
                                                                    {...props}
                                                                    type="button"
                                                                    class="w-full px-2 py-1.5 rounded text-sm text-muted-foreground text-left flex items-center gap-2 opacity-60 cursor-not-allowed"
                                                                    disabled
                                                                >
                                                                    <Download
                                                                        class="w-3.5 h-3.5"
                                                                    />
                                                                    Export reference
                                                                    audio
                                                                </button>
                                                            {/snippet}
                                                        </Tooltip.Trigger>
                                                        <Tooltip.Content
                                                            side="left"
                                                        >
                                                            {exportDisabledReason}
                                                        </Tooltip.Content>
                                                    </Tooltip.Root>
                                                </Tooltip.Provider>
                                                <div
                                                    class="my-1 h-px bg-border"
                                                ></div>
                                                <button
                                                    type="button"
                                                    class="w-full px-2 py-1.5 rounded text-sm text-destructive hover:bg-destructive/10 text-left flex items-center gap-2"
                                                    onclick={() =>
                                                        confirmDeleteProfile(
                                                            profile,
                                                        )}
                                                >
                                                    <Trash2
                                                        class="w-3.5 h-3.5"
                                                    />
                                                    Delete
                                                </button>
                                            </Popover.Content>
                                        </Popover.Root>
                                    </div>
                                {/each}
                            {/if}
                        </div>

                        <!-- Designed voices -->
                        <div>
                            <div
                                class="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70"
                            >
                                Designed voices
                            </div>
                            {#if designedProfiles.length === 0}
                                <div
                                    class="px-1.5 py-1 text-xs text-muted-foreground italic"
                                >
                                    {isSearching
                                        ? "No matches"
                                        : "No saved voices yet"}
                                </div>
                            {:else}
                                {#each designedProfiles as profile (profile.id)}
                                    <div
                                        class="group flex items-center gap-1 pr-1 rounded-md hover:bg-accent"
                                    >
                                        <button
                                            type="button"
                                            class="flex-1 min-w-0 flex items-center gap-2 px-1.5 py-1.5 text-left"
                                            onclick={() =>
                                                selectProfile(profile)}
                                        >
                                            <span
                                                class="w-7 h-7 shrink-0 rounded-full bg-accent-foreground/10 text-foreground text-[10px] font-semibold flex items-center justify-center"
                                            >
                                                {initialsOf(profile.label)}
                                            </span>
                                            <span class="flex-1 min-w-0">
                                                <span
                                                    class="block truncate text-sm"
                                                >
                                                    {profile.label}
                                                </span>
                                                <span
                                                    class="block text-[10px] text-muted-foreground"
                                                >
                                                    {relativeTime(
                                                        profile.createdAt,
                                                    )}
                                                </span>
                                            </span>
                                        </button>
                                        <Popover.Root>
                                            <Popover.Trigger>
                                                {#snippet child({ props })}
                                                    <button
                                                        {...props}
                                                        type="button"
                                                        class="shrink-0 p-1 rounded hover:bg-muted-foreground/10 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                        aria-label="Profile actions"
                                                    >
                                                        <MoreHorizontal
                                                            class="w-3.5 h-3.5"
                                                        />
                                                    </button>
                                                {/snippet}
                                            </Popover.Trigger>
                                            <Popover.Content
                                                class="w-48 p-1"
                                                align="end"
                                                sideOffset={4}
                                            >
                                                <button
                                                    type="button"
                                                    class="w-full px-2 py-1.5 rounded text-sm hover:bg-accent hover:text-accent-foreground text-left"
                                                    onclick={() =>
                                                        renameProfile(profile)}
                                                >
                                                    Rename
                                                </button>
                                                <button
                                                    type="button"
                                                    class="w-full px-2 py-1.5 rounded text-sm hover:bg-accent hover:text-accent-foreground text-left"
                                                    onclick={() =>
                                                        duplicateProfile(
                                                            profile,
                                                        )}
                                                >
                                                    Duplicate
                                                </button>
                                                <div
                                                    class="my-1 h-px bg-border"
                                                ></div>
                                                <button
                                                    type="button"
                                                    class="w-full px-2 py-1.5 rounded text-sm text-destructive hover:bg-destructive/10 text-left flex items-center gap-2"
                                                    onclick={() =>
                                                        confirmDeleteProfile(
                                                            profile,
                                                        )}
                                                >
                                                    <Trash2
                                                        class="w-3.5 h-3.5"
                                                    />
                                                    Delete
                                                </button>
                                            </Popover.Content>
                                        </Popover.Root>
                                    </div>
                                {/each}
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Recent Generations -->
            <div class="pt-2">
                <button
                    type="button"
                    class="w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    onclick={() => toggleSection("generations")}
                >
                    {#if sectionsOpen.generations}
                        <ChevronDown class="w-3 h-3" />
                    {:else}
                        <ChevronRight class="w-3 h-3" />
                    {/if}
                    Recent Generations
                </button>

                {#if sectionsOpen.generations}
                    <div class="mt-1">
                        {#if recentGenerations.length === 0}
                            <div
                                class="px-1.5 py-1 text-xs text-muted-foreground italic"
                            >
                                {isSearching
                                    ? "No matches"
                                    : "No generations yet"}
                            </div>
                        {:else}
                            {#each recentGenerations as g (g.id)}
                                <div
                                    class="group flex items-center gap-1 pr-1 rounded-md hover:bg-accent"
                                >
                                    <button
                                        type="button"
                                        class="flex-1 min-w-0 flex items-center gap-2 px-1.5 py-1.5 text-left"
                                        onclick={() => selectGeneration(g)}
                                    >
                                        <FileAudio
                                            class="w-4 h-4 shrink-0 text-muted-foreground"
                                        />
                                        <span class="flex-1 min-w-0">
                                            <span
                                                class="block truncate text-xs"
                                            >
                                                {truncate(g.input, 40) ||
                                                    "(empty)"}
                                            </span>
                                            <span
                                                class="block text-[10px] text-muted-foreground font-mono"
                                            >
                                                {formatBytes(g.bytes)} · {relativeTime(
                                                    g.createdAt,
                                                )}
                                            </span>
                                        </span>
                                    </button>
                                    <Popover.Root>
                                        <Popover.Trigger>
                                            {#snippet child({ props })}
                                                <button
                                                    {...props}
                                                    type="button"
                                                    class="shrink-0 p-1 rounded hover:bg-muted-foreground/10 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    aria-label="Generation actions"
                                                >
                                                    <MoreHorizontal
                                                        class="w-3.5 h-3.5"
                                                    />
                                                </button>
                                            {/snippet}
                                        </Popover.Trigger>
                                        <Popover.Content
                                            class="w-44 p-1"
                                            align="end"
                                            sideOffset={4}
                                        >
                                            <button
                                                type="button"
                                                class="w-full px-2 py-1.5 rounded text-sm hover:bg-accent hover:text-accent-foreground text-left flex items-center gap-2"
                                                onclick={() =>
                                                    copyGenerationText(g)}
                                            >
                                                <Copy class="w-3.5 h-3.5" />
                                                Copy text
                                            </button>
                                            <Tooltip.Provider>
                                                <Tooltip.Root>
                                                    <Tooltip.Trigger>
                                                        {#snippet child({
                                                            props,
                                                        })}
                                                            <button
                                                                {...props}
                                                                type="button"
                                                                class="w-full px-2 py-1.5 rounded text-sm text-muted-foreground text-left flex items-center gap-2 opacity-60 cursor-not-allowed"
                                                                disabled
                                                            >
                                                                <Download
                                                                    class="w-3.5 h-3.5"
                                                                />
                                                                Export WAV
                                                            </button>
                                                        {/snippet}
                                                    </Tooltip.Trigger>
                                                    <Tooltip.Content
                                                        side="left"
                                                    >
                                                        {exportDisabledReason}
                                                    </Tooltip.Content>
                                                </Tooltip.Root>
                                            </Tooltip.Provider>
                                            <div
                                                class="my-1 h-px bg-border"
                                            ></div>
                                            <button
                                                type="button"
                                                class="w-full px-2 py-1.5 rounded text-sm text-destructive hover:bg-destructive/10 text-left flex items-center gap-2"
                                                onclick={() =>
                                                    confirmDeleteGeneration(g)}
                                            >
                                                <Trash2 class="w-3.5 h-3.5" />
                                                Delete
                                            </button>
                                        </Popover.Content>
                                    </Popover.Root>
                                </div>
                            {/each}
                        {/if}
                    </div>
                {/if}
            </div>

            <!-- Recent Transcriptions -->
            <div class="pt-2">
                <button
                    type="button"
                    class="w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    onclick={() => toggleSection("transcriptions")}
                >
                    {#if sectionsOpen.transcriptions}
                        <ChevronDown class="w-3 h-3" />
                    {:else}
                        <ChevronRight class="w-3 h-3" />
                    {/if}
                    Recent Transcriptions
                </button>

                {#if sectionsOpen.transcriptions}
                    <div class="mt-1">
                        {#if recentTranscriptions.length === 0}
                            <div
                                class="px-1.5 py-1 text-xs text-muted-foreground italic"
                            >
                                {isSearching
                                    ? "No matches"
                                    : "No transcriptions yet"}
                            </div>
                        {:else}
                            {#each recentTranscriptions as t (t.id)}
                                {@const label =
                                    t.sourceLabel ??
                                    filenameFromPath(t.sourcePath)}
                                <div
                                    class="group flex items-center gap-1 pr-1 rounded-md hover:bg-accent"
                                >
                                    <button
                                        type="button"
                                        class="flex-1 min-w-0 flex items-center gap-2 px-1.5 py-1.5 text-left"
                                        onclick={() => selectTranscription(t)}
                                    >
                                        <FileText
                                            class="w-4 h-4 shrink-0 text-muted-foreground"
                                        />
                                        <span class="flex-1 min-w-0">
                                            <span
                                                class="block truncate text-xs font-medium"
                                            >
                                                {label}
                                            </span>
                                            <span
                                                class="block truncate text-[11px] text-muted-foreground"
                                            >
                                                {truncate(
                                                    t.body.text ?? "",
                                                    40,
                                                ) || "(no text)"}
                                            </span>
                                            <span
                                                class="block text-[10px] text-muted-foreground font-mono"
                                            >
                                                {formatTime(
                                                    t.body.duration ?? 0,
                                                )} · {relativeTime(t.createdAt)}
                                            </span>
                                        </span>
                                    </button>
                                    <Popover.Root>
                                        <Popover.Trigger>
                                            {#snippet child({ props })}
                                                <button
                                                    {...props}
                                                    type="button"
                                                    class="shrink-0 p-1 rounded hover:bg-muted-foreground/10 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    aria-label="Transcription actions"
                                                >
                                                    <MoreHorizontal
                                                        class="w-3.5 h-3.5"
                                                    />
                                                </button>
                                            {/snippet}
                                        </Popover.Trigger>
                                        <Popover.Content
                                            class="w-52 p-1"
                                            align="end"
                                            sideOffset={4}
                                        >
                                            <button
                                                type="button"
                                                class="w-full px-2 py-1.5 rounded text-sm hover:bg-accent hover:text-accent-foreground text-left flex items-center gap-2"
                                                onclick={() =>
                                                    copyTranscriptionText(t)}
                                            >
                                                <Copy class="w-3.5 h-3.5" />
                                                Copy text
                                            </button>
                                            <Tooltip.Provider>
                                                <Tooltip.Root>
                                                    <Tooltip.Trigger>
                                                        {#snippet child({
                                                            props,
                                                        })}
                                                            <button
                                                                {...props}
                                                                type="button"
                                                                class="w-full px-2 py-1.5 rounded text-sm text-muted-foreground text-left flex items-center gap-2 opacity-60 cursor-not-allowed"
                                                                disabled
                                                            >
                                                                <Download
                                                                    class="w-3.5 h-3.5"
                                                                />
                                                                Export text
                                                            </button>
                                                        {/snippet}
                                                    </Tooltip.Trigger>
                                                    <Tooltip.Content
                                                        side="left"
                                                    >
                                                        {exportDisabledReason}
                                                    </Tooltip.Content>
                                                </Tooltip.Root>
                                            </Tooltip.Provider>
                                            <button
                                                type="button"
                                                class="w-full px-2 py-1.5 rounded text-sm hover:bg-accent hover:text-accent-foreground text-left flex items-center gap-2"
                                                onclick={() =>
                                                    openTranscriptionSource(t)}
                                            >
                                                <FileAudio
                                                    class="w-3.5 h-3.5"
                                                />
                                                Open source audio
                                            </button>
                                            <div
                                                class="my-1 h-px bg-border"
                                            ></div>
                                            <button
                                                type="button"
                                                class="w-full px-2 py-1.5 rounded text-sm text-destructive hover:bg-destructive/10 text-left flex items-center gap-2"
                                                onclick={() =>
                                                    confirmDeleteTranscription(
                                                        t,
                                                    )}
                                            >
                                                <Trash2 class="w-3.5 h-3.5" />
                                                Delete
                                            </button>
                                        </Popover.Content>
                                    </Popover.Root>
                                </div>
                            {/each}
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    </ScrollArea>
</aside>
