import { appState } from "$lib/state.svelte.js";

// ---------------------------------------------------------------------------
// types - must match the shape of curated-manifest.json
// ---------------------------------------------------------------------------

export type CuratedModelPreset = {
    model_type: string;
    engine: string;
    device: string;
    vlm_type: string | null;
    runtime_config: Record<string, unknown>;
};

export type CuratedModel = {
    id: string;
    name: string;
    author: string;
    category: string;
    subcategory: string | null;
    description: string;
    params: string;
    quantization: string;
    tags: string[];
    preset: CuratedModelPreset;
};

export type CuratedCategory = {
    id: string;
    label: string;
    description: string;
    icon: string;
};

export type CuratedManifest = {
    version: number;
    name: string;
    description: string;
    lastUpdated: string;
    categories: CuratedCategory[];
    models: CuratedModel[];
};

let curatedModels = $state<CuratedModel[]>([]);
let curatedCategories = $state<CuratedCategory[]>([]);
let isLoading = $state(false);
// cleared on the next successfull fetch
let loadError = $state<string | null>(null);
let lastFetchedAt = $state<Date | null>(null);
const DEFAULT_MANIFEST_URL = "/curated-manifest.json";

// falls back to bundled default when user hasnt configured a custom url
function getManifestUrl(): string {
    const custom = appState.settings.curatedManifestUrl?.trim();
    return custom || DEFAULT_MANIFEST_URL;
}

// category display order in the downloader
const CATEGORY_ORDER: Record<string, number> = {
    llm: 0,
    vlm: 1,
    stt: 2,
    tts: 3,
    emb: 4,
    rerank: 5,
};

function categorySortKey(id: string): number {
    return CATEGORY_ORDER[id] ?? 99;
}

// safe to call multiple times; each call replaces the previous data.
export async function fetchCuratedManifest(): Promise<void> {
    const url = getManifestUrl();
    isLoading = true;
    loadError = null;

    appState.addLog("v1", "Fetching curated models manifest", url);

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data: CuratedManifest = await res.json();

        if (!data.models || !Array.isArray(data.models)) {
            throw new Error("Manifest is missing a valid `models` array");
        }

        curatedModels = data.models;
        curatedCategories = (data.categories ?? []).sort(
            (a, b) => categorySortKey(a.id) - categorySortKey(b.id),
        );
        lastFetchedAt = new Date();

        appState.addLog(
            "info",
            `Loaded ${curatedModels.length} curated models from manifest`,
        );
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        loadError = msg;
        appState.addLog(
            "error",
            "Failed to fetch curated models manifest",
            msg,
        );
    } finally {
        isLoading = false;
    }
}

export function getCuratedModels(): CuratedModel[] {
    return curatedModels;
}

export function getCuratedCategories(): CuratedCategory[] {
    return curatedCategories;
}

export function getModelsByCategory(categoryId: string): CuratedModel[] {
    return curatedModels.filter((m) => m.category === categoryId);
}

export function getCuratedModelById(id: string): CuratedModel | undefined {
    return curatedModels.find((m) => m.id === id);
}

export function isCuratedModel(hfId: string): boolean {
    return curatedModels.some((m) => m.id === hfId);
}

export function getCuratedPreset(
    hfId: string,
): CuratedModelPreset | undefined {
    return curatedModels.find((m) => m.id === hfId)?.preset;
}

export function isCuratedLoading(): boolean {
    return isLoading;
}

export function getCuratedError(): string | null {
    return loadError;
}

export function getCuratedLastFetchedAt(): Date | null {
    return lastFetchedAt;
}
export function getCuratedGroupedByCategory(): {
    category: CuratedCategory;
    models: CuratedModel[];
}[] {
    return curatedCategories
        .filter((cat) => curatedModels.some((m) => m.category === cat.id))
        .map((cat) => ({
            category: cat,
            models: curatedModels.filter((m) => m.category === cat.id),
        }));
}

export function searchCuratedModels(
    query: string,
): {
    category: CuratedCategory;
    models: CuratedModel[];
}[] {
    const q = query.toLowerCase().trim();
    if (!q) return getCuratedGroupedByCategory();

    const matches = curatedModels.filter((m) => {
        const haystack =
            `${m.id} ${m.name} ${m.description} ${m.author} ${m.tags.join(" ")}`.toLowerCase();
        return haystack.includes(q);
    });

    return curatedCategories
        .filter((cat) => matches.some((m) => m.category === cat.id))
        .map((cat) => ({
            category: cat,
            models: matches.filter((m) => m.category === cat.id),
        }));
}
