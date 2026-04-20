<script lang="ts">
    import { Minus, Square, X, Hexagon } from "@lucide/svelte";
    import { onMount } from "svelte";

    let windowAPI: any = null;

    onMount(async () => {
        try {
            // dynamic import so the vite dev server doesnt break
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            windowAPI = getCurrentWindow();
        } catch (e) {
            console.log("Not running in Tauri environment, window controls will be disabled.");
        }
    });

    function minimize() {
        if (windowAPI) windowAPI.minimize();
    }

    function toggleMaximize() {
        if (windowAPI) windowAPI.toggleMaximize();
    }

    function close() {
        if (windowAPI) windowAPI.close();
    }

    // manual drag fallback for tauri v2 if drag region fail
    function startDrag(e: PointerEvent) {
        if (e.button === 0 && windowAPI) {
            windowAPI.startDragging();
        }
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
    data-tauri-drag-region 
    class="h-8 border-b bg-background flex items-center justify-between select-none shrink-0 relative z-[100]"
    onpointerdown={startDrag}
>
    <div data-tauri-drag-region class="flex items-center pl-3 gap-2 text-xs font-semibold text-muted-foreground w-1/3 pointer-events-none">
        <Hexagon class="w-3.5 h-3.5 text-primary" />
        <span>OpenArc Studio</span>
    </div>

    <div data-tauri-drag-region class="h-full flex-1 pointer-events-none"></div>

    <div class="flex h-full items-center">
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div 
            class="h-full w-10 flex items-center justify-center hover:bg-muted transition-colors cursor-default text-muted-foreground z-10"
            onclick={minimize}
            onpointerdown={(e) => e.stopPropagation()}
        >
            <Minus class="w-3.5 h-3.5" />
        </div>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div 
            class="h-full w-10 flex items-center justify-center hover:bg-muted transition-colors cursor-default text-muted-foreground z-10"
            onclick={toggleMaximize}
            onpointerdown={(e) => e.stopPropagation()}
        >
            <Square class="w-3 h-3" />
        </div>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div 
            class="h-full w-10 flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors cursor-default text-muted-foreground z-10"
            onclick={close}
            onpointerdown={(e) => e.stopPropagation()}
        >
            <X class="w-4 h-4" />
        </div>
    </div>
</div>
