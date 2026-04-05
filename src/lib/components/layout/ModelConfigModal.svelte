<script lang="ts">
    import * as Dialog from "$lib/components/ui/dialog";
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Loader2, Settings2, AlertTriangle } from "@lucide/svelte";
    import { openarc } from "$lib/client.svelte.js";
    import { appState } from "$lib/state.svelte.js";

    import { onMount } from "svelte";

    let {
        open = $bindable(false),
        modelInfo = null,
        onSuccess = (config?: any) => {},
    } = $props<{
        open: boolean;
        modelInfo: any;
        onSuccess?: (config?: any) => void;
    }>();

    onMount(() => {
        appState.addLog("info", "ModelConfigModal mounted");
    });

    let saving = $state(false);
    let errorMessage = $state("");

    let modelName = $state("");
    let modelType = $state("");

    $effect(() => {
        if (open && modelInfo) {
            errorMessage = "";
            modelName =
                modelInfo.model_name || modelInfo.name || modelInfo.id || "";
            let incomingType =
                modelInfo.model_type ||
                modelInfo.architecture ||
                modelInfo.type ||
                "LLM";
            if (incomingType.toUpperCase() === "UNKNOWN") incomingType = "LLM";
            modelType = incomingType.toUpperCase();
        }
    });

    const handleSave = async () => {
        if (!modelInfo?.path || !modelName || !modelType) return;
        saving = true;
        errorMessage = "";
        appState.addLog("v1", `Saving model config for ${modelName}...`);
        try {
            const config = {
                model_name: modelName,
                model_type: modelType,
            };
            await openarc.updateModelConfig(modelInfo.path, config);
            appState.addLog(
                "info",
                `Successfully updated config for ${modelName}`,
            );
            open = false;
            onSuccess(config);
        } catch (e: any) {
            console.error("Failed to save config", e);
            appState.addLog(
                "error",
                `Failed to save model config for ${modelName}`,
                e.toString(),
            );
            errorMessage = e.toString();
        } finally {
            saving = false;
        }
    };
</script>

<Dialog.Root bind:open>
    <Dialog.Content class="sm:max-w-[425px]">
        <Dialog.Header>
            <Dialog.Title class="flex items-center gap-2">
                <Settings2 class="w-5 h-5 text-primary" />
                Configure Model
            </Dialog.Title>
            <Dialog.Description>
                Provide the required metadata for this model before it can be
                loaded.
            </Dialog.Description>
        </Dialog.Header>

        {#if errorMessage}
            <div
                class="bg-destructive/10 text-destructive text-sm px-3 py-2 rounded-md flex items-start gap-2 border border-destructive/20 mt-2"
            >
                <AlertTriangle class="w-4 h-4 shrink-0 mt-0.5" />
                <span class="break-words">{errorMessage}</span>
            </div>
        {/if}

        <div class="grid gap-6 py-4">
            <div class="grid gap-2">
                <label for="name" class="text-sm font-medium">Model Name</label>
                <Input
                    id="name"
                    bind:value={modelName}
                    placeholder="e.g. Llama-3-8B-Instruct"
                />
            </div>

            <div class="grid gap-2">
                <label for="type" class="text-sm font-medium">Model Type</label>
                <select
                    id="type"
                    bind:value={modelType}
                    class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <option value="LLM">LLM (Text Generation)</option>
                    <option value="VLM">VLM (Vision-Language)</option>
                    <option value="STT">STT (Speech-to-Text)</option>
                    <option value="TTS">TTS (Text-to-Speech)</option>
                    <option value="EMBEDDING">Embedding</option>
                    <option value="RERANKER">Reranker</option>
                </select>
            </div>
        </div>

        <Dialog.Footer>
            <Button
                variant="outline"
                onclick={() => (open = false)}
                disabled={saving}>Cancel</Button
            >
            <Button
                onclick={handleSave}
                disabled={saving || !modelName || !modelType}
            >
                {#if saving}
                    <Loader2 class="w-4 h-4 mr-2 animate-spin" /> Saving...
                {:else}
                    Save Configuration
                {/if}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
