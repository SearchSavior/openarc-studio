import { invoke } from "@tauri-apps/api/core";
import { appState } from "$lib/state.svelte.js";

export type ChatMessage = {
    role: "user" | "assistant";
    content: string;
    model?: string;
    tokens?: number;
    tps?: number;
    createdAt: number;
};

export type ChatSettings = {
    systemPrompt: string;
    temperature: number;
    topP: number;
    topK: number;
    maxTokens: number;
    repPenalty: number;
    presetId: string | null;
    showThinking: boolean;
    renderMarkdown: boolean;
};

export type ChatSession = {
    id: string;
    title: string;
    messages: ChatMessage[];
    settings: ChatSettings;
    model: string | null;
    createdAt: number;
    updatedAt: number;
};

export type Preset = {
    id: string;
    name: string;
    prompt: string;
    temp: number;
    topP: number;
    topK: number;
    maxTokens: number;
    repPenalty: number;
};

export const DEFAULT_SETTINGS: ChatSettings = {
    systemPrompt: "You are a helpful assistant.",
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    maxTokens: 2048,
    repPenalty: 1.1,
    presetId: null,
    showThinking: true,
    renderMarkdown: true,
};

const DEFAULT_PRESETS: Preset[] = [
    {
        id: "default",
        name: "Default Assistant",
        prompt: "You are a helpful AI assistant.",
        temp: 0.7,
        topP: 0.9,
        topK: 40,
        maxTokens: 2048,
        repPenalty: 1.1,
    },
    {
        id: "coding",
        name: "Coding Expert",
        prompt:
            "You are an expert programmer. Only output valid code and explain it briefly. Use markdown block formatting.",
        temp: 0.2,
        topP: 0.95,
        topK: 40,
        maxTokens: 4096,
        repPenalty: 1.05,
    },
    {
        id: "creative",
        name: "Creative Writer",
        prompt:
            "You are a creative writer. Be expressive, use vivid imagery, and don't hesitate to think outside the box.",
        temp: 0.9,
        topP: 0.9,
        topK: 60,
        maxTokens: 2048,
        repPenalty: 1.15,
    },
];

function randomId(): string {
    const rand =
        typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID().replace(/-/g, "")
            : Math.random().toString(36).slice(2) + Date.now().toString(36);
    return rand.slice(0, 24);
}

function normalizeSession(raw: any): ChatSession | null {
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.id !== "string") return null;
    const messages: ChatMessage[] = Array.isArray(raw.messages)
        ? raw.messages
              .filter(
                  (m: any) =>
                      m &&
                      (m.role === "user" || m.role === "assistant") &&
                      typeof m.content === "string",
              )
              .map((m: any) => ({
                  role: m.role,
                  content: m.content,
                  model: typeof m.model === "string" ? m.model : undefined,
                  tokens: typeof m.tokens === "number" ? m.tokens : undefined,
                  tps: typeof m.tps === "number" ? m.tps : undefined,
                  createdAt:
                      typeof m.createdAt === "number" ? m.createdAt : Date.now(),
              }))
        : [];
    const settings: ChatSettings = {
        ...DEFAULT_SETTINGS,
        ...(raw.settings && typeof raw.settings === "object" ? raw.settings : {}),
    };
    return {
        id: raw.id,
        title: typeof raw.title === "string" ? raw.title : "New Chat",
        messages,
        settings,
        model: typeof raw.model === "string" ? raw.model : null,
        createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
        updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    };
}

function dateBucket(ts: number): string {
    const now = new Date();
    const d = new Date(ts);
    const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
    if (sameDay(d, now)) return "Today";
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(d, yesterday)) return "Yesterday";
    const diffDays = Math.floor((now.getTime() - ts) / (1000 * 60 * 60 * 24));
    if (diffDays < 7) return "Previous 7 Days";
    if (diffDays < 30) return "Previous 30 Days";
    return "Older";
}

const BUCKET_ORDER = [
    "Today",
    "Yesterday",
    "Previous 7 Days",
    "Previous 30 Days",
    "Older",
];

class ChatStore {
    sessions = $state<ChatSession[]>([]);
    activeSessionId = $state<string | null>(null);
    presets = $state<Preset[]>([...DEFAULT_PRESETS]);
    loaded = $state<boolean>(false);

    activeSession = $derived(
        this.activeSessionId
            ? this.sessions.find((s) => s.id === this.activeSessionId) || null
            : null,
    );

    groupedSessions = $derived.by(() => {
        const sorted = [...this.sessions].sort(
            (a, b) => b.updatedAt - a.updatedAt,
        );
        const groups = new Map<string, ChatSession[]>();
        for (const s of sorted) {
            const bucket = dateBucket(s.updatedAt);
            if (!groups.has(bucket)) groups.set(bucket, []);
            groups.get(bucket)!.push(s);
        }
        return BUCKET_ORDER.filter((b) => groups.has(b)).map((b) => ({
            label: b,
            items: groups.get(b)!,
        }));
    });

    async loadAll() {
        if (typeof window === "undefined") return;
        try {
            const raw = await invoke<any[]>("list_chat_sessions");
            const normalized = (Array.isArray(raw) ? raw : [])
                .map(normalizeSession)
                .filter((s): s is ChatSession => s !== null)
                .sort((a, b) => b.updatedAt - a.updatedAt);
            this.sessions = normalized;
            appState.addLog(
                "info",
                `Loaded ${normalized.length} chat session(s)`,
            );
        } catch (e) {
            appState.addLog(
                "error",
                "Failed to load chat sessions",
                e instanceof Error ? e.message : String(e),
            );
        }

        try {
            const raw = await invoke<any>("load_presets");
            if (Array.isArray(raw) && raw.length > 0) {
                this.presets = raw.filter(
                    (p: any) => p && typeof p.id === "string",
                );
            }
        } catch (e) {
            appState.addLog(
                "error",
                "Failed to load presets",
                e instanceof Error ? e.message : String(e),
            );
        }

        this.loaded = true;
    }

    createSession(): ChatSession {
        const now = Date.now();
        const session: ChatSession = {
            id: randomId(),
            title: "New Chat",
            messages: [],
            settings: { ...DEFAULT_SETTINGS },
            model: null,
            createdAt: now,
            updatedAt: now,
        };
        this.sessions = [session, ...this.sessions];
        this.activeSessionId = session.id;
        this.persist(session);
        appState.addLog("v1", "Created new chat session", session.id);
        return session;
    }

    selectSession(id: string) {
        const exists = this.sessions.some((s) => s.id === id);
        if (exists) {
            this.activeSessionId = id;
            appState.addLog("v2", "Selected chat session", id);
        }
    }

    async deleteSession(id: string) {
        this.sessions = this.sessions.filter((s) => s.id !== id);
        if (this.activeSessionId === id) {
            this.activeSessionId = null;
        }
        try {
            await invoke("delete_chat_session", { id });
            appState.addLog("info", "Deleted chat session", id);
        } catch (e) {
            appState.addLog(
                "error",
                "Failed to delete chat session on disk",
                e instanceof Error ? e.message : String(e),
            );
        }
    }

    renameActive(title: string) {
        const s = this.activeSession;
        if (!s) return;
        s.title = title || "New Chat";
        s.updatedAt = Date.now();
        this.persist(s);
    }

    updateActiveSettings(patch: Partial<ChatSettings>) {
        const s = this.activeSession;
        if (!s) return;
        s.settings = { ...s.settings, ...patch };
        s.updatedAt = Date.now();
        this.persist(s);
    }

    setActiveModel(model: string | null) {
        const s = this.activeSession;
        if (!s) return;
        s.model = model;
        s.updatedAt = Date.now();
        this.persist(s);
    }

    appendMessageTo(sessionId: string, msg: Omit<ChatMessage, "createdAt">) {
        const s = this.sessions.find((x) => x.id === sessionId);
        if (!s) return -1;
        s.messages.push({ ...msg, createdAt: Date.now() });
        s.updatedAt = Date.now();
        this.persist(s);
        return s.messages.length - 1;
    }

    setSessionTitle(sessionId: string, title: string) {
        const s = this.sessions.find((x) => x.id === sessionId);
        if (!s) return;
        const clean = title.trim();
        if (!clean) return;
        s.title = clean.slice(0, 80);
        s.updatedAt = Date.now();
        this.persist(s);
    }

    async generateTitleForSession(
        sessionId: string,
        userMessage: string,
        model: string,
    ) {
        const s = this.sessions.find((x) => x.id === sessionId);
        if (!s) return;
        if (s.title !== "New Chat") return;
        const firstUserMsg = s.messages.find((m) => m.role === "user");
        if (!firstUserMsg) return;

        const payload = {
            model,
            messages: [
                {
                    role: "system",
                    content:
                        "You generate short chat titles. Reply with ONLY a concise title (max 6 words) summarizing the user's message. No quotes, no punctuation at the end, no prefix like 'Title:'.",
                },
                { role: "user", content: userMessage },
            ],
            temperature: 0.3,
            max_tokens: 32,
            stream: false,
        };

        try {
            appState.addLog("v2", "Generating chat title", sessionId);
            const res = await invoke<any>("chat_inference", { req: payload });
            let content: string | undefined = res?.choices?.[0]?.message?.content;
            if (typeof content !== "string") return;
            content = content
                .replace(/<think>[\s\S]*?<\/think>/gi, "")
                .trim();
            const firstLine = content.split("\n").find((l) => l.trim()) ?? "";
            const title = firstLine
                .trim()
                .replace(/^["'`*_\-\s]+|["'`*_\-\s.]+$/g, "")
                .replace(/^title\s*[:\-]\s*/i, "")
                .trim();
            if (title && this.sessions.find((x) => x.id === sessionId)?.title === "New Chat") {
                this.setSessionTitle(sessionId, title);
                appState.addLog("info", "Generated chat title", title);
            }
        } catch (e) {
            appState.addLog(
                "warn",
                "Failed to generate chat title",
                e instanceof Error ? e.message : String(e),
            );
        }
    }

    appendMessage(msg: Omit<ChatMessage, "createdAt">) {
        const s = this.activeSession;
        if (!s) return -1;
        return this.appendMessageTo(s.id, msg);
    }

    patchMessageIn(sessionId: string, index: number, patch: Partial<ChatMessage>) {
        const s = this.sessions.find((x) => x.id === sessionId);
        if (!s) return;
        const m = s.messages[index];
        if (!m) return;
        s.messages[index] = { ...m, ...patch };
        s.updatedAt = Date.now();
        this.persist(s);
    }

    appendToMessageIn(sessionId: string, index: number, delta: string) {
        const s = this.sessions.find((x) => x.id === sessionId);
        if (!s) return;
        const m = s.messages[index];
        if (!m) return;
        m.content += delta;
        s.updatedAt = Date.now();
    }

    updateMessageContentIn(sessionId: string, index: number, content: string) {
        const s = this.sessions.find((x) => x.id === sessionId);
        if (!s) return;
        const m = s.messages[index];
        if (!m) return;
        m.content = content;
        s.updatedAt = Date.now();
        this.persist(s);
    }

    deleteMessageIn(sessionId: string, index: number) {
        const s = this.sessions.find((x) => x.id === sessionId);
        if (!s) return;
        if (index < 0 || index >= s.messages.length) return;
        s.messages.splice(index, 1);
        s.updatedAt = Date.now();
        this.persist(s);
    }

    clearActiveMessages() {
        const s = this.activeSession;
        if (!s) return;
        s.messages = [];
        s.updatedAt = Date.now();
        this.persist(s);
    }

    upsertPreset(preset: Preset) {
        const idx = this.presets.findIndex((p) => p.id === preset.id);
        if (idx >= 0) {
            this.presets[idx] = preset;
            this.presets = [...this.presets];
        } else {
            this.presets = [...this.presets, preset];
        }
        this.persistPresets();
    }

    deletePreset(id: string) {
        this.presets = this.presets.filter((p) => p.id !== id);
        this.persistPresets();
    }

    applyPreset(id: string) {
        const p = this.presets.find((p) => p.id === id);
        if (!p) return;
        this.updateActiveSettings({
            systemPrompt: p.prompt,
            temperature: p.temp,
            topP: p.topP,
            topK: p.topK,
            maxTokens: p.maxTokens,
            repPenalty: p.repPenalty,
            presetId: p.id,
        });
    }

    private persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

    private persist(session: ChatSession) {
        const existing = this.persistTimers.get(session.id);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
            this.persistTimers.delete(session.id);
            invoke("save_chat_session", { session: $state.snapshot(session) })
                .then(() => {
                    appState.addLog(
                        "v3",
                        "Persisted chat session",
                        session.id,
                    );
                })
                .catch((e) => {
                    appState.addLog(
                        "error",
                        "Failed to persist chat session",
                        e instanceof Error ? e.message : String(e),
                    );
                });
        }, 250);
        this.persistTimers.set(session.id, timer);
    }

    private persistPresets() {
        invoke("save_presets", { presets: $state.snapshot(this.presets) })
            .then(() => appState.addLog("v3", "Persisted presets"))
            .catch((e) =>
                appState.addLog(
                    "error",
                    "Failed to persist presets",
                    e instanceof Error ? e.message : String(e),
                ),
            );
    }
}

export const chatStore = new ChatStore();
