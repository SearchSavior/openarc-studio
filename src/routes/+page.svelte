<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Textarea } from "$lib/components/ui/textarea";
    import { ScrollArea } from "$lib/components/ui/scroll-area";
    import { Slider } from "$lib/components/ui/slider";
    import { Switch } from "$lib/components/ui/switch";
    import { invoke } from "@tauri-apps/api/core";
    import { listen } from "@tauri-apps/api/event";
    import * as Dialog from "$lib/components/ui/dialog";
    import { appState } from "$lib/state.svelte.js";
    import { chatStore, DEFAULT_SETTINGS } from "$lib/chat.svelte.js";
    import { onMount } from "svelte";
    import {
        Send,
        Square,
        Wrench,
        Globe,
        Blocks,
        Trash2,
        MessageSquare,
        MessageSquarePlus,
        Maximize2,
        Save,
        Sparkles,
        Loader2,
        Plus,
        Pencil,
        ChevronDown,
        ChevronRight,
        Brain,
        Check,
        X as XIcon,
        Zap,
        MessagesSquare,
        SlidersHorizontal,
        Cpu,
        Gauge,
        Bot,
        User as UserIcon,
        AlertCircle,
        CheckCircle2,
    } from "@lucide/svelte";
    import { getArchAccent } from "$lib/model-types";
    import { tick } from "svelte";
    import { marked } from "marked";
    import DOMPurify from "dompurify";
    import hljs from "highlight.js/lib/common";

    function escapeHtml(s: string): string {
        return s.replace(
            /[&<>"']/g,
            (c) =>
                ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;",
                })[c] || c,
        );
    }

    const COPY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
    const CHECK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    let markedConfigured = false;
    function ensureMarkedConfigured() {
        if (markedConfigured) return;
        markedConfigured = true;
        marked.use({
            renderer: {
                code({ text, lang }: { text: string; lang?: string }) {
                    const language = (lang || "").toLowerCase().trim();
                    let highlighted = "";
                    try {
                        if (language && hljs.getLanguage(language)) {
                            highlighted = hljs.highlight(text, {
                                language,
                                ignoreIllegals: true,
                            }).value;
                        } else {
                            highlighted = escapeHtml(text);
                        }
                    } catch {
                        highlighted = escapeHtml(text);
                    }
                    const label = language || "plain";
                    const langClass = language
                        ? ` language-${escapeHtml(language)}`
                        : "";
                    return `<div class="chat-code"><div class="chat-code-header"><span class="chat-code-lang">${escapeHtml(label)}</span><button type="button" class="chat-code-copy" data-copy-code title="Copy code" aria-label="Copy code">${COPY_ICON_SVG}<span class="chat-code-copy-label">Copy</span></button></div><pre><code class="hljs${langClass}">${highlighted}</code></pre></div>`;
                },
            },
        });
    }

    let userMessage = $state("");
    let systemPromptMaximized = $state(false);
    let renderedSystemPrompt = $state("");

    let generateModalOpen = $state(false);
    let generatePrompt = $state("");
    let isGenerating = $state(false);

    let savePresetModalOpen = $state(false);
    let newPresetName = $state("");

    let renameModalOpen = $state(false);
    let renameDraft = $state("");

    let isStreaming = $state(false);
    let scrollViewport = $state<HTMLElement | null>(null);
    let thinkCollapsed = $state<Record<string, boolean>>({});
    let editingIndex = $state<number | null>(null);
    let editDraft = $state("");

    type MessagePart =
        | { type: "text"; content: string }
        | { type: "think"; content: string; unclosed: boolean };

    function parseThinkParts(content: string): MessagePart[] {
        const parts: MessagePart[] = [];
        const OPEN = "<think>";
        const CLOSE = "</think>";
        let i = 0;

        const firstOpen = content.indexOf(OPEN);
        const firstClose = content.indexOf(CLOSE);
        if (
            firstClose !== -1 &&
            (firstOpen === -1 || firstClose < firstOpen)
        ) {
            parts.push({
                type: "think",
                content: content.slice(0, firstClose),
                unclosed: false,
            });
            i = firstClose + CLOSE.length;
        }

        while (i < content.length) {
            const openIdx = content.indexOf(OPEN, i);
            if (openIdx === -1) {
                if (i < content.length)
                    parts.push({ type: "text", content: content.slice(i) });
                break;
            }
            if (openIdx > i)
                parts.push({ type: "text", content: content.slice(i, openIdx) });
            const afterOpen = openIdx + OPEN.length;
            const closeIdx = content.indexOf(CLOSE, afterOpen);
            if (closeIdx === -1) {
                parts.push({
                    type: "think",
                    content: content.slice(afterOpen),
                    unclosed: true,
                });
                break;
            }
            parts.push({
                type: "think",
                content: content.slice(afterOpen, closeIdx),
                unclosed: false,
            });
            i = closeIdx + CLOSE.length;
        }
        return parts;
    }

    function stripThink(content: string): string {
        let c = content;
        const firstOpen = c.indexOf("<think>");
        const firstClose = c.indexOf("</think>");
        if (
            firstClose !== -1 &&
            (firstOpen === -1 || firstClose < firstOpen)
        ) {
            c = c.slice(firstClose + "</think>".length);
        }
        return c
            .replace(/<think>[\s\S]*?<\/think>/g, "")
            .replace(/<think>[\s\S]*$/, "")
            .trimStart();
    }

    function mdToHtml(text: string): string {
        if (!text) return "";
        ensureMarkedConfigured();
        try {
            const raw = marked.parse(text, {
                async: false,
                gfm: true,
                breaks: true,
            }) as string;
            const sanitizer =
                "sanitize" in DOMPurify ? DOMPurify : (DOMPurify as any).default;
            return sanitizer.sanitize(raw, {
                FORBID_TAGS: ["iframe", "script", "style"],
                FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
                ADD_ATTR: ["target", "rel", "data-copy-code"],
            });
        } catch {
            return escapeHtml(text);
        }
    }

    type MdSegment = { id: string; text: string; closed: boolean };

    function segmentMarkdown(text: string): MdSegment[] {
        const segments: MdSegment[] = [];
        let i = 0;
        let inFence = false;
        let segStart = 0;
        while (i < text.length) {
            if (
                text[i] === "`" &&
                text[i + 1] === "`" &&
                text[i + 2] === "`"
            ) {
                inFence = !inFence;
                i += 3;
                continue;
            }
            if (!inFence && text[i] === "\n" && text[i + 1] === "\n") {
                const segText = text.slice(segStart, i);
                if (segText.length > 0) {
                    segments.push({
                        id: `s${segStart}`,
                        text: segText,
                        closed: true,
                    });
                }
                i += 2;
                while (i < text.length && text[i] === "\n") i++;
                segStart = i;
                continue;
            }
            i++;
        }
        if (segStart < text.length) {
            segments.push({
                id: `s${segStart}`,
                text: text.slice(segStart),
                closed: !inFence,
            });
        }
        return segments;
    }

    const mdSegmentCache = new Map<string, string>();
    const MD_CACHE_MAX = 2000;

    function renderMarkdownSegments(
        text: string,
        scope: string,
    ): { id: string; html: string }[] {
        const segs = segmentMarkdown(text);
        const out: { id: string; html: string }[] = [];
        for (let i = 0; i < segs.length; i++) {
            const s = segs[i];
            const isLast = i === segs.length - 1;
            if (s.closed && !isLast) {
                const key = `${scope}:${s.id}:${s.text.length}`;
                let html = mdSegmentCache.get(key);
                if (html === undefined) {
                    html = mdToHtml(s.text);
                    mdSegmentCache.set(key, html);
                    if (mdSegmentCache.size > MD_CACHE_MAX) {
                        const firstKey = mdSegmentCache.keys().next().value;
                        if (firstKey !== undefined)
                            mdSegmentCache.delete(firstKey);
                    }
                }
                out.push({ id: s.id, html });
            } else {
                out.push({ id: s.id, html: mdToHtml(s.text) });
            }
        }
        return out;
    }

    function handleBubbleClick(e: MouseEvent) {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const btn = target.closest(
            "[data-copy-code]",
        ) as HTMLButtonElement | null;
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const block = btn.closest(".chat-code");
        const codeEl = block?.querySelector("pre code");
        if (!codeEl) return;
        const text = codeEl.textContent ?? "";
        navigator.clipboard
            .writeText(text)
            .then(() => {
                const label = btn.querySelector(".chat-code-copy-label");
                const iconWrap = btn;
                const prevHtml = btn.innerHTML;
                btn.classList.add("is-copied");
                btn.innerHTML = `${CHECK_ICON_SVG}<span class="chat-code-copy-label">Copied</span>`;
                window.setTimeout(() => {
                    btn.classList.remove("is-copied");
                    btn.innerHTML = prevHtml;
                    void label;
                    void iconWrap;
                }, 1400);
            })
            .catch((err) => {
                appState.addLog(
                    "error",
                    "Failed to copy code",
                    err instanceof Error ? err.message : String(err),
                );
            });
    }

    function scrollToBottom(smooth = false) {
        if (!scrollViewport) return;
        scrollViewport.scrollTo({
            top: scrollViewport.scrollHeight,
            behavior: smooth ? "smooth" : "auto",
        });
    }

    onMount(() => {
        appState.addLog("info", "Chat page initialized");
    });

    $effect(() => {
        if (!appState.settings.autoScroll) return;
        const msgs = chatStore.activeSession?.messages ?? [];
        let sig = msgs.length + ":";
        for (const m of msgs) sig += m.content.length + ",";
        // read sig to register the reactive dependency
        void sig;
        tick().then(() => scrollToBottom(false));
    });

    $effect(() => {
        // jump to bottom when switching sessions
        void chatStore.activeSessionId;
        tick().then(() => scrollToBottom(false));
    });

    const activeSession = $derived(chatStore.activeSession);
    const settings = $derived(activeSession?.settings ?? DEFAULT_SETTINGS);
    const messages = $derived(activeSession?.messages ?? []);
    const activeModel = $derived(appState.activeLlmModel);
    const lastMessageIsUser = $derived(
        messages.length > 0 && messages[messages.length - 1].role === "user",
    );
    function startEdit(index: number, current: string) {
        editingIndex = index;
        editDraft = current;
    }

    function cancelEdit() {
        editingIndex = null;
        editDraft = "";
    }

    function saveEdit() {
        if (editingIndex === null) return;
        const sid = chatStore.activeSessionId;
        if (!sid) return;
        chatStore.updateMessageContentIn(sid, editingIndex, editDraft);
        editingIndex = null;
        editDraft = "";
    }

    $effect(() => {
        const contentToRender = settings.systemPrompt;
        try {
            const rawHTML = marked.parse(contentToRender, { async: false }) as string;
            const sanitizer =
                "sanitize" in DOMPurify ? DOMPurify : (DOMPurify as any).default;
            renderedSystemPrompt = sanitizer.sanitize(rawHTML, {
                FORBID_TAGS: ["img", "a"],
                FORBID_ATTR: ["href", "src"],
            });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            appState.addLog("error", "Markdown rendering error", errorMsg);
            renderedSystemPrompt = `<p class="text-destructive">Preview error</p>`;
        }
    });

    const isPresetModified = $derived.by(() => {
        if (!settings.presetId) return true;
        const p = chatStore.presets.find((p) => p.id === settings.presetId);
        if (!p) return true;
        return (
            settings.systemPrompt !== p.prompt ||
            settings.temperature !== p.temp ||
            settings.topP !== p.topP ||
            settings.topK !== p.topK ||
            settings.maxTokens !== p.maxTokens ||
            settings.repPenalty !== p.repPenalty
        );
    });

    const selectedPresetDropdown = $derived(
        isPresetModified ? "unsaved" : settings.presetId || "unsaved",
    );

    function handlePresetChange(e: Event) {
        const target = e.target as HTMLSelectElement;
        const id = target.value;
        if (id === "unsaved") return;
        chatStore.applyPreset(id);
    }

    function savePreset() {
        if (!activeSession) return;
        if (
            settings.presetId &&
            chatStore.presets.some((p) => p.id === settings.presetId)
        ) {
            const existing = chatStore.presets.find((p) => p.id === settings.presetId)!;
            chatStore.upsertPreset({
                ...existing,
                prompt: settings.systemPrompt,
                temp: settings.temperature,
                topP: settings.topP,
                topK: settings.topK,
                maxTokens: settings.maxTokens,
                repPenalty: settings.repPenalty,
            });
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
        const id = "preset_" + Date.now().toString(36);
        chatStore.upsertPreset({
            id,
            name: newPresetName.trim(),
            prompt: settings.systemPrompt,
            temp: settings.temperature,
            topP: settings.topP,
            topK: settings.topK,
            maxTokens: settings.maxTokens,
            repPenalty: settings.repPenalty,
        });
        chatStore.updateActiveSettings({ presetId: id });
        savePresetModalOpen = false;
    }

    function deletePreset() {
        if (!settings.presetId) return;
        chatStore.deletePreset(settings.presetId);
        chatStore.updateActiveSettings({ presetId: null });
    }

    function newChat() {
        chatStore.createSession();
    }

    function selectChat(id: string) {
        chatStore.selectSession(id);
    }

    async function deleteChat(id: string, event: Event) {
        event.stopPropagation();
        await chatStore.deleteSession(id);
    }

    function openRenameModal() {
        if (!activeSession) return;
        renameDraft = activeSession.title;
        renameModalOpen = true;
    }

    function confirmRename() {
        if (!renameDraft.trim()) return;
        chatStore.renameActive(renameDraft.trim());
        renameModalOpen = false;
    }

    async function runInference(targetId: string) {
        if (!activeModel || isStreaming) return;
        const currentSession = chatStore.sessions.find(
            (s) => s.id === targetId,
        );
        if (!currentSession) return;

        const priorSnapshot = $state.snapshot(currentSession.messages).map(
            (m: any) => ({ role: m.role, content: m.content }),
        );

        const assistantIdx = chatStore.appendMessageTo(targetId, {
            role: "assistant",
            content: "",
            model: activeModel,
            tokens: 0,
        });

        currentSession.model = activeModel;

        const payload = {
            model: activeModel,
            messages: [
                { role: "system", content: settings.systemPrompt },
                ...priorSnapshot,
            ],
            temperature: settings.temperature,
            top_p: settings.topP,
            max_tokens: settings.maxTokens,
            presence_penalty: settings.repPenalty,
            stream: true,
        };

        appState.addLog(
            "v4",
            `Outbound chat payload (${payload.messages.length} messages)`,
            JSON.stringify(payload.messages, null, 2),
        );

        isStreaming = true;
        const startedAt = Date.now();
        let tokensReceived = 0;

        const unlistenChunk = await listen("chat-chunk", (event: any) => {
            const chunk = event.payload;
            if (
                chunk.choices &&
                chunk.choices.length > 0 &&
                chunk.choices[0].delta &&
                chunk.choices[0].delta.content
            ) {
                const raw = chunk.choices[0].delta.content as string;
                const delta = raw.replace(/\uFFFD/g, "");
                if (raw !== delta) {
                    appState.addLog(
                        "v3",
                        "Stripped U+FFFD from streaming delta",
                        `raw len=${raw.length}, cleaned len=${delta.length}`,
                    );
                }
                if (delta) {
                    chatStore.appendToMessageIn(
                        targetId,
                        assistantIdx,
                        delta,
                    );
                }
                tokensReceived += 1;
            }
        });

        const finish = () => {
            const elapsed = (Date.now() - startedAt) / 1000;
            const tps = elapsed > 0 ? tokensReceived / elapsed : 0;
            chatStore.patchMessageIn(targetId, assistantIdx, {
                tokens: tokensReceived,
                tps,
            });
            isStreaming = false;
            unlistenChunk();
            unlistenError();
            unlistenDone();
        };

        const unlistenError = await listen("chat-error", (event: any) => {
            appState.addLog(
                "error",
                "Chat generation error",
                String(event.payload),
            );
            chatStore.appendToMessageIn(
                targetId,
                assistantIdx,
                `\n[Error: ${event.payload}]`,
            );
            finish();
        });

        const unlistenDone = await listen("chat-done", () => {
            appState.addLog("v2", "Chat generation completed");
            finish();
        });

        try {
            appState.addLog("v2", "Starting chat inference stream");
            await invoke("chat_inference_stream", { req: payload });
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            appState.addLog("error", "Failed to start chat stream", errorMsg);
            chatStore.appendToMessageIn(
                targetId,
                assistantIdx,
                `\n[Failed to start stream: ${errorMsg}]`,
            );
            finish();
        }
    }

    async function sendMessage() {
        if (!userMessage.trim() || !activeModel || isStreaming) return;
        if (!chatStore.activeSession) {
            chatStore.createSession();
        }
        const targetSession = chatStore.activeSession;
        if (!targetSession) return;
        const targetId = targetSession.id;

        const userMsgContent = userMessage;
        userMessage = "";

        appState.addLog(
            "v1",
            "Chat submission started",
            `User message: ${userMsgContent.substring(0, 50)}`,
        );

        const isFirstUserMessage =
            targetSession.title === "New Chat" &&
            !targetSession.messages.some((m) => m.role === "user");

        chatStore.appendMessageTo(targetId, {
            role: "user",
            content: userMsgContent,
        });

        if (isFirstUserMessage && activeModel) {
            chatStore
                .generateTitleForSession(targetId, userMsgContent, activeModel)
                .catch(() => {});
        }

        await runInference(targetId);
    }

    async function respondWithAI() {
        if (!activeModel || isStreaming) return;
        const targetId = chatStore.activeSessionId;
        if (!targetId) return;
        appState.addLog("v1", "Respond-with-AI triggered");
        await runInference(targetId);
    }

    async function cancelStream() {
        if (!isStreaming) return;
        appState.addLog("v1", "Cancelling in-flight inference");
        try {
            await invoke("cancel_chat_inference");
        } catch (e) {
            appState.addLog(
                "error",
                "Failed to cancel inference",
                e instanceof Error ? e.message : String(e),
            );
        }
    }

    async function handleGenerateSystemPrompt() {
        if (!generatePrompt.trim() || isGenerating || !activeSession) return;

        isGenerating = true;
        chatStore.updateActiveSettings({ systemPrompt: "" });
        generateModalOpen = false;

        const mockResponse = `You are an expert AI assistant specialized in ${generatePrompt}. \n\n### Core Directives\n1. Be concise and accurate.\n2. Always explain your reasoning briefly.\n3. Provide valid code in markdown blocks where necessary.\n\n### Tone\nKeep the tone helpful, direct, and slightly whimsical.`;
        const tokens = mockResponse.split(/( )/);

        let buffer = "";
        for (const token of tokens) {
            buffer += token;
            chatStore.updateActiveSettings({ systemPrompt: buffer });
            await new Promise((r) => setTimeout(r, 20));
        }

        isGenerating = false;
        generatePrompt = "";
    }
</script>

<div class="flex h-full w-full overflow-hidden bg-background">
    {#if appState.leftPanelOpen}
        <aside
            class="w-[300px] shrink-0 border-r bg-muted/10 flex flex-col h-full overflow-hidden"
        >
            <div
                class="shrink-0 px-4 pt-4 pb-3 border-b bg-gradient-to-b from-muted/30 to-transparent"
            >
                <div class="flex items-center gap-2.5 mb-3">
                    <div
                        class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
                    >
                        <MessagesSquare class="w-4 h-4 text-primary" />
                    </div>
                    <div class="min-w-0">
                        <div
                            class="font-bold text-sm tracking-tight leading-tight"
                        >
                            Chat sessions
                        </div>
                        <div
                            class="text-[11px] text-muted-foreground leading-tight mt-0.5"
                        >
                            {chatStore.sessions.length} chat{chatStore.sessions.length === 1 ? "" : "s"}
                        </div>
                    </div>
                </div>
                <Button
                    variant="default"
                    class="w-full justify-start h-9 gap-2"
                    onclick={newChat}
                >
                    <MessageSquarePlus class="w-4 h-4" />
                    New chat
                </Button>
            </div>

            <ScrollArea class="flex-1 min-h-0">
                <div class="p-3 space-y-4 pb-6">
                    {#if chatStore.sessions.length === 0}
                        <div
                            class="flex flex-col items-center text-center px-3 py-10"
                        >
                            <div
                                class="w-12 h-12 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center mb-3"
                            >
                                <MessageSquare
                                    class="w-5 h-5 text-primary/50"
                                />
                            </div>
                            <p class="text-xs font-semibold text-foreground">
                                No chats yet
                            </p>
                            <p
                                class="text-[11px] text-muted-foreground mt-1 leading-snug"
                            >
                                Start a new chat to begin the conversation.
                            </p>
                        </div>
                    {:else}
                        {#each chatStore.groupedSessions as group}
                            <div>
                                <div
                                    class="flex items-center gap-2 px-1 py-1.5"
                                >
                                    <div
                                        class="h-[2px] w-3 rounded-full bg-primary"
                                    ></div>
                                    <span
                                        class="text-[10px] font-bold uppercase tracking-widest text-foreground/80"
                                    >
                                        {group.label}
                                    </span>
                                    <span
                                        class="text-[10px] text-muted-foreground ml-auto tabular-nums"
                                    >
                                        {group.items.length}
                                    </span>
                                </div>
                                <div>
                                    {#each group.items as session}
                                        {@const isSelected =
                                            chatStore.activeSessionId ===
                                            session.id}
                                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                                        <div
                                            class="group relative flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors
                                                {isSelected
                                                ? 'bg-muted/50 text-foreground'
                                                : 'text-foreground/75 hover:bg-muted/30 hover:text-foreground'}"
                                            onclick={() =>
                                                selectChat(session.id)}
                                        >
                                            <div
                                                class="w-0.5 self-stretch rounded-full shrink-0 transition-colors {isSelected
                                                    ? 'bg-primary'
                                                    : 'bg-transparent group-hover:bg-muted-foreground/30'}"
                                            ></div>
                                            <span
                                                class="flex-1 min-w-0 text-[13px] truncate {isSelected
                                                    ? 'font-medium'
                                                    : ''}"
                                            >
                                                {session.title}
                                            </span>
                                            <button
                                                type="button"
                                                class="shrink-0 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                                                onclick={(e) =>
                                                    deleteChat(
                                                        session.id,
                                                        e,
                                                    )}
                                                title="Delete chat"
                                                aria-label="Delete chat"
                                            >
                                                <Trash2 class="w-3 h-3" />
                                            </button>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    {/if}
                </div>
            </ScrollArea>
        </aside>
    {/if}

    <main class="flex-1 h-full flex flex-col min-w-0 bg-background overflow-hidden">
        {#if activeSession}
            <header
                class="shrink-0 flex items-center justify-between px-6 py-4 border-b bg-gradient-to-b from-muted/20 to-background"
            >
                <div class="flex items-center gap-3 min-w-0">
                    <div
                        class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
                    >
                        <MessagesSquare class="w-4 h-4 text-primary" />
                    </div>
                    <div class="min-w-0">
                        <div class="flex items-center gap-1.5 min-w-0">
                            <h1
                                class="text-base font-bold tracking-tight leading-tight truncate"
                            >
                                {activeSession.title}
                            </h1>
                            <button
                                type="button"
                                class="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                onclick={openRenameModal}
                                title="Rename chat"
                                aria-label="Rename chat"
                            >
                                <Pencil class="w-3 h-3" />
                            </button>
                        </div>
                        <div
                            class="text-xs text-muted-foreground leading-tight mt-0.5"
                        >
                            {messages.length} message{messages.length === 1
                                ? ""
                                : "s"}
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                    {#if activeModel}
                        <div
                            class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border"
                        >
                            <div
                                class="w-1 self-stretch rounded-full {getArchAccent(
                                    'llm',
                                )}"
                            ></div>
                            <Cpu class="w-3 h-3 text-muted-foreground" />
                            <span class="font-medium truncate max-w-[240px]"
                                >{activeModel}</span
                            >
                            <CheckCircle2 class="w-3 h-3 text-emerald-500" />
                        </div>
                    {:else}
                        <div
                            class="inline-flex items-center gap-1.5 text-[11px] bg-destructive/10 text-destructive px-2 py-1 rounded-md border border-destructive/30"
                        >
                            <AlertCircle class="w-3 h-3" />
                            <span class="font-medium">No model loaded</span>
                        </div>
                    {/if}
                </div>
            </header>

            <ScrollArea
                class="flex-1 min-h-0 p-4 bg-background"
                bind:viewportRef={scrollViewport}
            >
                <div class="max-w-3xl mx-auto space-y-6 pt-3 pb-4">
                    {#if messages.length === 0}
                        <div
                            class="text-center text-muted-foreground text-sm py-12"
                        >
                            Send a message to start the conversation.
                        </div>
                    {/if}
                    {#each messages as msg, msgIdx (msgIdx)}
                        <div
                            class="group flex flex-col {msg.role === 'user'
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
                                class="relative w-full flex {msg.role === 'user'
                                    ? 'justify-end'
                                    : 'justify-start'}"
                            >
                                <div
                                    class="relative {msg.role === 'user'
                                        ? 'ml-12 max-w-[85%]'
                                        : 'mr-12 max-w-[85%]'}"
                                >
                                    {#if msg.role === "assistant"}
                                        {@const parts = parseThinkParts(
                                            msg.content,
                                        )}
                                        {@const thinkParts = parts.filter(
                                            (p) => p.type === "think",
                                        )}
                                        {@const textParts = parts.filter(
                                            (p) => p.type === "text",
                                        )}
                                        {#if settings.showThinking && thinkParts.length > 0}
                                            {#each thinkParts as part, pIdx}
                                                {@const key =
                                                    msgIdx + "-" + pIdx}
                                                {@const collapsed =
                                                    thinkCollapsed[key] ===
                                                    true}
                                                <div
                                                    class="mb-2 rounded-lg border border-primary/20 bg-primary/5 text-xs"
                                                >
                                                    <button
                                                        type="button"
                                                        class="w-full flex items-center gap-2 px-3 py-2 text-left text-primary font-medium hover:bg-primary/10 rounded-lg transition-colors"
                                                        onclick={() =>
                                                            (thinkCollapsed[
                                                                key
                                                            ] = !collapsed)}
                                                    >
                                                        {#if collapsed}
                                                            <ChevronRight
                                                                class="w-3.5 h-3.5"
                                                            />
                                                        {:else}
                                                            <ChevronDown
                                                                class="w-3.5 h-3.5"
                                                            />
                                                        {/if}
                                                        <Brain
                                                            class="w-3.5 h-3.5"
                                                        />
                                                        <span
                                                            >Thinking{part.unclosed
                                                                ? "…"
                                                                : ""}</span
                                                        >
                                                    </button>
                                                    {#if !collapsed}
                                                        <div
                                                            class="px-3 pb-3 pt-0 text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed border-t border-primary/10 mt-1"
                                                        >
                                                            {part.content.trim()}
                                                        </div>
                                                    {/if}
                                                </div>
                                            {/each}
                                        {/if}
                                        {@const displayText = settings.showThinking
                                            ? textParts
                                                  .map((p) => p.content)
                                                  .join("")
                                                  .trimStart()
                                            : stripThink(msg.content)}
                                        {#if displayText}
                                            {#if settings.renderMarkdown}
                                                <div
                                                    class="p-4 rounded-lg bg-muted/50 chat-markdown"
                                                    role="presentation"
                                                    onclick={handleBubbleClick}
                                                >
                                                    {#each renderMarkdownSegments(displayText, `a-${msg.createdAt}-${msgIdx}`) as seg (seg.id)}
                                                        {@html seg.html}
                                                    {/each}
                                                </div>
                                            {:else}
                                                <div
                                                    class="p-4 rounded-lg bg-muted/50 text-sm leading-relaxed whitespace-pre-wrap"
                                                >
                                                    {displayText}
                                                </div>
                                            {/if}
                                        {:else if !settings.showThinking && msg.content && !stripThink(msg.content)}
                                            <div
                                                class="p-3 rounded-lg bg-muted/30 text-xs italic text-muted-foreground"
                                            >
                                                (thinking hidden)
                                            </div>
                                        {/if}
                                    {:else if editingIndex === msgIdx}
                                        <div
                                            class="p-2 rounded-lg bg-primary/10 border border-primary/30 text-sm"
                                        >
                                            <Textarea
                                                bind:value={editDraft}
                                                class="min-h-[80px] resize-none text-sm"
                                                onkeydown={(e) => {
                                                    if (
                                                        e.key === "Enter" &&
                                                        (e.metaKey || e.ctrlKey)
                                                    ) {
                                                        e.preventDefault();
                                                        saveEdit();
                                                    } else if (
                                                        e.key === "Escape"
                                                    ) {
                                                        e.preventDefault();
                                                        cancelEdit();
                                                    }
                                                }}
                                            />
                                            <div
                                                class="flex justify-end gap-2 mt-2"
                                            >
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    class="h-7"
                                                    onclick={cancelEdit}
                                                >
                                                    <XIcon
                                                        class="w-3.5 h-3.5 mr-1"
                                                    />
                                                    Cancel
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    class="h-7"
                                                    onclick={saveEdit}
                                                >
                                                    <Check
                                                        class="w-3.5 h-3.5 mr-1"
                                                    />
                                                    Save
                                                </Button>
                                            </div>
                                        </div>
                                    {:else if settings.renderMarkdown}
                                        <div
                                            class="p-4 rounded-lg bg-primary text-primary-foreground chat-markdown"
                                            role="presentation"
                                            onclick={handleBubbleClick}
                                        >
                                            {#each renderMarkdownSegments(msg.content, `u-${msg.createdAt}-${msgIdx}`) as seg (seg.id)}
                                                {@html seg.html}
                                            {/each}
                                        </div>
                                    {:else}
                                        <div
                                            class="p-4 rounded-lg bg-primary text-primary-foreground text-sm leading-relaxed whitespace-pre-wrap"
                                        >
                                            {msg.content}
                                        </div>
                                    {/if}
                                    {#if editingIndex !== msgIdx}
                                        <div
                                            class="absolute -top-2 {msg.role ===
                                            'user'
                                                ? '-left-2'
                                                : '-right-2'} flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            {#if msg.role === "user"}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    class="h-6 w-6 rounded-full bg-background border shadow-sm hover:text-primary"
                                                    onclick={() =>
                                                        startEdit(
                                                            msgIdx,
                                                            msg.content,
                                                        )}
                                                    title="Edit message"
                                                >
                                                    <Pencil
                                                        class="w-3 h-3"
                                                    />
                                                </Button>
                                            {/if}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                class="h-6 w-6 rounded-full bg-background border shadow-sm hover:text-destructive"
                                                onclick={() => {
                                                    const sid =
                                                        chatStore.activeSessionId;
                                                    if (sid)
                                                        chatStore.deleteMessageIn(
                                                            sid,
                                                            msgIdx,
                                                        );
                                                }}
                                                title="Delete message"
                                            >
                                                <Trash2 class="w-3 h-3" />
                                            </Button>
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            </ScrollArea>

            {#if lastMessageIsUser && !isStreaming && editingIndex === null}
                <div class="flex justify-center px-4 pt-3 pb-1 bg-background">
                    <button
                        type="button"
                        class="group inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/15 px-4 py-1.5 text-xs font-medium text-primary transition-all hover:border-primary/50 hover:bg-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!activeModel}
                        onclick={respondWithAI}
                        title={activeModel
                            ? "Generate a reply from the currently loaded model"
                            : "Load a model to respond"}
                    >
                        {#if activeModel}
                            <span class="relative flex h-1.5 w-1.5">
                                <span
                                    class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75"
                                ></span>
                                <span
                                    class="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary"
                                ></span>
                            </span>
                        {/if}
                        <Zap
                            class="w-3.5 h-3.5 transition-transform group-hover:scale-110"
                        />
                        <span>
                            {activeModel
                                ? "Respond with loaded AI"
                                : "Load a model to respond"}
                        </span>
                    </button>
                </div>
            {/if}

            <div class="p-4 pt-3 border-t bg-background">
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
                            disabled={!activeModel || isStreaming}
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
                        {#if isStreaming}
                            <Button
                                class="absolute bottom-2 right-2 h-8 w-8 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                size="icon"
                                onclick={cancelStream}
                                title="Stop generating"
                            >
                                <Square
                                    class="w-3.5 h-3.5"
                                    fill="currentColor"
                                />
                            </Button>
                        {:else}
                            <Button
                                class="absolute bottom-2 right-2 h-8 w-8 rounded-md"
                                size="icon"
                                disabled={!activeModel ||
                                    !userMessage.trim()}
                                onclick={sendMessage}
                            >
                                <Send class="w-4 h-4" />
                            </Button>
                        {/if}
                    </div>
                    <div
                        class="mt-2 text-center text-xs text-muted-foreground"
                    >
                        AI models can make mistakes. Check important info.
                    </div>
                </div>
            </div>
        {:else}
            <div
                class="flex-1 flex flex-col items-center justify-center p-8 bg-background"
            >
                <div
                    class="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-6"
                >
                    <MessageSquare class="w-8 h-8" />
                </div>
                <h1 class="text-2xl font-semibold mb-2">
                    Welcome to OpenArc Studio
                </h1>
                <p
                    class="text-sm text-muted-foreground mb-8 max-w-md text-center"
                >
                    Start a new chat to begin. Each chat keeps its own messages,
                    system prompt, and inference settings.
                </p>
                <Button onclick={newChat} class="gap-2">
                    <MessageSquarePlus class="w-4 h-4" />
                    Start a New Chat
                </Button>
                {#if !activeModel}
                    <p class="text-xs text-muted-foreground mt-6">
                        Tip: load a model from the top bar to enable sending
                        messages.
                    </p>
                {/if}
            </div>
        {/if}
    </main>

    {#if appState.rightPanelOpen && activeSession}
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
                                    disabled={!settings.presetId}
                                    title="Delete Preset"
                                >
                                    <Trash2 class="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>
                        <select
                            id="preset-select"
                            value={selectedPresetDropdown}
                            onchange={handlePresetChange}
                            class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        >
                            <option value="unsaved" hidden
                                >Unsaved Preset</option
                            >
                            {#each chatStore.presets as preset}
                                <option value={preset.id}
                                    >{preset.name}</option
                                >
                            {/each}
                        </select>
                    </div>

                    <div class="flex items-center justify-between pt-1">
                        <div class="space-y-0.5">
                            <label
                                for="show-thinking"
                                class="text-sm font-medium">Show Thinking</label
                            >
                            <p class="text-[11px] text-muted-foreground">
                                Render &lt;think&gt; blocks as a collapsible
                                section.
                            </p>
                        </div>
                        <Switch
                            id="show-thinking"
                            checked={settings.showThinking}
                            onCheckedChange={(v) =>
                                chatStore.updateActiveSettings({
                                    showThinking: v,
                                })}
                        />
                    </div>

                    <div class="flex items-center justify-between">
                        <div class="space-y-0.5">
                            <label
                                for="render-markdown"
                                class="text-sm font-medium"
                                >Render Markdown</label
                            >
                            <p class="text-[11px] text-muted-foreground">
                                Format messages with markdown (headings, code,
                                lists). Off = plain text.
                            </p>
                        </div>
                        <Switch
                            id="render-markdown"
                            checked={settings.renderMarkdown}
                            onCheckedChange={(v) =>
                                chatStore.updateActiveSettings({
                                    renderMarkdown: v,
                                })}
                        />
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
                                onclick={() =>
                                    (systemPromptMaximized = true)}
                                title="Maximize"
                            >
                                <Maximize2 class="w-3.5 h-3.5" />
                            </Button>
                        </div>
                        <div class="relative">
                            <Textarea
                                id="system-prompt"
                                value={settings.systemPrompt}
                                oninput={(e) =>
                                    chatStore.updateActiveSettings({
                                        systemPrompt: (
                                            e.target as HTMLTextAreaElement
                                        ).value,
                                    })}
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
                                    >{settings.temperature.toFixed(2)}</span
                                >
                            </div>
                            <Slider
                                id="temp-slider"
                                type="single"
                                value={settings.temperature}
                                onValueChange={(v) =>
                                    chatStore.updateActiveSettings({
                                        temperature: v,
                                    })}
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
                                    >{settings.topP.toFixed(2)}</span
                                >
                            </div>
                            <Slider
                                id="topp-slider"
                                type="single"
                                value={settings.topP}
                                onValueChange={(v) =>
                                    chatStore.updateActiveSettings({
                                        topP: v,
                                    })}
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
                                    >{settings.topK}</span
                                >
                            </div>
                            <Slider
                                id="topk-slider"
                                type="single"
                                value={settings.topK}
                                onValueChange={(v) =>
                                    chatStore.updateActiveSettings({
                                        topK: v,
                                    })}
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
                                    >{settings.maxTokens}</span
                                >
                            </div>
                            <Slider
                                id="maxtokens-slider"
                                type="single"
                                value={settings.maxTokens}
                                onValueChange={(v) =>
                                    chatStore.updateActiveSettings({
                                        maxTokens: v,
                                    })}
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
                                    >{settings.repPenalty.toFixed(2)}</span
                                >
                            </div>
                            <Slider
                                id="reppenalty-slider"
                                type="single"
                                value={settings.repPenalty}
                                onValueChange={(v) =>
                                    chatStore.updateActiveSettings({
                                        repPenalty: v,
                                    })}
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
                    value={settings.systemPrompt}
                    oninput={(e) =>
                        chatStore.updateActiveSettings({
                            systemPrompt: (e.target as HTMLTextAreaElement)
                                .value,
                        })}
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

<Dialog.Root bind:open={renameModalOpen}>
    <Dialog.Content class="sm:max-w-[425px]">
        <Dialog.Header>
            <Dialog.Title>Rename Chat</Dialog.Title>
        </Dialog.Header>
        <div class="grid gap-4 py-4">
            <input
                bind:value={renameDraft}
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Chat name"
                onkeydown={(e) => {
                    if (e.key === "Enter") confirmRename();
                }}
            />
        </div>
        <Dialog.Footer>
            <Button
                variant="outline"
                onclick={() => (renameModalOpen = false)}>Cancel</Button
            >
            <Button disabled={!renameDraft.trim()} onclick={confirmRename}
                >Rename</Button
            >
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
