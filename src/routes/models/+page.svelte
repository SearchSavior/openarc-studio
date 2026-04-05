<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import * as Table from "$lib/components/ui/table";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Search, Trash2, Play, HardDrive, Calendar, FolderOpen, Pencil, Loader2, AlertTriangle, Zap, Settings2, ChevronDown, Bot } from "@lucide/svelte";
  import { appState } from "$lib/state.svelte.js";
  import { openarc } from "$lib/client.svelte.js";

  import ModelConfigModal from "$lib/components/layout/ModelConfigModal.svelte";
  import DeviceSelectionModal from "$lib/components/layout/DeviceSelectionModal.svelte";

  let searchQuery = $state("");
  let configModalOpen = $state(false);
  let deviceModalOpen = $state(false);
  let deleteModalOpen = $state(false);
  let draftDropdownOpen = $state(false);
  let selectedModelForConfig = $state<any>(null);
  let selectedModelForLoad = $state<any>(null);
  let modelToDelete = $state<any>(null);
  let isDeleting = $state(false);

  const confirmDelete = async () => {
      if (!modelToDelete) return;
      isDeleting = true;
      appState.addLog('v1', `Deleting model ${modelToDelete.name}...`);
      try {
          await openarc.deleteLocalModel(modelToDelete.path);
          appState.addLog('info', `Successfully deleted model ${modelToDelete.name}`);
          deleteModalOpen = false;
          modelToDelete = null;
          if (selectedModelId === modelToDelete?.id) selectedModelId = null;
      } catch(e: any) {
          console.error("Failed to delete model", e);
          appState.addLog('error', `Failed to delete model ${modelToDelete.name}`, e.toString());
      } finally {
          isDeleting = false;
      }
  };

  let selectedArchitectures = $state<Record<string, boolean>>({
    LLM: true,
    VLM: true,
    TTS: true,
    STT: true
  });
  let sortBy = $state("name");

  const models = $derived(openarc.localModels?.models?.map((m: any) => ({
      id: m.id,
      name: m.model_name || m.id,
      size: "-", // compute size later
      architecture: (m.model_type || "unknown").toUpperCase(),
      quantization: "-", // parse from name
      path: m.path,
      dateAdded: "Recently", // get from file stat
      hasConfig: m.has_config,
      engine: m.engine,
      vlmType: m.vlm_type,
      draftModelPath: m.draft_model_path,
      draftDevice: m.draft_device,
      numAssistantTokens: m.num_assistant_tokens,
      assistantConfidenceThreshold: m.assistant_confidence_threshold,
      runtimeConfig: m.runtime_config
  })) || []);

  const filteredModels = $derived(models.filter((m: any) => {
      if (searchQuery.trim() && !m.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
      }
      
      let archCategory = "UNKNOWN";
      if (['LLM'].includes(m.architecture)) archCategory = "LLM";
      else if (['VLM'].includes(m.architecture)) archCategory = "VLM";
      else if (['STT', 'WHISPER'].includes(m.architecture)) archCategory = "STT";
      else if (['TTS', 'KOKORO'].includes(m.architecture)) archCategory = "TTS";
      
      if (archCategory !== "UNKNOWN" && !selectedArchitectures[archCategory]) {
          return false;
      }

      return true;
  }).sort((a: any, b: any) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "architecture") return a.architecture.localeCompare(b.architecture);
      return 0;
  }));

  let selectedModelId = $state<string | null>(null);

  let sidebarModelName = $state("");
  let sidebarModelType = $state("LLM");
  let sidebarEngine = $state("AUTO");
  let sidebarVlmType = $state("");
  let sidebarDraftModelPath = $state("");
  let sidebarDraftDevice = $state("CPU");
  let sidebarNumAssistantTokens = $state<number | null>(null);
  let sidebarAssistantConfidenceThreshold = $state<number | null>(null);
  let sidebarRuntimeConfig = $state("{}");
  
  let savingSidebar = $state(false);
  let savedSuccess = $state(false);

  const saveSidebarConfig = async () => {
    const match = models.find((m: any) => m.id === selectedModelId);
    if (!match || !match.path) return;
    
    savingSidebar = true;
    savedSuccess = false;
    appState.addLog('v1', `Saving sidebar config for ${sidebarModelName}...`);
    try {
        let parsedRuntimeConfig = {};
        try { parsedRuntimeConfig = JSON.parse(sidebarRuntimeConfig); } catch (e) {
            appState.addLog('warn', `Failed to parse runtime config JSON for ${sidebarModelName}`, (e as Error).toString());
        }

        const config: any = {
            model_name: sidebarModelName,
            model_type: sidebarModelType,
            engine: sidebarEngine === "AUTO" ? null : sidebarEngine,
            vlm_type: sidebarVlmType || null,
            draft_model_path: sidebarDraftModelPath || null,
            draft_device: sidebarDraftDevice || "CPU",
            num_assistant_tokens: sidebarNumAssistantTokens || null,
            assistant_confidence_threshold: sidebarAssistantConfidenceThreshold || null,
            runtime_config: parsedRuntimeConfig
        };
        await openarc.updateModelConfig(match.path, config);
        appState.addLog('info', `Successfully updated sidebar config for ${sidebarModelName}`);
        savedSuccess = true;
        setTimeout(() => { savedSuccess = false; }, 2000);
    } catch (e: any) {
        console.error("Failed to save config", e);
        appState.addLog('error', `Failed to save sidebar config for ${sidebarModelName}`, e.toString());
    } finally {
        savingSidebar = false;
    }
  };

  const getArchColor = (arch: string) => {
    switch (arch) {
      case 'LLM': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'VLM': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'STT': case 'WHISPER': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'TTS': case 'KOKORO': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getModelStatus = (name: string) => {
      const models = openarc.status?.models || [];
      const match = models.find((m: any) => m.model_name === name);
      return match ? match.status : 'unloaded';
  };

  const handleLoad = async (model: any, device: string = "AUTO") => {
      let modelType = "llm";
      let defaultEngine = "ovgenai";
      
      const arch = (model.architecture || model.type || "LLM").toUpperCase();
      if (arch === "VLM") {
          modelType = "vlm";
          defaultEngine = "ovgenai";
      } else if (arch === "STT" || arch === "WHISPER") {
          modelType = "whisper";
          defaultEngine = "optimum";
      } else if (arch === "TTS" || arch === "KOKORO") {
          modelType = "kokoro";
          defaultEngine = "openvino";
      } else if (arch === "EMBEDDING" || arch === "EMB") {
          modelType = "emb";
          defaultEngine = "optimum";
      } else if (arch === "RERANKER" || arch === "RERANK") {
          modelType = "rerank";
          defaultEngine = "optimum";
      }

      const engine = (model.engine && model.engine !== "AUTO") ? model.engine : defaultEngine;

      appState.addLog('v1', `Queuing model load for ${model.name}...`, `Type: ${modelType}, Engine: ${engine}, Device: ${device}`);
      try {
          await openarc.loadModel({
              model_path: model.path,
              model_name: model.name,
              model_type: modelType,
              engine: engine,
              device: device,
              vlm_type: model.vlmType || null,
              draft_model_path: model.draftModelPath || null,
              draft_device: model.draftDevice || null,
              num_assistant_tokens: model.numAssistantTokens ? Number(model.numAssistantTokens) : null,
              assistant_confidence_threshold: model.assistantConfidenceThreshold ? Number(model.assistantConfidenceThreshold) : null,
              runtime_config: model.runtimeConfig || {}
          });
          appState.addLog('info', `Successfully initiated load for ${model.name}`);
      } catch(e: any) {
          console.error("Failed to load model:", e);
          appState.addLog('error', `Failed to load model ${model.name}`, e.toString());
      }
  };

  const triggerLoad = (model: any) => {
      if (!model.hasConfig || model.architecture === "UNKNOWN") {
          selectedModelForConfig = model;
          configModalOpen = true;
          return;
      }
      selectedModelForLoad = model;
      deviceModalOpen = true;
  };

  import { onMount } from "svelte";
  onMount(() => {
    appState.addLog('info', 'Models page initialized, refreshing local models...');
    openarc.refreshLocalModels();
  });
</script>

<div class="flex h-full w-full overflow-hidden bg-background">
  {#if appState.leftPanelOpen}
    <aside class="w-[280px] shrink-0 border-r bg-muted/10 flex flex-col p-5 overflow-y-auto h-full transition-all duration-200">
      <div class="flex items-center gap-2 mb-6">
        <div class="p-2 bg-primary/10 rounded-md">
          <HardDrive class="w-5 h-5 text-primary" />
        </div>
        <div class="font-bold text-lg tracking-tight">Local Library</div>
      </div>
      
      <div class="space-y-6">
        <div class="relative">
          <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input id="search" bind:value={searchQuery} placeholder="Search local models..." class="pl-9 h-9 bg-background" />
        </div>
        
        <div>
          <h3 class="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Architecture</h3>
          <div class="space-y-2.5 text-sm">
            <label class="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" bind:checked={selectedArchitectures.LLM} class="w-4 h-4 rounded border-input accent-primary" />
              <span class="group-hover:text-foreground transition-colors">LLM (Text Generation)</span>
            </label>
            <label class="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" bind:checked={selectedArchitectures.VLM} class="w-4 h-4 rounded border-input accent-primary" />
              <span class="group-hover:text-foreground transition-colors">VLM (Vision-Language)</span>
            </label>
            <label class="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" bind:checked={selectedArchitectures.TTS} class="w-4 h-4 rounded border-input accent-primary" />
              <span class="group-hover:text-foreground transition-colors">TTS (Text-to-Speech)</span>
            </label>
            <label class="flex items-center gap-3 cursor-pointer group">
              <input type="checkbox" bind:checked={selectedArchitectures.STT} class="w-4 h-4 rounded border-input accent-primary" />
              <span class="group-hover:text-foreground transition-colors">STT (Speech-to-Text)</span>
            </label>
          </div>
        </div>
      </div>
    </aside>
  {/if}

  <main class="flex-1 h-full flex flex-col min-w-0 bg-background relative">
    <header class="h-16 border-b flex items-center justify-between px-6 bg-background/95 backdrop-blur z-10 shrink-0">
      <div class="flex items-center gap-4">
        <h1 class="font-semibold text-lg">My Local Models</h1>
        <div class="h-4 w-px bg-border"></div>
        <span class="text-sm text-muted-foreground">{filteredModels.length} saved</span>
      </div>
      
      <div class="flex items-center gap-3">
        <label for="sort" class="text-sm font-medium text-muted-foreground">Sort by</label>
        <select id="sort" bind:value={sortBy} class="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer hover:bg-muted/50">
          <option value="name">Name (A-Z)</option>
          <option value="dateAdded">Date Added (Newest)</option>
          <option value="size">Size (Largest first)</option>
          <option value="architecture">Architecture</option>
        </select>
      </div>
    </header>

    <ScrollArea class="flex-1">
      <Table.Root class="w-full">
        <Table.Header class="bg-muted/30 sticky top-0 backdrop-blur-md">
          <Table.Row class="hover:bg-transparent border-b-border/50">
            <Table.Head class="h-12 px-6 font-medium text-muted-foreground w-[45%]">Model Details</Table.Head>
            <Table.Head class="h-12 px-4 font-medium text-muted-foreground">Format</Table.Head>
            <Table.Head class="h-12 px-4 font-medium text-muted-foreground">Size</Table.Head>
            <Table.Head class="h-12 px-6 font-medium text-muted-foreground text-right">Actions</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each filteredModels as model}
            <Table.Row 
              class="group cursor-pointer transition-all hover:bg-muted/30 data-[state=selected]:bg-muted/50 {selectedModelId === model.id ? 'bg-muted/40' : ''}"
              onclick={() => {
                selectedModelId = model.id;
                sidebarModelName = model.name;
                sidebarModelType = model.architecture === "UNKNOWN" ? "LLM" : model.architecture;
                sidebarEngine = model.engine || "AUTO";
                sidebarVlmType = model.vlmType || "";
                sidebarDraftModelPath = model.draftModelPath || "";
                sidebarDraftDevice = model.draftDevice || "CPU";
                sidebarNumAssistantTokens = model.numAssistantTokens || null;
                sidebarAssistantConfidenceThreshold = model.assistantConfidenceThreshold || null;
                sidebarRuntimeConfig = model.runtimeConfig ? JSON.stringify(model.runtimeConfig, null, 2) : "{}";
              }}
            >
              <Table.Cell class="px-6 py-4">
                <div class="flex flex-col gap-1.5">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-foreground text-base tracking-tight">{model.name}</span>
                    {#if !model.hasConfig}
                      <div class="text-amber-500" title="Missing openarc.json. Setup required.">
                        <AlertTriangle class="w-4 h-4 cursor-pointer" />
                      </div>
                    {/if}
                    {#if getModelStatus(model.name) === 'loading'}
                      <span class="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">
                        <Loader2 class="w-3 h-3 animate-spin" /> Loading
                      </span>
                    {:else}
                      <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest {getArchColor(model.architecture)}">
                        {model.architecture}
                      </span>
                    {/if}
                  </div>
                  <div class="flex items-center gap-3 text-xs text-muted-foreground">
                    <span class="flex items-center gap-1 max-w-[200px] truncate" title={model.path}>
                      <FolderOpen class="w-3 h-3" /> {model.path}
                    </span>
                    <span class="flex items-center gap-1"><Calendar class="w-3 h-3" /> {model.dateAdded}</span>
                  </div>
                </div>
              </Table.Cell>
              
              <Table.Cell class="px-4 py-4 align-middle">
                <div class="flex items-center gap-2">
                  <div class="text-sm font-medium bg-muted/50 px-2.5 py-1 rounded-md text-muted-foreground inline-flex">
                    {model.quantization}
                  </div>
                </div>
              </Table.Cell>

              <Table.Cell class="px-4 py-4 align-middle text-sm text-muted-foreground font-medium">
                {model.size}
              </Table.Cell>

              <Table.Cell class="px-6 py-4 align-middle text-right">
                <div class="flex items-center justify-end gap-2">
                  {#if !model.hasConfig}
                    <Button variant="ghost" size="sm" class="h-8 gap-1.5 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10" title="Missing openarc.json. Setup required." onclick={(e) => { 
                      e.stopPropagation();
                      selectedModelForConfig = model;
                      configModalOpen = true;
                    }}>
                      <AlertTriangle class="w-3.5 h-3.5" /> Setup
                    </Button>
                  {:else if getModelStatus(model.name) === 'loading'}
                    <Button variant="secondary" size="sm" class="h-8 gap-1.5" disabled>
                      <Loader2 class="w-3.5 h-3.5 animate-spin" /> Loading
                    </Button>
                  {:else if getModelStatus(model.name) === 'loaded'}
                    <Button variant="outline" size="sm" class="h-8 gap-1.5 border-emerald-500/30 text-emerald-500 bg-emerald-500/10" disabled>
                      Loaded
                    </Button>
                  {:else}
                    <Button variant="secondary" size="sm" class="h-8 gap-1.5" onclick={(e) => { e.stopPropagation(); triggerLoad(model); }}>
                      <Play class="w-3.5 h-3.5 fill-current" /> Load
                    </Button>
                  {/if}
                  <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Delete Model" onclick={(e) => {
                    e.stopPropagation();
                    modelToDelete = model;
                    deleteModalOpen = true;
                  }}>
                    <Trash2 class="w-4 h-4" />
                  </Button>
                </div>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </ScrollArea>
  </main>

  {#if appState.rightPanelOpen}
    <aside class="w-[320px] shrink-0 border-l bg-background flex flex-col h-full shadow-2xl z-20 transition-all duration-300">
      {#if selectedModelId}
        {@const selectedModel = filteredModels.find((m: any) => m.id === selectedModelId)}
        {#if selectedModel}
          <div class="flex-1 overflow-y-auto p-6">
            <div class="flex items-start justify-between mb-6">
              <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center shrink-0">
                <span class="text-primary font-bold text-xl">{selectedModel?.architecture[0]}</span>
              </div>
              <div class="flex gap-2">
                 <span class="inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold {getArchColor(selectedModel?.architecture || '')}">
                   {selectedModel?.architecture}
                 </span>
              </div>
            </div>

            <div class="space-y-4 mb-6">
              <div class="grid gap-2">
                <label for="sb-name" class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Model Name</label>
                <Input id="sb-name" bind:value={sidebarModelName} class="h-9 bg-background" placeholder="e.g. Llama-3-8B" />
              </div>
              <div class="grid gap-2">
                <label for="sb-type" class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Model Type</label>
                <select id="sb-type" bind:value={sidebarModelType} class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer">
                  <option value="LLM">LLM (Text Generation)</option>
                  <option value="VLM">VLM (Vision-Language)</option>
                  <option value="STT">STT (Speech-to-Text)</option>
                  <option value="TTS">TTS (Text-to-Speech)</option>
                  <option value="EMBEDDING">Embedding</option>
                  <option value="RERANKER">Reranker</option>
                </select>
              </div>

              <div class="grid gap-2">
                <label for="sb-engine" class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Engine</label>
                <select id="sb-engine" bind:value={sidebarEngine} class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer">
                  <option value="AUTO">Auto-detect</option>
                  <option value="ovgenai">OpenVINO GenAI (ovgenai)</option>
                  <option value="optimum">Optimum Intel</option>
                  <option value="openvino">Raw OpenVINO Core</option>
                </select>
              </div>

              {#if sidebarModelType === "VLM"}
                <div class="grid gap-2 animate-in fade-in slide-in-from-top-1">
                  <label for="sb-vlm" class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vision Token Type (VLM)</label>
                  <Input id="sb-vlm" bind:value={sidebarVlmType} class="h-9 bg-background" placeholder="e.g. Qwen2-VL, Llava" />
                </div>
              {/if}

              <div class="pt-4 border-t border-border/50">
                  <h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Zap class="w-3.5 h-3.5 text-amber-500" /> Speculative Decoding
                  </h4>
                  <div class="space-y-3 p-3 bg-muted/20 border border-border/50 rounded-lg">
                    <div class="grid gap-1.5">
                        <label for="sb-draft-path" class="text-[10px] font-medium text-muted-foreground uppercase">Draft Model Path</label>
                        <div class="relative w-full">
                            <Input 
                                id="sb-draft-path" 
                                bind:value={sidebarDraftModelPath} 
                                onfocus={() => draftDropdownOpen = true} 
                                onblur={() => setTimeout(() => draftDropdownOpen = false, 150)}
                                class="h-8 text-xs bg-background pr-8" 
                                placeholder="Optional. Select or type path" 
                                autocomplete="off"
                            />
                            <button 
                                type="button" 
                                class="absolute right-0 top-0 h-full px-2 flex items-center text-muted-foreground/50 hover:text-foreground" 
                                onpointerdown={(e) => { e.preventDefault(); draftDropdownOpen = !draftDropdownOpen; }}
                            >
                                <ChevronDown class="w-4 h-4" />
                            </button>
                            
                            {#if draftDropdownOpen}
                                <div class="absolute top-[calc(100%+4px)] left-0 w-full z-50 bg-popover text-popover-foreground border border-border shadow-md rounded-md max-h-48 overflow-y-auto py-1 text-xs">
                                    {#each models.filter((m: any) => m.id !== selectedModelId && (!sidebarDraftModelPath || m.name.toLowerCase().includes(sidebarDraftModelPath.toLowerCase()) || m.path.toLowerCase().includes(sidebarDraftModelPath.toLowerCase()))) as model}
                                        <button 
                                            type="button"
                                            class="w-full text-left px-2 py-1.5 hover:bg-muted outline-none transition-colors flex flex-col gap-0.5" 
                                            onpointerdown={(e) => {
                                                e.preventDefault(); 
                                                sidebarDraftModelPath = model.path; 
                                                draftDropdownOpen = false; 
                                            }}
                                        >
                                            <div class="font-medium truncate flex items-center gap-1.5">
                                                <Bot class="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" /> {model.name}
                                            </div>
                                            <div class="text-[10px] text-muted-foreground truncate pl-5">
                                                {model.path}
                                            </div>
                                        </button>
                                    {:else}
                                        <div class="px-2 py-3 text-center text-muted-foreground">
                                            {#if sidebarDraftModelPath}
                                                Press enter to use custom path.
                                            {:else}
                                                No other installed models found.
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="grid gap-1.5">
                            <label for="sb-draft-device" class="text-[10px] font-medium text-muted-foreground uppercase">Draft Device</label>
                            <Input id="sb-draft-device" bind:value={sidebarDraftDevice} class="h-8 text-xs bg-background" placeholder="CPU" />
                        </div>
                        <div class="grid gap-1.5">
                            <label for="sb-num-tokens" class="text-[10px] font-medium text-muted-foreground uppercase">Assist Tokens</label>
                            <Input id="sb-num-tokens" type="number" bind:value={sidebarNumAssistantTokens} class="h-8 text-xs bg-background" placeholder="e.g. 5" />
                        </div>
                    </div>
                    <div class="grid gap-1.5">
                        <label for="sb-conf" class="text-[10px] font-medium text-muted-foreground uppercase">Confidence Threshold</label>
                        <Input id="sb-conf" type="number" step="0.1" bind:value={sidebarAssistantConfidenceThreshold} class="h-8 text-xs bg-background" placeholder="e.g. 0.4" />
                    </div>
                  </div>
              </div>

              <div class="pt-4 border-t border-border/50 pb-2">
                  <h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Settings2 class="w-3.5 h-3.5 text-primary" /> Runtime Config (JSON)
                  </h4>
                  <Textarea bind:value={sidebarRuntimeConfig} class="min-h-[80px] font-mono text-xs bg-muted/30 border-border/50 resize-y" placeholder={"\{\}"} />
              </div>
              
              <Button class="w-full gap-2 transition-all {savedSuccess ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20' : ''}" variant="outline" size="sm" onclick={saveSidebarConfig} disabled={savingSidebar || !sidebarModelName || !sidebarModelType}>
                {#if savingSidebar}
                  <Loader2 class="w-4 h-4 animate-spin" /> Saving...
                {:else if savedSuccess}
                  <Pencil class="w-4 h-4" /> Saved!
                {:else}
                  <Pencil class="w-4 h-4" /> Save Configuration
                {/if}
              </Button>
            </div>

            <div class="grid grid-cols-2 gap-4 mb-6">
              <div class="bg-muted/30 p-3 rounded-lg border border-border/50">
                <div class="text-xs text-muted-foreground mb-1">Format</div>
                <div class="font-medium">{selectedModel?.quantization}</div>
              </div>
              <div class="bg-muted/30 p-3 rounded-lg border border-border/50">
                <div class="text-xs text-muted-foreground mb-1">Size</div>
                <div class="font-medium">{selectedModel?.size}</div>
              </div>
            </div>
            
            <div class="space-y-4 mb-8">
              <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Location</h3>
              <div class="bg-muted/30 p-3 rounded-lg border border-border/50 break-all">
                <p class="text-sm font-mono text-muted-foreground">{selectedModel?.path}</p>
              </div>
            </div>
          </div>
          
          <div class="p-6 border-t bg-muted/10 space-y-3">
            {#if getModelStatus(selectedModel.name) === 'loading'}
              <Button class="w-full gap-2 font-medium bg-amber-500 hover:bg-amber-600 text-white" size="lg" disabled>
                <Loader2 class="w-4 h-4 animate-spin" /> Loading Model...
              </Button>
            {:else if getModelStatus(selectedModel.name) === 'loaded'}
              <Button class="w-full gap-2 font-medium" variant="outline" size="lg" disabled>
                Model is Active
              </Button>
            {:else}
              <Button class="w-full gap-2 font-medium" size="lg" onclick={() => triggerLoad(selectedModel)}>
                <Play class="w-4 h-4 fill-current" /> Load into Server
              </Button>
            {/if}
            <div class="flex gap-3">
              <Button variant="outline" class="w-full gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" size="lg" onclick={() => {
                modelToDelete = selectedModel;
                deleteModalOpen = true;
              }}>
                <Trash2 class="w-4 h-4" /> Delete Model
              </Button>
            </div>
          </div>
        {/if}
      {:else}
        <div class="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
          <div class="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <HardDrive class="w-8 h-8 opacity-50" />
          </div>
          <h3 class="font-medium text-foreground mb-1">No Model Selected</h3>
          <p class="text-sm">Select a local model from the list to view its details and configuration.</p>
        </div>
      {/if}
    </aside>
  {/if}
</div>

<DeviceSelectionModal
  bind:open={deviceModalOpen}
  modelName={selectedModelForLoad?.name || ""}
  onConfirm={(device) => {
    if (selectedModelForLoad) {
      handleLoad(selectedModelForLoad, device);
    }
  }}
/>

<ModelConfigModal 
  bind:open={configModalOpen} 
  modelInfo={selectedModelForConfig} 
  onSuccess={(config) => {
    if (selectedModelForConfig && config) {
      const updatedModel = {
        ...selectedModelForConfig,
        name: config.model_name,
        architecture: config.model_type,
        hasConfig: true
      };
      selectedModelForLoad = updatedModel;
      deviceModalOpen = true;
    }
  }}
/>

<Dialog.Root bind:open={deleteModalOpen}>
  <Dialog.Content class="sm:max-w-[400px]">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2 text-destructive">
        <AlertTriangle class="w-5 h-5" />
        Delete Model
      </Dialog.Title>
      <Dialog.Description class="pt-2">
        Are you sure you want to permanently delete <strong>{modelToDelete?.name}</strong>?
        <br/><br/>
        <span class="text-xs font-mono bg-muted/50 p-1.5 rounded block break-all">{modelToDelete?.path}</span>
        <br/>
        This action cannot be undone and will delete the model folder from your disk.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer class="gap-2 sm:gap-0 mt-4">
      <Button variant="outline" onclick={() => deleteModalOpen = false} disabled={isDeleting}>Cancel</Button>
      <Button variant="destructive" onclick={confirmDelete} disabled={isDeleting}>
        {#if isDeleting}
          <Loader2 class="w-4 h-4 mr-2 animate-spin" /> Deleting...
        {:else}
          <Trash2 class="w-4 h-4 mr-2" /> Delete Permanently
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>