<script lang="ts">
    import { onMount } from "svelte";
    import { appState } from "$lib/state.svelte.js";
    import * as Dialog from "$lib/components/ui/dialog";
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Cpu } from "@lucide/svelte";
    import { openarc } from "$lib/client.svelte.js";

    let {
        open = $bindable(false),
        modelName = "",
        onConfirm = (device: string) => {},
    } = $props<{
        open: boolean;
        modelName: string;
        onConfirm?: (device: string) => void;
    }>();

    let selectedDeviceType = $state("AUTO");
    let customDevice = $state("HETERO:GPU.1,GPU.0");

    onMount(() => {
        appState.addLog("info", "DeviceSelectionModal component initialized");
    });

    const handleConfirm = () => {
        const device =
            selectedDeviceType === "CUSTOM" ? customDevice : selectedDeviceType;
        open = false;
        appState.addLog(
            "v1",
            "Confirmed device selection",
            `Model: ${modelName}, Device: ${device}`,
        );
        onConfirm(device);
    };

    $effect(() => {
        if (open) {
            appState.addLog(
                "v2",
                "Device selection modal opened, refreshing metrics",
            );
            openarc.refreshMetrics();
        }
    });

    const cpus = $derived(openarc.metrics?.cpus || []);
    const gpus = $derived(openarc.metrics?.gpus || []);
    const npus = $derived(openarc.metrics?.npus || []);
</script>

<Dialog.Root bind:open>
    <Dialog.Content class="sm:max-w-[500px]">
        <Dialog.Header>
            <Dialog.Title class="flex items-center gap-2">
                <Cpu class="w-5 h-5 text-primary" />
                Select Device
            </Dialog.Title>
            <Dialog.Description>
                Choose which device to load {modelName || "this model"} onto.
            </Dialog.Description>
        </Dialog.Header>

        <div class="grid gap-6 py-4">
            <div class="grid gap-2">
                <label for="device" class="text-sm font-medium"
                    >Device Selection</label
                >
                <select
                    id="device"
                    bind:value={selectedDeviceType}
                    class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <optgroup label="General">
                        <option value="AUTO">AUTO (Recommended)</option>
                    </optgroup>

                    {#if gpus.length > 0}
                        <optgroup label="GPUs">
                            <option value="GPU">GPU (Default Single GPU)</option
                            >
                            {#each gpus as gpu}
                                <option value={gpu.id}>
                                    {gpu.id} - {gpu.name}
                                    {#if gpu.is_shared}
                                        (Shared Memory)
                                    {:else}
                                        ({(gpu.total_vram / 1024).toFixed(1)} GB VRAM)
                                    {/if}
                                </option>
                            {/each}
                        </optgroup>
                    {/if}

                    {#if cpus.length > 0}
                        <optgroup label="CPUs">
                            {#each cpus as cpu}
                                <option value={cpu.id}
                                    >{cpu.id} - {cpu.name}</option
                                >
                            {/each}
                        </optgroup>
                    {:else}
                        <optgroup label="CPUs">
                            <option value="CPU">CPU</option>
                        </optgroup>
                    {/if}

                    {#if npus.length > 0}
                        <optgroup label="NPUs">
                            {#each npus as npu}
                                <option value={npu.id}
                                    >{npu.id} - {npu.name}</option
                                >
                            {/each}
                        </optgroup>
                    {/if}

                    <optgroup label="Advanced">
                        {#if gpus.length > 1}
                            <option
                                value="HETERO:{gpus
                                    .map((g: any) => g.id)
                                    .reverse()
                                    .join(',')}"
                            >
                                Multi-GPU (HETERO:{gpus
                                    .map((g: any) => g.id)
                                    .reverse()
                                    .join(",")})
                            </option>
                        {/if}
                        <option value="HETERO:GPU,CPU"
                            >Multi-Device (HETERO:GPU,CPU)</option
                        >
                        <option value="CUSTOM">Custom String...</option>
                    </optgroup>
                </select>
            </div>

            {#if selectedDeviceType === "CUSTOM"}
                <div class="grid gap-2 animate-in fade-in slide-in-from-top-1">
                    <label for="custom" class="text-sm font-medium"
                        >Custom Device String</label
                    >
                    <Input
                        id="custom"
                        bind:value={customDevice}
                        placeholder="e.g. HETERO:GPU.1,GPU.0,CPU"
                    />
                    <p class="text-xs text-muted-foreground">
                        Enter a valid OpenVINO device string (e.g., CPU, GPU,
                        MULTI:GPU,CPU, HETERO:GPU.1,GPU.0).
                    </p>
                </div>
            {/if}
        </div>

        <Dialog.Footer>
            <Button variant="outline" onclick={() => (open = false)}
                >Cancel</Button
            >
            <Button onclick={handleConfirm}>Load Model</Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
