<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { appState } from "$lib/state.svelte.js";
  import { openarc } from "$lib/client.svelte.js";
  import { Cpu, Loader2, Sparkles, Trash2, Network } from "@lucide/svelte";

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
</script>

<div class="flex h-full w-full overflow-hidden bg-background">
  {#if appState.leftPanelOpen}
    <aside class="w-[340px] shrink-0 border-r bg-muted/10 flex flex-col p-4 overflow-y-auto h-full transition-all duration-200">
      <div class="flex items-center gap-2 mb-6 text-foreground">
        <Network class="w-5 h-5 text-primary" />
        <div class="font-bold text-lg tracking-tight">API Endpoints</div>
      </div>
      
      <div class="space-y-1.5">
        {#each endpoints as ep}
          <button 
            class="w-full text-left px-3 py-2.5 rounded-md text-sm font-mono transition-all duration-200 {selectedEndpoint === ep.path && selectedMethod === ep.method ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/20 shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
            onclick={() => { selectedEndpoint = ep.path; selectedMethod = ep.method; activeTab = 'endpoints'; }}
          >
            <span class="text-xs font-bold mr-2 px-1.5 py-0.5 rounded {ep.method === 'GET' ? 'text-emerald-500 bg-emerald-500/10' : ep.method === 'POST' ? 'text-blue-500 bg-blue-500/10' : 'text-destructive bg-destructive/10'}">{ep.method}</span>
            {ep.path}
          </button>
        {/each}
      </div>
    </aside>
  {/if}

  <main class="flex-1 h-full flex flex-col min-w-0 bg-background relative">
    <header class="h-14 border-b flex items-center px-6 gap-6 shadow-sm bg-background/95 backdrop-blur z-10 shrink-0">
      <button 
        class="font-semibold text-sm border-b-2 h-full px-2 transition-colors {activeTab === 'endpoints' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}" 
        onclick={() => activeTab = 'endpoints'}
      >
        API Explorer
      </button>
      <button 
        class="font-semibold text-sm border-b-2 h-full px-2 transition-colors {activeTab === 'models' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}" 
        onclick={() => activeTab = 'models'}
      >
        Models
      </button>
    </header>

    <div class="flex-1 overflow-hidden p-6 bg-muted/5 flex flex-col">
      {#if activeTab === 'endpoints'}
        {@const endpointInfo = endpoints.find(e => e.path === selectedEndpoint && e.method === selectedMethod)}
        {#if endpointInfo}
          <div class="mb-4">
            <h2 class="text-xl font-bold flex items-center gap-3">
              <span class="text-sm font-bold px-2 py-1 rounded {endpointInfo.method === 'GET' ? 'text-emerald-500 bg-emerald-500/10' : endpointInfo.method === 'POST' ? 'text-blue-500 bg-blue-500/10' : 'text-destructive bg-destructive/10'}">{endpointInfo.method}</span>
              <span class="font-mono">{endpointInfo.path}</span>
            </h2>
            {#if endpointInfo.description}
              <p class="text-muted-foreground mt-2">{endpointInfo.description}</p>
            {/if}
          </div>

          {#if endpointInfo.method === 'GET'}
            {@const data = endpointInfo.data ? endpointInfo.data() : null}
            <div class="flex-1 rounded-xl bg-slate-950 p-4 border border-border shadow-inner font-mono text-[13px] overflow-auto text-emerald-400 leading-relaxed">
              <pre><code>{data ? JSON.stringify(data, null, 2) : "Waiting for connection or data..."}</code></pre>
            </div>
          {:else}
            <ScrollArea class="flex-1 pr-4">
              <div class="space-y-6 pb-6">
                {#if endpointInfo.requestBody}
                  <div class="space-y-3">
                    <h3 class="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Request Body parameters</h3>
                    <div class="border rounded-md overflow-hidden bg-card">
                      <table class="w-full text-sm">
                        <thead class="bg-muted/50 border-b">
                          <tr class="text-left">
                            <th class="px-4 py-2.5 font-medium text-muted-foreground w-1/3">Parameter</th>
                            <th class="px-4 py-2.5 font-medium text-muted-foreground w-1/4">Type</th>
                            <th class="px-4 py-2.5 font-medium text-muted-foreground">Description</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-border/50">
                          {#each endpointInfo.requestBody as param}
                            <tr class="hover:bg-muted/20">
                              <td class="px-4 py-3 font-mono text-xs">
                                {param.name}
                                {#if param.required}
                                  <span class="text-destructive ml-1.5">*</span>
                                {/if}
                              </td>
                              <td class="px-4 py-3 font-mono text-[11px] text-muted-foreground">{param.type}</td>
                              <td class="px-4 py-3 text-muted-foreground">{param.description}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {#if endpointInfo.reqExample}
                    <div class="space-y-2">
                      <h4 class="text-xs font-semibold text-muted-foreground">Example Request</h4>
                      <div class="rounded-md bg-slate-950 p-3 border border-border font-mono text-xs overflow-auto text-blue-400">
                        <pre><code>{JSON.stringify(endpointInfo.reqExample, null, 2)}</code></pre>
                      </div>
                    </div>
                  {/if}
                {/if}

                <div class="h-px bg-border my-2"></div>

                {#if endpointInfo.responseBody}
                  <div class="space-y-3">
                    <h3 class="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Response Body format</h3>
                    <div class="border rounded-md overflow-hidden bg-card">
                      <table class="w-full text-sm">
                        <thead class="bg-muted/50 border-b">
                          <tr class="text-left">
                            <th class="px-4 py-2.5 font-medium text-muted-foreground w-1/3">Property</th>
                            <th class="px-4 py-2.5 font-medium text-muted-foreground w-1/4">Type</th>
                            <th class="px-4 py-2.5 font-medium text-muted-foreground">Description</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-border/50">
                          {#each endpointInfo.responseBody as param}
                            <tr class="hover:bg-muted/20">
                              <td class="px-4 py-3 font-mono text-xs">
                                {param.name}
                                {#if param.required}
                                  <span class="text-destructive ml-1.5">*</span>
                                {/if}
                              </td>
                              <td class="px-4 py-3 font-mono text-[11px] text-muted-foreground">{param.type}</td>
                              <td class="px-4 py-3 text-muted-foreground">{param.description}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {#if endpointInfo.resExample}
                    <div class="space-y-2">
                      <h4 class="text-xs font-semibold text-muted-foreground">Example Response</h4>
                      <div class="rounded-md bg-slate-950 p-3 border border-border font-mono text-xs overflow-auto text-emerald-400">
                        <pre><code>{typeof endpointInfo.resExample === 'string' ? endpointInfo.resExample : JSON.stringify(endpointInfo.resExample, null, 2)}</code></pre>
                      </div>
                    </div>
                  {/if}
                {/if}
              </div>
            </ScrollArea>
          {/if}
        {/if}
      {:else if activeTab === 'models'}
        <ScrollArea class="h-full pr-4">
          <div class="space-y-4">
            <h2 class="text-lg font-bold tracking-tight">Models loaded in this session</h2>
            
            {#if loadedModels.length === 0}
              <div class="text-center text-muted-foreground p-8 bg-background border rounded-xl border-dashed">
                <Cpu class="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p>No models are currently loaded in the OpenArc server.</p>
              </div>
            {/if}

            <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {#each loadedModels as model}
                <div class="bg-card border rounded-xl p-5 shadow-sm relative overflow-hidden group">
                  {#if model.status === 'loading'}
                    <div class="absolute top-0 left-0 w-full h-1 bg-muted overflow-hidden">
                      <div class="h-full bg-amber-500 w-full animate-pulse"></div>
                    </div>
                  {/if}
                  <div class="flex justify-between items-start mb-4">
                    <div>
                      <h4 class="font-semibold text-base flex items-center gap-2">
                        <span class="truncate max-w-[250px] block" title={model.name}>{model.name}</span>
                        {#if model.status === 'loading'}
                          <span class="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse flex items-center gap-1 whitespace-nowrap">
                            <Loader2 class="w-3 h-3 animate-spin" /> Loading
                          </span>
                        {:else}
                          <span class="relative flex h-2 w-2">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                        {/if}
                      </h4>
                      <p class="text-xs text-muted-foreground font-mono mt-1">
                        ID: {model.name}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" class="text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/20 shadow-none h-8" onclick={() => handleUnload(model.name)} disabled={model.status === 'loading'}>
                      <Trash2 class="w-3 h-3 mr-1.5" />
                      Unload
                    </Button>
                  </div>

                  <div class="grid grid-cols-2 gap-3 text-sm">
                    <div class="bg-muted/30 p-2 rounded-lg border border-border/50">
                      <div class="text-xs text-muted-foreground mb-0.5">Architecture Type</div>
                      <div class="font-medium uppercase">{model.type}</div>
                    </div>
                    <div class="bg-muted/30 p-2 rounded-lg border border-border/50">
                      <div class="text-xs text-muted-foreground mb-0.5">Execution Engine</div>
                      <div class="font-medium capitalize">{model.engine}</div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </ScrollArea>
      {/if}
    </div>
  </main>

  {#if appState.rightPanelOpen}
    <aside class="w-[300px] shrink-0 border-l bg-background flex flex-col p-5 overflow-y-auto h-full transition-all duration-300 shadow-2xl z-20">
      <h2 class="font-bold text-lg tracking-tight mb-6">Load Model</h2>
      <div class="space-y-5">
        <div class="space-y-2">
          <label for="model-select" class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Select Model</label>
          <select id="model-select" class="flex h-10 w-full rounded-md border border-input bg-muted/50 px-3 text-sm font-medium shadow-sm">
            <option>DeepSeek-R1</option>
          </select>
        </div>
        <Button class="w-full h-10 font-semibold" disabled={!openarc.status || openarc.status.status !== 'ready'}>Load into Server</Button>
      </div>
    </aside>
  {/if}
</div>