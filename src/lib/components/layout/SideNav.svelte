<script lang="ts">
    import { page } from "$app/state";
    import { MessageSquare, Mic, Server, Library, DownloadCloud, Settings, Activity } from "@lucide/svelte";
    import * as Tooltip from "$lib/components/ui/tooltip";
    import { Button } from "$lib/components/ui/button";
    import { appState } from "$lib/state.svelte.js";
    import { onMount } from "svelte";

    onMount(() => {
        appState.addLog('info', 'SideNav component initialized');
    });
</script>

<aside class="w-10 border-r flex flex-col items-center py-3 justify-between bg-muted/20">
    <Tooltip.Provider>
        <div class="flex flex-col gap-1">
            <Tooltip.Root>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <Button {...props} variant={page.url.pathname === '/' ? 'default' : 'ghost'} size="icon" class="h-8 w-8" href="/">
                            <MessageSquare class="w-4 h-4" />
                        </Button>
                    {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="right">Chat</Tooltip.Content>
            </Tooltip.Root>

            <Tooltip.Root>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <Button {...props} variant={page.url.pathname === '/voice' ? 'default' : 'ghost'} size="icon" class="h-8 w-8" href="/voice">
                            <Mic class="w-4 h-4" />
                        </Button>
                    {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="right">Voice Studio (STT/TTS)</Tooltip.Content>
            </Tooltip.Root>

            <Tooltip.Root>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <Button {...props} variant={page.url.pathname === '/server' ? 'default' : 'ghost'} size="icon" class="h-8 w-8" href="/server">
                            <Server class="w-4 h-4" />
                        </Button>
                    {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="right">OpenArc Server</Tooltip.Content>
            </Tooltip.Root>

            <Tooltip.Root>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <Button {...props} variant={page.url.pathname === '/models' ? 'default' : 'ghost'} size="icon" class="h-8 w-8" href="/models">
                            <Library class="w-4 h-4" />
                        </Button>
                    {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="right">My Models</Tooltip.Content>
            </Tooltip.Root>

            <Tooltip.Root>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <Button {...props} variant={page.url.pathname === '/benchmark' ? 'default' : 'ghost'} size="icon" class="h-8 w-8" href="/benchmark">
                            <Activity class="w-4 h-4" />
                        </Button>
                    {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="right">Benchmark</Tooltip.Content>
            </Tooltip.Root>

            <Tooltip.Root>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <Button {...props} variant="ghost" size="icon" class="h-8 w-8" onclick={() => { appState.downloaderOpen = true; appState.addLog('v2', 'Opened Downloader from SideNav'); }}>
                            <DownloadCloud class="w-4 h-4" />
                        </Button>
                    {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="right">Download Models</Tooltip.Content>
            </Tooltip.Root>
        </div>

        <div class="flex flex-col gap-1">
            <Tooltip.Root>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <Button {...props} variant="ghost" size="icon" class="h-8 w-8" onclick={() => { appState.settingsOpen = true; appState.addLog('v2', 'Opened Settings from SideNav'); }}>
                            <Settings class="w-4 h-4" />
                        </Button>
                    {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="right">Settings</Tooltip.Content>
            </Tooltip.Root>
        </div>
    </Tooltip.Provider>
</aside>