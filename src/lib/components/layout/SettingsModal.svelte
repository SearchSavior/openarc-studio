<script lang="ts">
    import * as Dialog from "$lib/components/ui/dialog";
    import { Input } from "$lib/components/ui/input";
    import { Button } from "$lib/components/ui/button";
    import { Switch } from "$lib/components/ui/switch";
    import { Label } from "$lib/components/ui/label";
    import { ScrollArea } from "$lib/components/ui/scroll-area";
    import { appState } from "$lib/state.svelte.js";
    import { openarc } from "$lib/client.svelte.js";
    import {
        Settings,
        Palette,
        Cpu,
        Server,
        Activity,
        Laptop,
        Database,
        Info,
        HardDrive,
        Download,
        Loader2,
        AlertCircle,
        CheckCircle2,
        RefreshCw,
        Globe,
        FolderOpen,
        Sparkles,
        Moon,
        Sun,
        Monitor,
    } from "@lucide/svelte";
    import {
        fetchCuratedManifest,
        isCuratedLoading,
        getCuratedError,
    } from "$lib/curated-models.svelte.js";
    import { setMode, resetMode, mode } from "mode-watcher";

    type Tab = "general" | "appearance" | "runtime" | "hardware" | "logs";
    let activeTab = $state<Tab>("general");

    const tabs = [
        {
            id: "general",
            label: "General",
            description: "Global behavior and paths",
            icon: Settings,
        },
        {
            id: "appearance",
            label: "Appearance",
            description: "Theme and layout",
            icon: Palette,
        },
        {
            id: "runtime",
            label: "Runtime",
            description: "Local or remote server",
            icon: Server,
        },
        {
            id: "hardware",
            label: "Hardware",
            description: "System capabilities",
            icon: Cpu,
        },
        {
            id: "logs",
            label: "System Logs",
            description: "Events and tracing",
            icon: Activity,
        },
    ] as const;

    const activeTabMeta = $derived(
        tabs.find((t) => t.id === activeTab) ?? tabs[0],
    );

    let openarcVersion = $state("v1.2.0");
    let connectionStatus = $state<"idle" | "testing" | "success" | "error">(
        "idle",
    );
    let connectionMessage = $state("");

    let logVerbosity = $state(2);
    const logLevelMap: Record<string, number> = {
        error: 0,
        warn: 1,
        info: 2,
        v1: 3,
        v2: 4,
        v3: 5,
        v4: 6,
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

    async function refreshCuratedManifest() {
        await fetchCuratedManifest();
        appState.addLog(
            "v1",
            "Curated manifest refresh triggered from Settings",
        );
    }
</script>

<Dialog.Root bind:open={appState.settingsOpen}>
    <Dialog.Content
        class="sm:max-w-[1040px] w-[94vw] h-[84vh] p-0 flex flex-row overflow-hidden gap-0 bg-background border shadow-2xl"
    >
        <Dialog.Title class="sr-only">Settings</Dialog.Title>
        <Dialog.Description class="sr-only">
            Configure OpenArc Studio preferences, appearance, runtime, and
            hardware.
        </Dialog.Description>

        <!-- Left nav -->
        <div
            class="w-[260px] shrink-0 border-r flex flex-col h-full overflow-hidden bg-muted/10"
        >
            <div
                class="shrink-0 px-4 pt-5 pb-4 border-b bg-gradient-to-b from-muted/30 to-transparent"
            >
                <div class="flex items-center gap-3">
                    <div
                        class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
                    >
                        <Settings class="w-4 h-4 text-primary" />
                    </div>
                    <div class="min-w-0">
                        <h2
                            class="text-sm font-bold tracking-tight leading-tight"
                        >
                            Settings
                        </h2>
                        <p
                            class="text-[11px] text-muted-foreground leading-tight mt-0.5"
                        >
                            Preferences and connection
                        </p>
                    </div>
                </div>
            </div>

            <ScrollArea class="flex-1 min-h-0">
                <div class="p-2 space-y-1">
                    {#each tabs as tab}
                        {@const isActive = activeTab === tab.id}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div
                            class="group relative flex items-center gap-2.5 px-2.5 py-2 rounded-md border cursor-pointer transition-all
                                {isActive
                                ? 'bg-muted/40 border-primary/50 shadow-sm ring-1 ring-primary/20'
                                : 'bg-transparent border-transparent hover:bg-background hover:border-border'}"
                            onclick={() => (activeTab = tab.id)}
                        >
                            <div
                                class="w-1 self-stretch rounded-full bg-primary {isActive
                                    ? 'opacity-100'
                                    : 'opacity-0 group-hover:opacity-40'}"
                            ></div>
                            <div
                                class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 {isActive
                                    ? 'bg-primary/10 text-primary'
                                    : 'bg-muted/40 text-muted-foreground group-hover:text-foreground'}"
                            >
                                <tab.icon class="w-3.5 h-3.5" />
                            </div>
                            <div class="flex-1 min-w-0">
                                <div
                                    class="text-[13px] font-semibold leading-tight {isActive
                                        ? 'text-foreground'
                                        : 'text-foreground/90'}"
                                >
                                    {tab.label}
                                </div>
                                <div
                                    class="text-[10.5px] text-muted-foreground truncate leading-tight mt-0.5"
                                >
                                    {tab.description}
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            </ScrollArea>

            <div
                class="shrink-0 border-t px-4 py-3 bg-muted/20 flex items-center gap-2 text-[10.5px] text-muted-foreground"
            >
                <Info class="w-3.5 h-3.5 shrink-0" />
                <span class="leading-tight">
                    Changes are saved automatically
                </span>
            </div>
        </div>

        <!-- Right content panel -->
        <div class="flex-1 flex flex-col bg-background overflow-hidden min-w-0">
            <!-- Gradient header -->
            <div
                class="shrink-0 px-6 pt-5 pb-4 border-b bg-gradient-to-b from-muted/20 to-background"
            >
                <div class="flex items-center gap-3 pr-10">
                    <div
                        class="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
                    >
                        <activeTabMeta.icon class="w-4 h-4 text-primary" />
                    </div>
                    <div class="min-w-0">
                        <h3
                            class="text-base font-bold tracking-tight leading-tight"
                        >
                            {activeTabMeta.label}
                        </h3>
                        <p
                            class="text-xs text-muted-foreground leading-tight mt-0.5"
                        >
                            {activeTabMeta.description}
                        </p>
                    </div>
                </div>
            </div>

            <!-- Scrollable form body -->
            <ScrollArea class="flex-1 min-h-0">
                <div class="px-6 py-5 max-w-3xl">
                    {#if activeTab === "general"}
                        <div class="space-y-6">
                            <!-- Paths & Sources -->
                            <div class="space-y-3">
                                <div
                                    class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                                >
                                    Paths & Sources
                                </div>
                                <div
                                    class="rounded-lg bg-muted/20 border border-border/50 p-4 space-y-4"
                                >
                                    <div class="space-y-1.5">
                                        <Label
                                            for="model-path"
                                            class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                                        >
                                            <FolderOpen class="w-3 h-3" />
                                            Default Model Download Path
                                        </Label>
                                        <div class="flex gap-2">
                                            <Input
                                                id="model-path"
                                                bind:value={
                                                    appState.settings
                                                        .defaultModelPath
                                                }
                                                readonly
                                                class="h-9 bg-background font-mono text-xs"
                                            />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                class="h-9 shrink-0"
                                            >
                                                Browse
                                            </Button>
                                        </div>
                                        <p
                                            class="text-[11px] text-muted-foreground leading-snug"
                                        >
                                            Where OpenArc Studio will download
                                            and store models.
                                        </p>
                                    </div>

                                    <div
                                        class="h-px bg-border/60 -mx-4"
                                    ></div>

                                    <div class="space-y-1.5">
                                        <Label
                                            for="curated-url"
                                            class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                                        >
                                            <Globe class="w-3 h-3" />
                                            Curated Models Manifest URL
                                        </Label>
                                        <div class="flex gap-2">
                                            <Input
                                                id="curated-url"
                                                bind:value={
                                                    appState.settings
                                                        .curatedManifestUrl
                                                }
                                                placeholder="https://raw.githubusercontent.com/.../curated-manifest.json"
                                                class="h-9 bg-background font-mono text-xs"
                                            />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                class="h-9 shrink-0 gap-1.5"
                                                disabled={isCuratedLoading()}
                                                onclick={refreshCuratedManifest}
                                            >
                                                {#if isCuratedLoading()}
                                                    <Loader2
                                                        class="w-3.5 h-3.5 animate-spin"
                                                    />
                                                {:else}
                                                    <RefreshCw
                                                        class="w-3.5 h-3.5"
                                                    />
                                                {/if}
                                                Refresh
                                            </Button>
                                        </div>
                                        <p
                                            class="text-[11px] text-muted-foreground leading-snug"
                                        >
                                            URL to a JSON manifest of
                                            pre-configured models. Leave empty
                                            to use the default curated list.
                                        </p>
                                        {#if getCuratedError()}
                                            <div
                                                class="flex items-start gap-1.5 text-[11px] text-destructive bg-destructive/10 px-2 py-1.5 rounded-md border border-destructive/20 mt-1"
                                            >
                                                <AlertCircle
                                                    class="w-3 h-3 shrink-0 mt-0.5"
                                                />
                                                <span class="break-words"
                                                    >{getCuratedError()}</span
                                                >
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            </div>

                            <!-- Startup -->
                            <div class="space-y-3">
                                <div
                                    class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                                >
                                    Startup & Updates
                                </div>
                                <div
                                    class="rounded-lg bg-muted/20 border border-border/50 divide-y divide-border/50"
                                >
                                    <div
                                        class="flex items-center justify-between p-4 gap-4"
                                    >
                                        <div class="min-w-0">
                                            <Label
                                                for="start-boot"
                                                class="text-[13px] font-semibold text-foreground"
                                            >
                                                Start on System Boot
                                            </Label>
                                            <p
                                                class="text-[11px] text-muted-foreground leading-snug mt-0.5"
                                            >
                                                Launch OpenArc Studio
                                                automatically when you log in.
                                            </p>
                                        </div>
                                        <Switch
                                            id="start-boot"
                                            bind:checked={
                                                appState.settings.startOnBoot
                                            }
                                        />
                                    </div>

                                    <div
                                        class="flex items-center justify-between p-4 gap-4"
                                    >
                                        <div class="min-w-0">
                                            <Label
                                                for="auto-update"
                                                class="text-[13px] font-semibold text-foreground"
                                            >
                                                Automatic Updates
                                            </Label>
                                            <p
                                                class="text-[11px] text-muted-foreground leading-snug mt-0.5"
                                            >
                                                Download and install updates in
                                                the background.
                                            </p>
                                        </div>
                                        <Switch
                                            id="auto-update"
                                            bind:checked={
                                                appState.settings.autoUpdate
                                            }
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    {:else if activeTab === "appearance"}
                        <div class="space-y-6">
                            <!-- Theme -->
                            <div class="space-y-3">
                                <div
                                    class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                                >
                                    Theme
                                </div>
                                <div
                                    class="rounded-lg bg-muted/20 border border-border/50 p-4"
                                >
                                    <div class="grid grid-cols-3 gap-2">
                                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                                        <div
                                            class="group relative rounded-md border p-3 flex flex-col items-center gap-2 cursor-pointer transition-all
                                                {mode.current === 'dark'
                                                ? 'bg-muted/40 border-primary/50 shadow-sm ring-1 ring-primary/20'
                                                : 'bg-background border-border/50 hover:border-border'}"
                                            onclick={() => setMode("dark")}
                                        >
                                            <div
                                                class="w-10 h-10 rounded-full bg-slate-900 border border-border/50 flex items-center justify-center"
                                            >
                                                <Moon
                                                    class="w-4 h-4 text-slate-300"
                                                />
                                            </div>
                                            <span
                                                class="text-[11px] font-semibold"
                                            >
                                                Dark
                                            </span>
                                        </div>
                                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                                        <div
                                            class="group relative rounded-md border p-3 flex flex-col items-center gap-2 cursor-pointer transition-all
                                                {mode.current === 'light'
                                                ? 'bg-muted/40 border-primary/50 shadow-sm ring-1 ring-primary/20'
                                                : 'bg-background border-border/50 hover:border-border'}"
                                            onclick={() => setMode("light")}
                                        >
                                            <div
                                                class="w-10 h-10 rounded-full bg-slate-100 border border-border/50 flex items-center justify-center"
                                            >
                                                <Sun
                                                    class="w-4 h-4 text-amber-500"
                                                />
                                            </div>
                                            <span
                                                class="text-[11px] font-semibold"
                                            >
                                                Light
                                            </span>
                                        </div>
                                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                                        <div
                                            class="group relative rounded-md border p-3 flex flex-col items-center gap-2 cursor-pointer transition-all
                                                {mode.current === undefined
                                                ? 'bg-muted/40 border-primary/50 shadow-sm ring-1 ring-primary/20'
                                                : 'bg-background border-border/50 hover:border-border'}"
                                            onclick={() => resetMode()}
                                        >
                                            <div
                                                class="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-900 border border-border/50 flex items-center justify-center"
                                            >
                                                <Monitor
                                                    class="w-4 h-4 text-foreground/80"
                                                />
                                            </div>
                                            <span
                                                class="text-[11px] font-semibold"
                                            >
                                                System
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Chat -->
                            <div class="space-y-3">
                                <div
                                    class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                                >
                                    Chat Interface
                                </div>
                                <div
                                    class="rounded-lg bg-muted/20 border border-border/50 divide-y divide-border/50"
                                >
                                    <div
                                        class="flex items-center justify-between p-4 gap-4"
                                    >
                                        <div class="min-w-0">
                                            <Label
                                                for="compact-mode"
                                                class="text-[13px] font-semibold text-foreground"
                                            >
                                                Compact Chat Mode
                                            </Label>
                                            <p
                                                class="text-[11px] text-muted-foreground leading-snug mt-0.5"
                                            >
                                                Decrease padding and spacing in
                                                the chat interface.
                                            </p>
                                        </div>
                                        <Switch
                                            id="compact-mode"
                                            bind:checked={
                                                appState.settings.compactMode
                                            }
                                        />
                                    </div>

                                    <div
                                        class="flex items-center justify-between p-4 gap-4"
                                    >
                                        <div class="min-w-0">
                                            <Label
                                                for="auto-scroll"
                                                class="text-[13px] font-semibold text-foreground"
                                            >
                                                Auto-scroll to Latest Message
                                            </Label>
                                            <p
                                                class="text-[11px] text-muted-foreground leading-snug mt-0.5"
                                            >
                                                Automatically scroll the chat
                                                view to the bottom as new
                                                messages stream in.
                                            </p>
                                        </div>
                                        <Switch
                                            id="auto-scroll"
                                            bind:checked={
                                                appState.settings.autoScroll
                                            }
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    {:else if activeTab === "runtime"}
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
                    {:else if activeTab === "hardware"}
                        <div class="space-y-6">
                            <!-- Processor & Memory -->
                            <div class="space-y-3">
                                <div
                                    class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                                >
                                    System
                                </div>
                                <div class="grid grid-cols-2 gap-2">
                                    {#if openarc.metrics?.cpus?.[0]}
                                        {@const cpu = openarc.metrics.cpus[0]}
                                        <div
                                            class="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2.5"
                                        >
                                            <div
                                                class="flex items-center gap-2"
                                            >
                                                <div
                                                    class="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
                                                >
                                                    <Cpu
                                                        class="w-3 h-3 text-primary"
                                                    />
                                                </div>
                                                <h4
                                                    class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                                                >
                                                    Processor
                                                </h4>
                                            </div>
                                            <div
                                                class="font-semibold text-[13px] truncate"
                                                title={cpu.name}
                                            >
                                                {cpu.name}
                                            </div>
                                            <div
                                                class="text-[11px] text-muted-foreground"
                                            >
                                                {cpu.cores} Cores · {cpu.threads}
                                                Threads
                                            </div>
                                            <div
                                                class="flex items-center gap-2"
                                            >
                                                <div
                                                    class="flex-1 bg-background rounded-full h-1.5 overflow-hidden border border-border/50"
                                                >
                                                    <div
                                                        class="bg-emerald-500 h-full rounded-full transition-all duration-300"
                                                        style="width: {cpu.usage}%"
                                                    ></div>
                                                </div>
                                                <div
                                                    class="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap"
                                                >
                                                    {cpu.usage.toFixed(1)}%
                                                </div>
                                            </div>
                                        </div>
                                    {:else}
                                        <div
                                            class="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2.5"
                                        >
                                            <div
                                                class="flex items-center gap-2"
                                            >
                                                <div
                                                    class="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
                                                >
                                                    <Cpu
                                                        class="w-3 h-3 text-primary"
                                                    />
                                                </div>
                                                <h4
                                                    class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                                                >
                                                    Processor
                                                </h4>
                                            </div>
                                            <div
                                                class="font-semibold text-[13px]"
                                            >
                                                Intel Core Ultra
                                            </div>
                                            <div
                                                class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md w-fit border border-emerald-500/20"
                                            >
                                                OpenVINO Compatible
                                            </div>
                                        </div>
                                    {/if}

                                    <div
                                        class="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2.5"
                                    >
                                        <div class="flex items-center gap-2">
                                            <div
                                                class="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
                                            >
                                                <Database
                                                    class="w-3 h-3 text-primary"
                                                />
                                            </div>
                                            <h4
                                                class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                                            >
                                                System Memory
                                            </h4>
                                        </div>
                                        {#if openarc.metrics}
                                            {@const usedGb = (
                                                openarc.metrics.used_ram / 1024
                                            ).toFixed(1)}
                                            {@const totalGb = (
                                                openarc.metrics.total_ram / 1024
                                            ).toFixed(1)}
                                            {@const pct =
                                                (openarc.metrics.used_ram /
                                                    openarc.metrics.total_ram) *
                                                100}
                                            <div
                                                class="font-semibold text-[13px]"
                                            >
                                                {totalGb} GB Total RAM
                                            </div>
                                            <div
                                                class="text-[11px] text-muted-foreground"
                                            >
                                                {usedGb} GB in use
                                            </div>
                                            <div
                                                class="flex items-center gap-2"
                                            >
                                                <div
                                                    class="flex-1 bg-background rounded-full h-1.5 overflow-hidden border border-border/50"
                                                >
                                                    <div
                                                        class="bg-primary h-full rounded-full transition-all duration-300"
                                                        style="width: {pct}%"
                                                    ></div>
                                                </div>
                                                <div
                                                    class="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap"
                                                >
                                                    {pct.toFixed(0)}%
                                                </div>
                                            </div>
                                        {:else}
                                            <div
                                                class="font-semibold text-[13px]"
                                            >
                                                32.0 GB Total RAM
                                            </div>
                                            <div
                                                class="text-[11px] text-muted-foreground"
                                            >
                                                14.2 GB Available
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            </div>

                            <!-- Accelerators -->
                            <div class="space-y-3">
                                <div
                                    class="flex items-center justify-between"
                                >
                                    <div
                                        class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"
                                    >
                                        <HardDrive class="w-3 h-3" />
                                        Accelerators (OpenVINO Devices)
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    {#if openarc.metrics?.gpus?.length > 0}
                                        {#each openarc.metrics.gpus as gpu}
                                            {@const usedGb = (
                                                gpu.used_vram / 1024
                                            ).toFixed(1)}
                                            {@const totalGb = (
                                                gpu.total_vram / 1024
                                            ).toFixed(1)}
                                            {@const pct =
                                                (gpu.used_vram /
                                                    gpu.total_vram) *
                                                100}
                                            <div
                                                class="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3"
                                            >
                                                <div
                                                    class="flex justify-between items-start gap-3"
                                                >
                                                    <div class="min-w-0">
                                                        <div
                                                            class="font-semibold text-[13px] truncate"
                                                        >
                                                            {gpu.id}: {gpu.name}
                                                        </div>
                                                        <div
                                                            class="text-[11px] text-muted-foreground mt-0.5"
                                                        >
                                                            Graphics Processing
                                                            Unit
                                                        </div>
                                                    </div>
                                                    <div
                                                        class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border font-mono shrink-0"
                                                    >
                                                        {totalGb} GB
                                                        {gpu.is_shared
                                                            ? "Shared"
                                                            : "VRAM"}
                                                    </div>
                                                </div>
                                                <div
                                                    class="flex items-center gap-2"
                                                >
                                                    <div
                                                        class="flex-1 bg-background rounded-full h-1.5 overflow-hidden border border-border/50"
                                                    >
                                                        <div
                                                            class="bg-primary h-full rounded-full transition-all duration-300"
                                                            style="width: {pct}%"
                                                        ></div>
                                                    </div>
                                                    <div
                                                        class="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap"
                                                    >
                                                        {usedGb} / {totalGb} GB
                                                        · {gpu.usage.toFixed(1)}%
                                                    </div>
                                                </div>
                                            </div>
                                        {/each}
                                    {/if}
                                    {#if openarc.metrics?.npus?.length > 0}
                                        {#each openarc.metrics.npus as npu}
                                            <div
                                                class="rounded-lg border border-border/50 bg-muted/20 p-4"
                                            >
                                                <div
                                                    class="flex justify-between items-start gap-3"
                                                >
                                                    <div class="min-w-0">
                                                        <div
                                                            class="font-semibold text-[13px] truncate"
                                                        >
                                                            {npu.id}: {npu.name}
                                                        </div>
                                                        <div
                                                            class="text-[11px] text-muted-foreground mt-0.5"
                                                        >
                                                            Neural Processing
                                                            Unit
                                                        </div>
                                                    </div>
                                                    <div
                                                        class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border shrink-0"
                                                    >
                                                        Dedicated AI
                                                    </div>
                                                </div>
                                            </div>
                                        {/each}
                                    {/if}
                                    {#if !openarc.metrics?.gpus?.length && !openarc.metrics?.npus?.length}
                                        <div
                                            class="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3"
                                        >
                                            <div
                                                class="flex justify-between items-start gap-3"
                                            >
                                                <div class="min-w-0">
                                                    <div
                                                        class="font-semibold text-[13px] truncate"
                                                    >
                                                        GPU.0: Intel Arc
                                                        Graphics
                                                    </div>
                                                    <div
                                                        class="text-[11px] text-muted-foreground mt-0.5"
                                                    >
                                                        Integrated GPU
                                                    </div>
                                                </div>
                                                <div
                                                    class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border font-mono shrink-0"
                                                >
                                                    16.0 GB Shared
                                                </div>
                                            </div>
                                            <div
                                                class="flex items-center gap-2"
                                            >
                                                <div
                                                    class="flex-1 bg-background rounded-full h-1.5 overflow-hidden border border-border/50"
                                                >
                                                    <div
                                                        class="bg-primary h-full rounded-full"
                                                        style="width: 15%"
                                                    ></div>
                                                </div>
                                                <div
                                                    class="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap"
                                                >
                                                    2.4 / 16.0 GB
                                                </div>
                                            </div>
                                        </div>

                                        <div
                                            class="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3"
                                        >
                                            <div
                                                class="flex justify-between items-start gap-3"
                                            >
                                                <div class="min-w-0">
                                                    <div
                                                        class="font-semibold text-[13px] truncate"
                                                    >
                                                        NPU: Intel AI Boost
                                                    </div>
                                                    <div
                                                        class="text-[11px] text-muted-foreground mt-0.5"
                                                    >
                                                        Neural Processing Unit
                                                    </div>
                                                </div>
                                                <div
                                                    class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border shrink-0"
                                                >
                                                    Dedicated AI
                                                </div>
                                            </div>
                                            <div
                                                class="flex items-center gap-2"
                                            >
                                                <div
                                                    class="flex-1 bg-background rounded-full h-1.5 overflow-hidden border border-border/50"
                                                >
                                                    <div
                                                        class="bg-blue-500 h-full rounded-full"
                                                        style="width: 5%"
                                                    ></div>
                                                </div>
                                                <div
                                                    class="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap"
                                                >
                                                    Idle
                                                </div>
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                            </div>

                            <!-- Resource monitor -->
                            <div class="space-y-3">
                                <div
                                    class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"
                                >
                                    <Activity class="w-3 h-3" />
                                    Resource Monitor
                                </div>
                                <div
                                    class="rounded-lg border border-border/50 bg-muted/20 p-6 h-[180px] flex items-center justify-center flex-col text-muted-foreground"
                                >
                                    <Activity
                                        class="w-8 h-8 mb-2 opacity-30"
                                    />
                                    <span class="text-sm font-semibold">
                                        Real-time telemetry
                                    </span>
                                    <span
                                        class="text-[11px] mt-0.5 text-muted-foreground"
                                    >
                                        Waiting for Tauri backend to connect
                                    </span>
                                </div>
                            </div>
                        </div>
                    {:else if activeTab === "logs"}
                        {@const filteredLogs = appState.logs.filter(
                            (l) => (logLevelMap[l.level] ?? 2) <= logVerbosity,
                        )}
                        <div class="space-y-3">
                            <div
                                class="flex items-center justify-between gap-3 flex-wrap"
                            >
                                <div
                                    class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                                >
                                    Event Stream
                                </div>
                                <div class="flex items-center gap-2">
                                    <select
                                        bind:value={logVerbosity}
                                        class="h-8 rounded-md border border-input bg-background px-2 py-1 text-[11px] shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                    >
                                        <option value={0}>Errors Only</option>
                                        <option value={1}
                                            >Warnings & Errors</option
                                        >
                                        <option value={2}
                                            >Info & Above</option
                                        >
                                        <option value={3}
                                            >Verbose 1 (Major Steps)</option
                                        >
                                        <option value={4}
                                            >Verbose 2 (Minor Steps)</option
                                        >
                                        <option value={5}
                                            >Verbose 3 (Tracing)</option
                                        >
                                        <option value={6}
                                            >Verbose 4 (Raw Data)</option
                                        >
                                    </select>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        class="h-8 gap-1.5 text-xs"
                                        onclick={() => appState.clearLogs()}
                                    >
                                        Clear
                                    </Button>
                                </div>
                            </div>

                            <div
                                class="flex items-center gap-2 flex-wrap text-[11px]"
                            >
                                <div
                                    class="inline-flex items-center gap-1.5 bg-muted/50 text-foreground px-2 py-1 rounded-md border"
                                >
                                    <span class="tabular-nums font-semibold"
                                        >{filteredLogs.length}</span
                                    >
                                    <span class="text-muted-foreground"
                                        >shown</span
                                    >
                                </div>
                                <div
                                    class="inline-flex items-center gap-1.5 bg-muted/50 text-foreground px-2 py-1 rounded-md border"
                                >
                                    <span class="tabular-nums font-semibold"
                                        >{appState.logs.length}</span
                                    >
                                    <span class="text-muted-foreground"
                                        >total</span
                                    >
                                </div>
                            </div>

                            <div
                                class="rounded-lg border border-border/50 bg-muted/20 overflow-hidden"
                            >
                                {#if filteredLogs.length === 0}
                                    <div
                                        class="h-[360px] flex flex-col items-center justify-center text-muted-foreground text-sm gap-2"
                                    >
                                        <Activity class="w-6 h-6 opacity-30" />
                                        <span class="text-[12px] font-medium">
                                            No logs match the current filter
                                        </span>
                                    </div>
                                {:else}
                                    <div
                                        class="p-2 space-y-0.5 font-mono text-[11px] leading-tight max-h-[480px] overflow-auto"
                                    >
                                        {#each filteredLogs as log}
                                            <div
                                                class="flex items-start gap-2 p-1.5 rounded-md border border-transparent transition-colors {log.level ===
                                                'error'
                                                    ? 'bg-destructive/5 text-destructive border-destructive/10 hover:bg-destructive/10'
                                                    : log.level === 'warn'
                                                      ? 'text-amber-500 hover:bg-muted/50'
                                                      : log.level === 'info'
                                                        ? 'text-foreground hover:bg-muted/50'
                                                        : 'text-muted-foreground hover:bg-muted/50'}"
                                            >
                                                <span
                                                    class="shrink-0 opacity-50 whitespace-nowrap tabular-nums"
                                                >
                                                    {log.timestamp.toLocaleTimeString(
                                                        [],
                                                        {
                                                            hour12: false,
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                            second: "2-digit",
                                                        },
                                                    )}
                                                </span>
                                                <span
                                                    class="shrink-0 font-bold uppercase w-10 tracking-wider"
                                                >
                                                    {log.level}
                                                </span>
                                                <div
                                                    class="flex-1 flex flex-col gap-1 min-w-0"
                                                >
                                                    <span
                                                        class="break-words font-medium"
                                                        >{log.message}</span
                                                    >
                                                    {#if log.details}
                                                        <span
                                                            class="break-words opacity-80 whitespace-pre-wrap"
                                                            >{log.details}</span
                                                        >
                                                    {/if}
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/if}
                </div>
            </ScrollArea>

            <!-- Footer -->
            <div
                class="shrink-0 px-5 py-3 border-t bg-muted/10 flex items-center justify-between gap-3"
            >
                <div
                    class="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                    <CheckCircle2 class="w-3.5 h-3.5 text-emerald-500" />
                    <span>Changes saved automatically</span>
                </div>
                <Button
                    size="sm"
                    class="h-8"
                    onclick={() => (appState.settingsOpen = false)}
                >
                    Done
                </Button>
            </div>
        </div>
    </Dialog.Content>
</Dialog.Root>
