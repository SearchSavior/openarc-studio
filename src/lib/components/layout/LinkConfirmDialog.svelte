<script lang="ts">
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import { appState } from "$lib/state.svelte.js";
    import { ExternalLink, AlertTriangle } from "@lucide/svelte";

    function handleOpen() {
        if (appState.linkConfirmResolve) {
            appState.linkConfirmResolve(true);
            appState.linkConfirmResolve = null;
        }
        appState.linkConfirmOpen = false;
    }

    function handleCancel() {
        if (appState.linkConfirmResolve) {
            appState.linkConfirmResolve(false);
            appState.linkConfirmResolve = null;
        }
        appState.linkConfirmOpen = false;
    }

    $effect(() => {
        if (!appState.linkConfirmOpen && appState.linkConfirmResolve) {
            appState.linkConfirmResolve(false);
            appState.linkConfirmResolve = null;
        }
    });
</script>

<Dialog.Root bind:open={appState.linkConfirmOpen}>
    <Dialog.Content class="sm:max-w-md">
        <Dialog.Header>
            <Dialog.Title class="flex items-center gap-2">
                <ExternalLink class="w-4 h-4" />
                Open External Link
            </Dialog.Title>
            <Dialog.Description>
                You are about to open a link in your default browser.
            </Dialog.Description>
        </Dialog.Header>

        <div class="space-y-4 py-2">
            <div class="rounded-md bg-muted p-3 break-all text-sm font-mono text-foreground border">
                {appState.linkConfirmUrl}
            </div>

            <div class="flex items-start gap-2 text-sm text-amber-500">
                <AlertTriangle class="w-4 h-4 shrink-0 mt-0.5" />
                <p>Check the URL carefully before opening. Only proceed if you trust this link.</p>
            </div>
        </div>

        <Dialog.Footer>
            <Button variant="outline" onclick={handleCancel}>Cancel</Button>
            <Button onclick={handleOpen}>Open</Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>