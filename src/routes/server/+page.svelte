<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { appState } from "$lib/state.svelte.js";
  import { openarc } from "$lib/client.svelte.js";
  import {
    Cpu,
    Loader2,
    Sparkles,
    Trash2,
    Network,
    CheckCircle2,
    AlertCircle,
    MemoryStick,
    HardDrive,
    Activity,
    Server,
  } from "@lucide/svelte";
  import { getArchAccent, getArchColor, resolveModelType } from "$lib/model-types";

  onMount(() => {
    appState.addLog("info", "Server page initialized");
  });

  let activeTab = $state<"endpoints" | "models">("endpoints");
  let selectedEndpoint = $state<string>("/openarc/status");
  let selectedMethod = $state<string>("GET");

  type EndpointParam = { name: string, type: string, required: boolean, description: string };
  type EndpointDef = {
      path: string;
      method: "GET" | "POST" | "DELETE";
      data?: () => any;
      requestBody?: EndpointParam[];
      responseBody?: EndpointParam[];
      reqExample?: any;
      resExample?: any;
      description?: string;
  };

  const endpoints: EndpointDef[] = [
      {
          path: "/openarc/status",
          method: "GET",
          data: () => openarc.status,
          description: "Get server status and currently loaded models."
      },
      {
          path: "/openarc/models",
          method: "GET",
          data: () => openarc.localModels,
          description: "List all local models found on the file system."
      },
      {
          path: "/openarc/version",
          method: "GET",
          data: () => openarc.version,
          description: "Get OpenArc server version information."
      },
      {
          path: "/openarc/metrics",
          method: "GET",
          data: () => openarc.metrics,
          description: "Get hardware metrics (CPU/RAM/GPU usage)."
      },
      {
          path: "/openarc/downloader",
          method: "GET",
          data: () => openarc.downloads,
          description: "List active and queued model downloads."
      },

      {
          path: "/openarc/load",
          method: "POST",
          description: "Load a model into VRAM/RAM for inference.",
          requestBody: [
              { name: "model_path", type: "string", required: true, description: "Absolute path to model directory" },
              { name: "model_name", type: "string", required: true, description: "Public facing identifier" },
              { name: "model_type", type: "string", required: true, description: "LLM, VLM, WHISPER, KOKORO, EMB, RERANK" },
              { name: "engine", type: "string", required: true, description: "ovgenai, optimum, openvino" },
              { name: "device", type: "string", required: true, description: "CPU, GPU, NPU, AUTO" },
              { name: "vlm_type", type: "string", required: false, description: "Vision token type (for VLMs)" },
              { name: "draft_model_path", type: "string", required: false, description: "Speculative decoding draft path" },
              { name: "runtime_config", type: "object", required: false, description: "Raw OpenVINO config dictionary" }
          ],
          responseBody: [
              { name: "status", type: "string", required: true, description: "'success' or 'error'" },
              { name: "model_name", type: "string", required: true, description: "The name of the loaded model" },
              { name: "metrics", type: "object", required: false, description: "Load time metrics" }
          ],
          reqExample: {
              model_path: "/path/to/model",
              model_name: "My-Llama-3",
              model_type: "LLM",
              engine: "ovgenai",
              device: "GPU"
          },
          resExample: { status: "success", model_name: "My-Llama-3" }
      },
      {
          path: "/openarc/unload",
          method: "POST",
          description: "Unload a model to free memory.",
          requestBody: [
              { name: "model_name", type: "string", required: true, description: "Name of the model to unload" }
          ],
          responseBody: [
              { name: "status", type: "string", required: true, description: "'success' or 'error'" }
          ],
          reqExample: { model_name: "My-Llama-3" },
          resExample: { status: "success" }
      },
      {
          path: "/openarc/models/update",
          method: "POST",
          description: "Update the openarc.json configuration file for a local model.",
          requestBody: [
              { name: "model_path", type: "string", required: true, description: "Absolute path to model directory" },
              { name: "config", type: "object", required: true, description: "Dictionary of config values" }
          ],
          responseBody: [
              { name: "status", type: "string", required: true, description: "'success'" },
              { name: "config", type: "object", required: true, description: "The merged config state" }
          ],
          reqExample: { model_path: "/path/to/model", config: { model_type: "LLM" } },
          resExample: { status: "success", config: { model_type: "LLM" } }
      },
      {
          path: "/openarc/bench",
          method: "POST",
          description: "Run an inference benchmark on a loaded model.",
          requestBody: [
              { name: "model_name", type: "string", required: true, description: "Name of loaded model" },
              { name: "prompt", type: "string", required: true, description: "Input text" },
              { name: "max_new_tokens", type: "number", required: false, description: "Token limit" }
          ],
          responseBody: [
              { name: "ttft", type: "number", required: true, description: "Time to first token (s)" },
              { name: "tpot", type: "number", required: true, description: "Time per output token (ms)" },
              { name: "tps", type: "number", required: true, description: "Tokens per second" }
          ],
          reqExample: { model_name: "My-Llama-3", prompt: "Hello", max_new_tokens: 128 },
          resExample: { ttft: 0.15, tpot: 25.4, tps: 39.3 }
      },
      {
          path: "/openarc/downloader",
          method: "POST",
          description: "Start downloading a model from Hugging Face.",
          requestBody: [
              { name: "model_name", type: "string", required: true, description: "Hugging Face repo ID" },
              { name: "path", type: "string", required: false, description: "Destination directory" }
          ],
          responseBody: [
              { name: "status", type: "string", required: true, description: "'success' or 'error'" }
          ],
          reqExample: { model_name: "meta-llama/Llama-3-8B-Instruct" },
          resExample: { status: "success" }
      },
      {
          path: "/openarc/downloader",
          method: "DELETE",
          description: "Cancel an active download.",
          requestBody: [
              { name: "model_name", type: "string", required: true, description: "Hugging Face repo ID" }
          ],
          responseBody: [
              { name: "status", type: "string", required: true, description: "'success'" }
          ],
          reqExample: { model_name: "meta-llama/Llama-3-8B-Instruct" },
          resExample: { status: "success" }
      },
      {
          path: "/openarc/downloader/pause",
          method: "POST",
          description: "Pause an active download.",
          requestBody: [
              { name: "model_name", type: "string", required: true, description: "Hugging Face repo ID" }
          ],
          responseBody: [
              { name: "status", type: "string", required: true, description: "'success'" }
          ],
          reqExample: { model_name: "meta-llama/Llama-3-8B-Instruct" },
          resExample: { status: "success" }
      },
      {
          path: "/openarc/downloader/resume",
          method: "POST",
          description: "Resume a paused download.",
          requestBody: [
              { name: "model_name", type: "string", required: true, description: "Hugging Face repo ID" }
          ],
          responseBody: [
              { name: "status", type: "string", required: true, description: "'success'" }
          ],
          reqExample: { model_name: "meta-llama/Llama-3-8B-Instruct" },
          resExample: { status: "success" }
      }
  ];

  const loadedModels = $derived((openarc.status?.models || []).map((info: any) => ({
    name: info.model_name,
    type: info.model_type,
    ...info
  })));

  async function handleUnload(modelName: string) {
    appState.addLog('v1', `Unloading model: ${modelName}`);
    try {
      await openarc.unloadModel({ model_name: modelName });
      appState.addLog('v2', `Model ${modelName} unloaded successfully`);
    } catch (e) {
      console.error(e);
      appState.addLog('error', `Failed to unload model: ${modelName}`, String(e));
    }
  }

  // derived server vitals for the header chips
  const cpuUsage = $derived(openarc.metrics?.cpus?.[0]?.usage ?? null);
  const ramPct = $derived.by(() => {
    const m = openarc.metrics;
    if (!m || !m.total_ram) return null;
    return (m.used_ram / m.total_ram) * 100;
  });
  const gpuCount = $derived(openarc.metrics?.gpus?.length ?? 0);
  const npuCount = $derived(openarc.metrics?.npus?.length ?? 0);
  const serverVersion = $derived(openarc.version?.version ?? null);
</script>

<div class="flex h-full w-full overflow-hidden bg-background">
  {#if appState.leftPanelOpen}
    <aside class="w-[300px] shrink-0 border-r bg-muted/10 flex flex-col h-full overflow-hidden transition-all duration-200">
      <!-- Sidebar header -->
      <div class="shrink-0 px-4 pt-4 pb-3 border-b bg-gradient-to-b from-muted/30 to-transparent">
        <div class="flex items-center gap-2.5 mb-1">
          <div class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Network class="w-4 h-4 text-primary" />
          </div>
          <div class="min-w-0">
            <div class="font-bold text-sm tracking-tight leading-tight">API Explorer</div>
            <div class="text-[11px] text-muted-foreground leading-tight mt-0.5">
              {endpoints.length} endpoint{endpoints.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      </div>

      <ScrollArea class="flex-1 min-h-0">
        <div class="p-2 space-y-0.5">
          {#each endpoints as ep}
            {@const isActive = selectedEndpoint === ep.path && selectedMethod === ep.method && activeTab === "endpoints"}
            <button
              class="group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md border transition-all
                {isActive
                  ? 'bg-background border-primary/50 shadow-sm ring-1 ring-primary/20'
                  : 'bg-transparent border-transparent hover:bg-background hover:border-border'}"
              onclick={() => { selectedEndpoint = ep.path; selectedMethod = ep.method; activeTab = 'endpoints'; }}
            >
              <span
                class="shrink-0 text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded border leading-none w-[44px] text-center
                  {ep.method === 'GET'
                    ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
                    : ep.method === 'POST'
                      ? 'text-blue-500 bg-blue-500/10 border-blue-500/20'
                      : 'text-destructive bg-destructive/10 border-destructive/20'}"
              >
                {ep.method}
              </span>
              <span
                class="font-mono text-[11.5px] truncate {isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}"
              >
                {ep.path}
              </span>
            </button>
          {/each}
        </div>
      </ScrollArea>
    </aside>
  {/if}

  <main class="flex-1 h-full flex flex-col min-w-0 bg-background overflow-hidden">
    <!-- Header -->
    <header class="shrink-0 px-6 pt-4 pb-3 border-b bg-gradient-to-b from-muted/20 to-background">
      <div class="flex items-center justify-between gap-4 mb-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Server class="w-4 h-4 text-primary" />
          </div>
          <div class="min-w-0">
            <h1 class="text-base font-bold tracking-tight leading-tight">Server</h1>
            <p class="text-xs text-muted-foreground leading-tight mt-0.5">
              {#if openarc.isOnline}
                Connected{serverVersion ? ` · v${serverVersion}` : ""}
              {:else if openarc.error}
                Connection error
              {:else}
                Not connected
              {/if}
            </p>
          </div>
        </div>

        <!-- Connection state pill + vitals chips -->
        <div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {#if openarc.isOnline}
            <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-md">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Online
            </span>
          {:else if openarc.error}
            <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-red-500/10 text-red-500 border border-red-500/30 px-2 py-1 rounded-md">
              <AlertCircle class="w-3 h-3" />
              Offline
            </span>
          {:else}
            <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2 py-1 rounded-md">
              <Loader2 class="w-3 h-3 animate-spin" />
              Connecting
            </span>
          {/if}

          {#if cpuUsage !== null}
            <span class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border">
              <Cpu class="w-3 h-3 text-muted-foreground" />
              <span class="text-muted-foreground">CPU</span>
              <span class="font-mono tabular-nums">{cpuUsage.toFixed(0)}%</span>
            </span>
          {/if}
          {#if ramPct !== null}
            <span class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border">
              <MemoryStick class="w-3 h-3 text-muted-foreground" />
              <span class="text-muted-foreground">RAM</span>
              <span class="font-mono tabular-nums">{ramPct.toFixed(0)}%</span>
            </span>
          {/if}
          {#if gpuCount > 0}
            <span class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border">
              <HardDrive class="w-3 h-3 text-muted-foreground" />
              <span class="text-muted-foreground">GPU</span>
              <span class="font-mono tabular-nums">{gpuCount}</span>
            </span>
          {/if}
          {#if npuCount > 0}
            <span class="inline-flex items-center gap-1.5 text-[11px] bg-muted/50 text-foreground px-2 py-1 rounded-md border">
              <Activity class="w-3 h-3 text-muted-foreground" />
              <span class="text-muted-foreground">NPU</span>
              <span class="font-mono tabular-nums">{npuCount}</span>
            </span>
          {/if}
        </div>
      </div>

      <!-- Tab pills -->
      <div class="flex items-center gap-1.5">
        <button
          class="text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors
            {activeTab === 'endpoints'
              ? 'bg-foreground text-background border-foreground'
              : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground'}"
          onclick={() => activeTab = 'endpoints'}
        >
          API Explorer
        </button>
        <button
          class="text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1.5
            {activeTab === 'models'
              ? 'bg-foreground text-background border-foreground'
              : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground'}"
          onclick={() => activeTab = 'models'}
        >
          Loaded models
          <span class="text-[9px] font-bold tabular-nums px-1 rounded
            {activeTab === 'models' ? 'bg-background/20' : 'bg-muted text-foreground/70'}">
            {loadedModels.length}
          </span>
        </button>
      </div>
    </header>

    <!-- Body -->
    <div class="flex-1 min-h-0 overflow-hidden flex flex-col bg-muted/5">
      {#if activeTab === 'endpoints'}
        {@const endpointInfo = endpoints.find(e => e.path === selectedEndpoint && e.method === selectedMethod)}
        {#if endpointInfo}
          <!-- Endpoint meta strip -->
          <div class="shrink-0 px-6 pt-5 pb-4 border-b bg-background">
            <div class="flex items-center gap-2.5 mb-2">
              <span
                class="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded border leading-none
                  {endpointInfo.method === 'GET'
                    ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
                    : endpointInfo.method === 'POST'
                      ? 'text-blue-500 bg-blue-500/10 border-blue-500/20'
                      : 'text-destructive bg-destructive/10 border-destructive/20'}"
              >
                {endpointInfo.method}
              </span>
              <span class="font-mono text-sm font-semibold truncate">{endpointInfo.path}</span>
            </div>
            {#if endpointInfo.description}
              <p class="text-xs text-muted-foreground leading-snug">{endpointInfo.description}</p>
            {/if}
          </div>

          {#if endpointInfo.method === 'GET'}
            {@const data = endpointInfo.data ? endpointInfo.data() : null}
            <div class="flex-1 min-h-0 overflow-hidden p-4">
              <div class="h-full rounded-lg bg-slate-950 border border-border shadow-inner overflow-hidden flex flex-col">
                <div class="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-white/[0.02]">
                  <div class="flex items-center gap-1">
                    <span class="w-2 h-2 rounded-full bg-red-500/60"></span>
                    <span class="w-2 h-2 rounded-full bg-amber-500/60"></span>
                    <span class="w-2 h-2 rounded-full bg-emerald-500/60"></span>
                  </div>
                  <span class="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Live response</span>
                  <span class="ml-auto text-[10px] font-mono text-slate-500">application/json</span>
                </div>
                <ScrollArea class="flex-1 min-h-0">
                  <pre class="px-4 py-3 font-mono text-[12.5px] text-emerald-400 leading-relaxed"><code>{data ? JSON.stringify(data, null, 2) : "Waiting for connection or data..."}</code></pre>
                </ScrollArea>
              </div>
            </div>
          {:else}
            <ScrollArea class="flex-1 min-h-0">
              <div class="px-6 py-5 space-y-6">
                {#if endpointInfo.requestBody}
                  <div class="space-y-2.5">
                    <div class="flex items-center gap-2">
                      <div class="h-[2px] w-3 rounded-full bg-blue-500"></div>
                      <span class="text-[10px] font-bold uppercase tracking-widest text-foreground/80">Request body</span>
                      <span class="text-[10px] text-muted-foreground ml-auto tabular-nums">{endpointInfo.requestBody.length}</span>
                    </div>
                    <div class="border rounded-lg overflow-hidden bg-background">
                      <table class="w-full text-sm">
                        <thead class="bg-muted/40 border-b">
                          <tr class="text-left">
                            <th class="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-1/3">Parameter</th>
                            <th class="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-1/4">Type</th>
                            <th class="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-border/50">
                          {#each endpointInfo.requestBody as param}
                            <tr class="hover:bg-muted/20">
                              <td class="px-3 py-2.5 font-mono text-[11.5px]">
                                {param.name}
                                {#if param.required}
                                  <span class="text-destructive ml-1">*</span>
                                {/if}
                              </td>
                              <td class="px-3 py-2.5 font-mono text-[10.5px] text-muted-foreground">{param.type}</td>
                              <td class="px-3 py-2.5 text-[12px] text-muted-foreground">{param.description}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {#if endpointInfo.reqExample}
                    <div class="space-y-2">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Example request</span>
                      <div class="rounded-lg bg-slate-950 border border-border overflow-hidden">
                        <pre class="p-3 font-mono text-[11.5px] overflow-auto text-blue-400"><code>{JSON.stringify(endpointInfo.reqExample, null, 2)}</code></pre>
                      </div>
                    </div>
                  {/if}
                {/if}

                {#if endpointInfo.responseBody}
                  <div class="space-y-2.5">
                    <div class="flex items-center gap-2">
                      <div class="h-[2px] w-3 rounded-full bg-emerald-500"></div>
                      <span class="text-[10px] font-bold uppercase tracking-widest text-foreground/80">Response body</span>
                      <span class="text-[10px] text-muted-foreground ml-auto tabular-nums">{endpointInfo.responseBody.length}</span>
                    </div>
                    <div class="border rounded-lg overflow-hidden bg-background">
                      <table class="w-full text-sm">
                        <thead class="bg-muted/40 border-b">
                          <tr class="text-left">
                            <th class="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-1/3">Property</th>
                            <th class="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-1/4">Type</th>
                            <th class="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-border/50">
                          {#each endpointInfo.responseBody as param}
                            <tr class="hover:bg-muted/20">
                              <td class="px-3 py-2.5 font-mono text-[11.5px]">
                                {param.name}
                                {#if param.required}
                                  <span class="text-destructive ml-1">*</span>
                                {/if}
                              </td>
                              <td class="px-3 py-2.5 font-mono text-[10.5px] text-muted-foreground">{param.type}</td>
                              <td class="px-3 py-2.5 text-[12px] text-muted-foreground">{param.description}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {#if endpointInfo.resExample}
                    <div class="space-y-2">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Example response</span>
                      <div class="rounded-lg bg-slate-950 border border-border overflow-hidden">
                        <pre class="p-3 font-mono text-[11.5px] overflow-auto text-emerald-400"><code>{typeof endpointInfo.resExample === 'string' ? endpointInfo.resExample : JSON.stringify(endpointInfo.resExample, null, 2)}</code></pre>
                      </div>
                    </div>
                  {/if}
                {/if}
              </div>
            </ScrollArea>
          {/if}
        {/if}
      {:else if activeTab === 'models'}
        {#if loadedModels.length === 0}
          <div class="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
            <div class="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center mb-4">
              <Cpu class="w-8 h-8 text-primary/40" />
            </div>
            <p class="text-base font-semibold text-foreground">No models loaded</p>
            <p class="text-sm mt-1.5 max-w-sm text-muted-foreground">
              {#if openarc.isOnline}
                The OpenArc server is online but has no models loaded. Load a model from the Models page to see it here.
              {:else}
                Connect to an OpenArc server to view and manage loaded models.
              {/if}
            </p>
          </div>
        {:else}
          <ScrollArea class="flex-1 min-h-0">
            <div class="p-4 space-y-1">
              <div class="flex items-center gap-2 px-1 py-1.5 mb-1">
                <div class="h-[2px] w-3 rounded-full bg-emerald-500"></div>
                <span class="text-[10px] font-bold uppercase tracking-widest text-foreground/80">Active in session</span>
                <span class="text-[10px] text-muted-foreground ml-auto tabular-nums">{loadedModels.length}</span>
              </div>
              {#each loadedModels as model}
                {@const arch = (resolveModelType(model.type)?.label) ?? String(model.type ?? "UNKNOWN").toUpperCase()}
                {@const isLoading = model.status === 'loading'}
                <div class="group relative flex items-center gap-3 px-3 py-2.5 rounded-md border bg-background border-border hover:bg-muted/30 transition-all">
                  <div
                    class="w-1 self-stretch rounded-full {isLoading ? 'bg-amber-500 animate-pulse' : getArchAccent(arch)}"
                  ></div>

                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-0.5">
                      <span class="font-semibold text-sm truncate text-foreground" title={model.name}>
                        {model.name}
                      </span>
                      {#if isLoading}
                        <Loader2 class="w-3.5 h-3.5 text-amber-500 animate-spin shrink-0" />
                      {:else}
                        <CheckCircle2 class="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      {/if}
                      <span
                        class="ml-auto shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border {getArchColor(arch)}"
                      >
                        {arch}
                      </span>
                    </div>
                    <div class="flex flex-wrap items-center gap-1.5 mt-1">
                      {#if model.engine}
                        <span class="inline-flex items-center gap-1 text-[10.5px] bg-muted/50 text-foreground px-1.5 py-0.5 rounded border">
                          <span class="text-muted-foreground">engine</span>
                          <span class="font-mono uppercase">{model.engine}</span>
                        </span>
                      {/if}
                      {#if model.device}
                        <span class="inline-flex items-center gap-1 text-[10.5px] bg-muted/50 text-foreground px-1.5 py-0.5 rounded border">
                          <span class="text-muted-foreground">device</span>
                          <span class="font-mono uppercase">{model.device}</span>
                        </span>
                      {/if}
                      {#if isLoading}
                        <span class="inline-flex items-center gap-1 text-[10.5px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-semibold">
                          <Loader2 class="w-3 h-3 animate-spin" />
                          Loading
                        </span>
                      {/if}
                    </div>
                  </div>

                  <div class="flex items-center shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-8 gap-1.5 text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10"
                      onclick={() => handleUnload(model.name)}
                      disabled={isLoading}
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                      Unload
                    </Button>
                  </div>
                </div>
              {/each}
            </div>
          </ScrollArea>
        {/if}
      {/if}
    </div>
  </main>

  {#if appState.rightPanelOpen}
    <aside class="w-[320px] shrink-0 border-l bg-background flex flex-col h-full overflow-hidden">
      <!-- Sidebar header -->
      <div class="shrink-0 px-5 pt-4 pb-4 border-b bg-gradient-to-b from-muted/20 to-transparent">
        <div class="flex items-center gap-2.5 mb-1">
          <div class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Sparkles class="w-4 h-4 text-primary" />
          </div>
          <div class="min-w-0">
            <div class="font-bold text-sm tracking-tight leading-tight">Load model</div>
            <div class="text-[11px] text-muted-foreground leading-tight mt-0.5">
              Quick-load into the running server
            </div>
          </div>
        </div>
      </div>

      <ScrollArea class="flex-1 min-h-0">
        <div class="p-5 space-y-4">
          <div class="space-y-1.5">
            <label for="model-select" class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Select model
            </label>
            <select
              id="model-select"
              class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer hover:bg-muted/50"
            >
              <option>DeepSeek-R1</option>
            </select>
          </div>

          <Button class="w-full h-9 gap-2 font-medium" disabled={!openarc.status || openarc.status.status !== 'ready'}>
            <Sparkles class="w-4 h-4" />
            Load into server
          </Button>

          {#if !openarc.isOnline}
            <div class="flex items-start gap-2 p-2.5 rounded-md border border-amber-500/30 bg-amber-500/5 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertCircle class="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span class="leading-snug">Server is offline — loading is disabled until the connection is restored.</span>
            </div>
          {/if}
        </div>
      </ScrollArea>
    </aside>
  {/if}
</div>
