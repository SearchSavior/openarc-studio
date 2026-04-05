<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Textarea } from "$lib/components/ui/textarea";
    import { ScrollArea } from "$lib/components/ui/scroll-area";
    import { Slider } from "$lib/components/ui/slider";
    import { invoke } from "@tauri-apps/api/core";
    import { listen } from "@tauri-apps/api/event";
    import * as Dialog from "$lib/components/ui/dialog";
    import { appState } from "$lib/state.svelte.js";
    import { onMount } from "svelte";
    import {
        Send,
        Settings,
        Wrench,
        Globe,
        Blocks,
        Trash2,
        MessageSquare,
        Maximize2,
        Save,
        Sparkles,
        Loader2,
        Plus,
    } from "@lucide/svelte";
    import { marked } from "marked";
    import DOMPurify from "dompurify";

    let userMessage = $state("");
    let temperature = $state([0.7]);
    let topP = $state([0.9]);
    let topK = $state([40]);
    let maxTokens = $state([2048]);
    let repPenalty = $state([1.1]);
    let systemPrompt = $state("You are a helpful assistant...");
    let systemPromptMaximized = $state(false);
    let renderedSystemPrompt = $state("");

    let generateModalOpen = $state(false);
    let generatePrompt = $state("");
    let isGenerating = $state(false);

    onMount(() => {
        appState.addLog("info", "Chat page initialized");
    });

    $effect(() => {
        // track depend outside nested function explicit
        const contentToRender = systemPrompt;

        try {
            const rawHTML = marked.parse(contentToRender, {
                async: false,
            }) as string;

            // fix vite and cjs default export diffs
            const sanitizer =
                "sanitize" in DOMPurify
                    ? DOMPurify
                    : (DOMPurify as any).default;

            renderedSystemPrompt = sanitizer.sanitize(rawHTML, {
                FORBID_TAGS: ["img", "a"],
                FORBID_ATTR: ["href", "src"],
            });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            appState.addLog("error", "Markdown rendering error", errorMsg);
            console.error("Markdown rendering error:", err);
            renderedSystemPrompt = `<p class="text-destructive">Preview error</p>`;
        }
    });

    let activeModel = $state(""); // can be null if nothing loaded

    type Preset = {
        id: string;
        name: string;
        prompt: string;
        temp: number;
        topP: number;
        topK: number;
        maxTokens: number;
        repPenalty: number;
    };

    let presets = $state<Preset[]>([
        {
            id: "default",
            name: "Default Assistant",
            prompt: "You are a helpful AI assistant...",
            temp: 0.7,
            topP: 0.9,
            topK: 40,
            maxTokens: 2048,
            repPenalty: 1.1,
        },
        {
            id: "coding",
            name: "Coding Expert",
            prompt: "You are an expert programmer. Only output valid code and explain it briefly. Use markdown block formatting.",
            temp: 0.2,
            topP: 0.95,
            topK: 40,
            maxTokens: 4096,
            repPenalty: 1.05,
        },
        {
            id: "creative",
            name: "Creative Writer",
            prompt: "You are a creative writer. Be expressive, use vivid imagery, and don't hesitate to think outside the box.",
            temp: 0.9,
            topP: 0.9,
            topK: 60,
            maxTokens: 2048,
            repPenalty: 1.15,
        },
    ]);

    let lastLoadedPresetId = $state<string | null>(null);

    let isModified = $derived.by(() => {
        if (!lastLoadedPresetId) return true;
        const p = presets.find((p) => p.id === lastLoadedPresetId);
        if (!p) return true;
        return (
            systemPrompt !== p.prompt ||
            temperature[0] !== p.temp ||
            topP[0] !== p.topP ||
            topK[0] !== p.topK ||
            maxTokens[0] !== p.maxTokens ||
            repPenalty[0] !== p.repPenalty
        );
    });

    let selectedDropdownValue = $derived(
        isModified ? "unsaved" : lastLoadedPresetId || "unsaved",
    );

    function handlePresetChange(e: Event) {
        const target = e.target as HTMLSelectElement;
        const id = target.value;
        if (id === "unsaved") return;
        const p = presets.find((p) => p.id === id);
        if (p) {
            systemPrompt = p.prompt;
            temperature = [p.temp];
            topP = [p.topP];
            topK = [p.topK];
            maxTokens = [p.maxTokens];
            repPenalty = [p.repPenalty];
            lastLoadedPresetId = id;
        }
    }

    let savePresetModalOpen = $state(false);
    let newPresetName = $state("");

    function savePreset() {
        if (
            lastLoadedPresetId &&
            presets.some((p) => p.id === lastLoadedPresetId)
        ) {
            const idx = presets.findIndex((p) => p.id === lastLoadedPresetId);
            presets[idx] = {
                ...presets[idx],
                prompt: systemPrompt,
                temp: temperature[0],
                topP: topP[0],
                topK: topK[0],
                maxTokens: maxTokens[0],
                repPenalty: repPenalty[0],
            };
            presets = [...presets];
        } else {
            saveAsNewPreset();
        }
    }

    function saveAsNewPreset() {
        newPresetName = "";
        savePresetModalOpen = true;
    }

    function confirmSaveNewPreset() {
        if (!newPresetName.trim()) return;
        const newId = "preset_" + Date.now();
        presets = [
            ...presets,
            {
                id: newId,
                name: newPresetName.trim(),
                prompt: systemPrompt,
                temp: temperature[0],
                topP: topP[0],
                topK: topK[0],
                maxTokens: maxTokens[0],
                repPenalty: repPenalty[0],
            },
        ];
        lastLoadedPresetId = newId;
        savePresetModalOpen = false;
    }

    function deletePreset() {
        if (!lastLoadedPresetId) return;
        presets = presets.filter((p) => p.id !== lastLoadedPresetId);
        lastLoadedPresetId = null;
    }

    type Message = {
        role: "user" | "assistant";
        content: string;
        model?: string;
        tokens?: number;
        tps?: number;
    };

    type ChatSession = {
        id: string;
        title: string;
        date: string;
    };

    let chatSessions = $state<ChatSession[]>([
        { id: "1", title: "Understanding OpenVINO", date: "Today" },
        { id: "2", title: "Rust vs C++ performance", date: "Today" },
        { id: "3", title: "Write a snake game", date: "Yesterday" },
        { id: "4", title: "Local LLM comparison", date: "Yesterday" },
        { id: "5", title: "React context tutorial", date: "Previous 7 Days" },
        {
            id: "6",
            title: "Regex for email validation",
            date: "Previous 7 Days",
        },
        {
            id: "7",
            title: "Svelte 5 runes explanation",
            date: "Previous 7 Days",
        },
    ]);

    let messages = $state<Message[]>([
        {
            role: "assistant",
            content: "Welcome to OpenArc Studio! How can I help you today?",
            model: "System",
        },
        {
            role: "user",
            content: "Can you explain what OpenVINO is?",
        },
        {
            role: "assistant",
            content:
                "OpenVINO is an open-source toolkit for optimizing and deploying AI inference. It's developed by Intel and is designed to boost deep learning performance in computer vision, automatic speech recognition, natural language processing and other common tasks. It supports execution on various Intel hardware including CPUs, integrated GPUs, and discrete GPUs (like ARC), as well as NPUs.",
            model: "Llama-3-8B-Instruct.xml",
            tokens: 65,
            tps: 42.4,
        },
    ]);

    async function sendMessage() {
        if (!userMessage.trim() || !activeModel) return;

        const userMsgContent = userMessage;
        appState.addLog(
            "v1",
            "Chat submission started",
            `User message: ${userMsgContent.substring(0, 50)}...`,
        );
        messages = [
            ...messages,
            {
                role: "user",
                content: userMsgContent,
            },
        ];

        const msgIndex = messages.length;
        messages = [
            ...messages,
            {
                role: "assistant",
                content: "",
                model: activeModel,
                tokens: 0,
            },
        ];

        userMessage = "";

        const payload = {
            model: activeModel,
            messages: [
                { role: "system", content: systemPrompt },
                ...messages
                    .slice(0, -1)
                    .map((m) => ({ role: m.role, content: m.content })),
            ],
            temperature: temperature[0],
            top_p: topP[0],
            max_tokens: maxTokens[0],
            presence_penalty: repPenalty[0],
            stream: true,
        };

        const unlistenChunk = await listen("chat-chunk", (event: any) => {
            const chunk = event.payload;
            if (
                chunk.choices &&
                chunk.choices.length > 0 &&
                chunk.choices[0].delta &&
                chunk.choices[0].delta.content
            ) {
                messages[msgIndex].content += chunk.choices[0].delta.content;
            }
        });

        const unlistenError = await listen("chat-error", (event: any) => {
            appState.addLog(
                "error",
                "Chat generation error",
                String(event.payload),
            );
            messages[msgIndex].content += "\\n[Error: " + event.payload + "]";
            unlistenChunk();
            unlistenError();
            unlistenDone();
        });

        const unlistenDone = await listen("chat-done", () => {
            appState.addLog("v2", "Chat generation completed");
            unlistenChunk();
            unlistenError();
            unlistenDone();
        });

        try {
            appState.addLog(
                "v2",
                "Starting chat inference stream",
                JSON.stringify(payload, null, 2),
            );
            await invoke("chat_inference_stream", { req: payload });
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            appState.addLog("error", "Failed to start chat stream", errorMsg);
            messages[msgIndex].content +=
                "\\n[Failed to start stream: " + e + "]";
            unlistenChunk();
            unlistenError();
            unlistenDone();
        }
    }

    function deleteChat(id: string, event: Event) {
        event.stopPropagation();
        chatSessions = chatSessions.filter((session) => session.id !== id);
    }

    async function handleGenerateSystemPrompt() {
        if (!generatePrompt.trim() || isGenerating) return;

        isGenerating = true;
        systemPrompt = "";
        generateModalOpen = false; // hide modal to watch stream

        const mockResponse = `You are an expert AI assistant specialized in ${generatePrompt}. \n\n### Core Directives\n1. Be concise and accurate.\n2. Always explain your reasoning briefly.\n3. Provide valid code in markdown blocks where necessary.\n\n### Tone\nKeep the tone helpful, direct, and slightly whimsical.`;
        const tokens = mockResponse.split(/( )/);

        for (const token of tokens) {
            systemPrompt += token;
            await new Promise((r) => setTimeout(r, 20));
        }

        isGenerating = false;
        generatePrompt = "";
    }
</script>

<div class="flex h-full w-full overflow-hidden bg-background">
    {#if appState.leftPanelOpen}
        <aside
            class="w-[260px] shrink-0 border-r bg-muted/20 flex flex-col h-full transition-all duration-200"
        >
            <div class="p-4 border-b font-bold text-lg">Chat Sessions</div>
            <ScrollArea class="flex-1 p-2">
                <Button variant="default" class="w-full justify-start mb-4">
                    <MessageSquare class="w-4 h-4 mr-2" />
                    New Chat
                </Button>

                <div class="space-y-6 pb-4">
                    <div class="space-y-1">
                        <div
                            class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2"
                        >
                            Recent
                        </div>
                        {#each chatSessions as session}
                            <div class="group relative flex items-center">
                                <Button
                                    variant="ghost"
                                    class="w-full justify-start text-muted-foreground text-sm pr-10"
                                >
                                    <span class="truncate">{session.title}</span
                                    >
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="absolute right-1 w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onclick={(e) => deleteChat(session.id, e)}
                                    title="Delete chat"
                                >
                                    <Trash2
                                        class="w-4 h-4 text-muted-foreground hover:text-destructive"
                                    />
                                </Button>
                            </div>
                        {/each}
                    </div>
                </div>
            </ScrollArea>
        </aside>
    {/if}

    <main class="flex-1 h-full flex flex-col min-w-0">
        <header
            class="h-14 border-b flex items-center justify-between px-4 shadow-sm bg-background"
        >
            <div class="flex flex-col">
                <span class="font-medium">Current Chat</span>
                {#if activeModel}
                    <span
                        class="text-xs text-muted-foreground flex items-center gap-1"
                    >
                        <div class="w-2 h-2 rounded-full bg-green-500"></div>
                        {activeModel}
                    </span>
                {:else}
                    <span
                        class="text-xs text-destructive flex items-center gap-1"
                    >
                        <div class="w-2 h-2 rounded-full bg-destructive"></div>
                        No model loaded
                    </span>
                {/if}
            </div>
        </header>

        <ScrollArea class="flex-1 p-4 bg-background">
            <div class="max-w-3xl mx-auto space-y-6 pb-4">
                {#each messages as msg}
                    <div
                        class="flex flex-col {msg.role === 'user'
                            ? 'items-end'
                            : 'items-start'}"
                    >
                        {#if msg.role === "assistant"}
                            <div class="flex items-center gap-2 mb-1 pl-1">
                                <span
                                    class="text-xs font-semibold text-muted-foreground"
                                    >{msg.model || "Assistant"}</span
                                >
                                {#if msg.tps || msg.tokens}
                                    <div
                                        class="flex gap-2 text-[10px] text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-sm"
                                    >
                                        {#if msg.tokens}<span
                                                >{msg.tokens} tokens</span
                                            >{/if}
                                        {#if msg.tps}<span
                                                >{msg.tps.toFixed(1)} t/s</span
                                            >{/if}
                                    </div>
                                {/if}
                            </div>
                        {/if}
                        <div
                            class="p-4 rounded-lg {msg.role === 'user'
                                ? 'bg-primary text-primary-foreground ml-12'
                                : 'bg-muted/50 mr-12'} text-sm leading-relaxed"
                        >
                            {msg.content}
                        </div>
                    </div>
                {/each}
            </div>
        </ScrollArea>

        <div class="p-4 border-t bg-background">
            <div class="max-w-3xl mx-auto">
                <div
                    class="relative rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring"
                >
                    <Textarea
                        bind:value={userMessage}
                        placeholder={activeModel
                            ? "Type a message..."
                            : "Load a model to start chatting..."}
                        class="min-h-[80px] border-0 focus-visible:ring-0 resize-none pb-12 shadow-none"
                        disabled={!activeModel}
                        onkeydown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage();
                            }
                        }}
                    />
                    <div
                        class="absolute bottom-2 left-2 flex items-center gap-1"
                    >
                        <Button
                            variant="ghost"
                            size="icon"
                            class="h-8 w-8 text-muted-foreground"
                            disabled={!activeModel}
                            title="Web Search"
                        >
                            <Globe class="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            class="h-8 w-8 text-muted-foreground"
                            disabled={!activeModel}
                            title="Use Tools"
                        >
                            <Wrench class="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            class="h-8 w-8 text-muted-foreground"
                            disabled={!activeModel}
                            title="MCP Servers"
                        >
                            <Blocks class="w-4 h-4" />
                        </Button>
                    </div>
                    <Button
                        class="absolute bottom-2 right-2 h-8 w-8 rounded-md"
                        size="icon"
                        disabled={!activeModel || !userMessage.trim()}
                        onclick={sendMessage}
                    >
                        <Send class="w-4 h-4" />
                    </Button>
                </div>
                <div class="mt-2 text-center text-xs text-muted-foreground">
                    AI models can make mistakes. Check important info.
                </div>
            </div>
        </div>
    </main>

    {#if appState.rightPanelOpen}
        <aside
            class="w-[300px] shrink-0 border-l bg-muted/10 flex flex-col h-full transition-all duration-200"
        >
            <div class="p-4 border-b flex justify-between items-center">
                <span class="font-bold text-lg">Settings</span>
            </div>

            <ScrollArea class="flex-1 p-4">
                <div class="space-y-6 pb-4">
                    <div class="space-y-2">
                        <div class="flex justify-between items-center">
                            <label
                                for="preset-select"
                                class="text-sm font-medium">Preset</label
                            >
                            <div class="flex gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-6 w-6 text-muted-foreground"
                                    onclick={savePreset}
                                    title="Save/Update Preset"
                                >
                                    <Save class="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-6 w-6 text-muted-foreground"
                                    onclick={saveAsNewPreset}
                                    title="Save as New"
                                >
                                    <Plus class="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-6 w-6 text-muted-foreground"
                                    onclick={deletePreset}
                                    disabled={!lastLoadedPresetId}
                                    title="Delete Preset"
                                >
                                    <Trash2 class="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>
                        <select
                            id="preset-select"
                            value={selectedDropdownValue}
                            onchange={handlePresetChange}
                            class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        >
                            <option value="unsaved" hidden
                                >Unsaved Preset</option
                            >
                            {#each presets as preset}
                                <option value={preset.id}>{preset.name}</option>
                            {/each}
                        </select>
                    </div>

                    <div class="space-y-2">
                        <div class="flex justify-between items-center">
                            <label
                                for="system-prompt"
                                class="text-sm font-medium">System Prompt</label
                            >
                            <Button
                                variant="ghost"
                                size="icon"
                                class="h-6 w-6 text-muted-foreground"
                                onclick={() => (systemPromptMaximized = true)}
                                title="Maximize"
                            >
                                <Maximize2 class="w-3.5 h-3.5" />
                            </Button>
                        </div>
                        <div class="relative">
                            <Textarea
                                id="system-prompt"
                                bind:value={systemPrompt}
                                placeholder="You are a helpful assistant..."
                                class="h-32 resize-none text-sm"
                            />
                        </div>
                    </div>

                    <div class="space-y-6 pt-2">
                        <div class="space-y-3">
                            <div class="flex justify-between">
                                <label
                                    for="temp-slider"
                                    class="text-sm font-medium"
                                    >Temperature</label
                                >
                                <span class="text-sm text-muted-foreground"
                                    >{temperature[0]}</span
                                >
                            </div>
                            <Slider
                                id="temp-slider"
                                type="multiple"
                                bind:value={temperature}
                                max={2}
                                step={0.1}
                            />
                        </div>

                        <div class="space-y-3">
                            <div class="flex justify-between">
                                <label
                                    for="topp-slider"
                                    class="text-sm font-medium">Top P</label
                                >
                                <span class="text-sm text-muted-foreground"
                                    >{topP[0]}</span
                                >
                            </div>
                            <Slider
                                id="topp-slider"
                                type="multiple"
                                bind:value={topP}
                                max={1}
                                step={0.01}
                            />
                        </div>

                        <div class="space-y-3">
                            <div class="flex justify-between">
                                <label
                                    for="topk-slider"
                                    class="text-sm font-medium">Top K</label
                                >
                                <span class="text-sm text-muted-foreground"
                                    >{topK[0]}</span
                                >
                            </div>
                            <Slider
                                id="topk-slider"
                                type="multiple"
                                bind:value={topK}
                                max={100}
                                step={1}
                            />
                        </div>

                        <div class="space-y-3">
                            <div class="flex justify-between">
                                <label
                                    for="maxtokens-slider"
                                    class="text-sm font-medium"
                                    >Max Tokens</label
                                >
                                <span class="text-sm text-muted-foreground"
                                    >{maxTokens[0]}</span
                                >
                            </div>
                            <Slider
                                id="maxtokens-slider"
                                type="multiple"
                                bind:value={maxTokens}
                                max={8192}
                                step={128}
                            />
                        </div>

                        <div class="space-y-3">
                            <div class="flex justify-between">
                                <label
                                    for="reppenalty-slider"
                                    class="text-sm font-medium"
                                    >Repetition Penalty</label
                                >
                                <span class="text-sm text-muted-foreground"
                                    >{repPenalty[0]}</span
                                >
                            </div>
                            <Slider
                                id="reppenalty-slider"
                                type="multiple"
                                bind:value={repPenalty}
                                min={1}
                                max={2}
                                step={0.05}
                            />
                        </div>
                    </div>
                </div>
            </ScrollArea>
        </aside>
    {/if}
</div>

<Dialog.Root bind:open={systemPromptMaximized}>
    <Dialog.Content
        class="sm:max-w-none max-w-none w-[calc(100vw-6rem)] h-[calc(100vh-10rem)] !mt-6 flex flex-col gap-6 rounded-xl border p-6"
    >
        <Dialog.Header>
            <Dialog.Title>System Prompt Editor</Dialog.Title>
            <Dialog.Description>
                Edit your system prompt on the left and see the rendered
                markdown preview on the right.
            </Dialog.Description>
        </Dialog.Header>

        <div class="flex-1 grid grid-cols-2 gap-6 min-h-0 overflow-hidden">
            <div class="flex flex-col gap-2 h-full">
                <div class="flex justify-between items-center h-8">
                    <label
                        for="maximized-system-prompt"
                        class="text-sm font-medium">Edit Content</label
                    >
                    <Button
                        variant="outline"
                        size="sm"
                        class="h-8"
                        onclick={() => (generateModalOpen = true)}
                    >
                        <Sparkles class="w-4 h-4 mr-2 text-primary" />
                        Generate with AI
                    </Button>
                </div>
                <Textarea
                    id="maximized-system-prompt"
                    bind:value={systemPrompt}
                    class="flex-1 resize-none font-mono text-sm leading-relaxed p-4"
                    placeholder="Enter system prompt here..."
                />
            </div>

            <div class="flex flex-col gap-2 h-full min-h-0">
                <div class="flex items-center h-8">
                    <span class="text-sm font-medium">Markdown Preview</span>
                </div>
                <div
                    class="flex-1 rounded-md border bg-muted/30 overflow-hidden relative"
                >
                    <ScrollArea class="h-full w-full p-4 absolute inset-0">
                        <div
                            class="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-blockquote:not-italic prose-blockquote:border-l-primary prose-blockquote:bg-muted/50 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-sm [&_blockquote_p::before]:content-none [&_blockquote_p::after]:content-none"
                        >
                            {@html renderedSystemPrompt}
                        </div>
                    </ScrollArea>
                </div>
            </div>
        </div>
    </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={generateModalOpen}>
    <Dialog.Content class="sm:max-w-md">
        <Dialog.Header>
            <Dialog.Title>Generate System Prompt</Dialog.Title>
            <Dialog.Description>
                Describe the persona, rules, and behavior you want the AI to
                follow.
            </Dialog.Description>
        </Dialog.Header>
        <div class="py-4">
            <Textarea
                bind:value={generatePrompt}
                placeholder="e.g., A pirate captain who gives coding advice..."
                class="min-h-[120px] resize-none"
                onkeydown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleGenerateSystemPrompt();
                    }
                }}
            />
        </div>
        <Dialog.Footer>
            <Button
                variant="outline"
                onclick={() => (generateModalOpen = false)}>Cancel</Button
            >
            <Button
                disabled={!generatePrompt.trim() || isGenerating}
                onclick={handleGenerateSystemPrompt}
            >
                {#if isGenerating}
                    <Loader2 class="w-4 h-4 mr-2 animate-spin" />
                {:else}
                    <Sparkles class="w-4 h-4 mr-2" />
                {/if}
                Generate
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={savePresetModalOpen}>
    <Dialog.Content class="sm:max-w-[425px]">
        <Dialog.Header>
            <Dialog.Title>Save New Preset</Dialog.Title>
            <Dialog.Description>
                Enter a name for your new inference preset.
            </Dialog.Description>
        </Dialog.Header>
        <div class="grid gap-4 py-4">
            <div class="space-y-2">
                <label for="preset-name" class="text-sm font-medium"
                    >Preset Name</label
                >
                <input
                    id="preset-name"
                    bind:value={newPresetName}
                    class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="My Custom Preset"
                    onkeydown={(e) => {
                        if (e.key === "Enter") confirmSaveNewPreset();
                    }}
                />
            </div>
        </div>
        <Dialog.Footer>
            <Button
                variant="outline"
                onclick={() => (savePresetModalOpen = false)}>Cancel</Button
            >
            <Button
                disabled={!newPresetName.trim()}
                onclick={confirmSaveNewPreset}>Save</Button
            >
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
