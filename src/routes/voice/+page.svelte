<script lang="ts">
  import { onMount } from "svelte";
    import { Button } from "$lib/components/ui/button";
    import { Textarea } from "$lib/components/ui/textarea";
    import { ScrollArea } from "$lib/components/ui/scroll-area";
    import { Slider } from "$lib/components/ui/slider";
    import { Switch } from "$lib/components/ui/switch";
    import { Label } from "$lib/components/ui/label";
    import { Input } from "$lib/components/ui/input";
    import { appState } from "$lib/state.svelte.js";
    import { Mic, Play, Download, Upload, Copy, Settings2, FileAudio, AudioWaveform, PlusCircle, Trash2 } from "@lucide/svelte";

    onMount(() => {
        appState.addLog("info", "Voice Studio initialized");
    });
  
    let activeMode = $state<"tts" | "stt">("tts");
    let activeTtsTab = $state<"generation" | "cloning" | "voice_design">("generation");
    
    let ttsText = $state("");
    let selectedTTSModel = $state("kokoro-v1.0");
    let selectedVoice = $state("af_bella");
    let speechSpeed = $state([1.0]);
    let generatedAudioUrl = $state<string | null>(null);
  
    let sttTextOutput = $state("");
    let isRecording = $state(false);
    let selectedSTTModel = $state("whisper-base");
    let selectedLanguage = $state("auto");
    let uploadedFileName = $state<string | null>(null);
  
    const ttsModels = [
        { id: "kokoro-v1.0", name: "Kokoro TTS (v1.0)" },
        { id: "qwen3-tts", name: "Qwen3-TTS" }
    ];
    
    const sttModels = [
        { id: "whisper-base", name: "Whisper Base" },
        { id: "whisper-large-v3", name: "Whisper Large v3" },
        { id: "qwen3-asr", name: "Qwen3-ASR" }
    ];
  
    const voices = [
        { id: "af_bella", name: "Bella (American Female)", type: "preset" },
        { id: "am_adam", name: "Adam (American Male)", type: "preset" },
        { id: "bf_emma", name: "Emma (British Female)", type: "preset" },
        { id: "custom_clone_1", name: "My Cloned Voice", type: "custom" }
    ];
  </script>
  
  <div class="flex h-full w-full overflow-hidden bg-background">
    
    {#if appState.leftPanelOpen}
      <aside class="w-[260px] shrink-0 border-r bg-muted/20 flex flex-col h-full transition-all duration-200">
        <div class="p-4 border-b font-bold text-lg flex items-center gap-2">
            <AudioWaveform class="w-5 h-5 text-primary" /> Voice Studio
        </div>
        <ScrollArea class="flex-1 p-2">
          <Button variant="default" class="w-full justify-start mb-2 gap-2">
            <PlusCircle class="w-4 h-4" /> New Voice Project
          </Button>
          <div class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-4 px-2">Recent Generations</div>
          <Button variant="ghost" class="w-full justify-start text-muted-foreground text-sm truncate">Greeting_Audio_v2.wav</Button>
          <Button variant="ghost" class="w-full justify-start text-muted-foreground text-sm truncate">Meeting_Transcription_04.txt</Button>
        </ScrollArea>
      </aside>
    {/if}
  
    <main class="flex-1 h-full flex flex-col min-w-0 bg-background">
      <header class="h-14 border-b flex items-center justify-between px-6 shadow-sm bg-background">
        <div class="flex items-center p-1 bg-muted rounded-lg">
            <button 
                class="px-4 py-1.5 text-sm font-medium rounded-md transition-all {activeMode === 'tts' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}"
                onclick={() => activeMode = 'tts'}
            >
                Text-to-Speech (TTS)
            </button>
            <button 
                class="px-4 py-1.5 text-sm font-medium rounded-md transition-all {activeMode === 'stt' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}"
                onclick={() => activeMode = 'stt'}
            >
                Speech-to-Text (STT)
            </button>
        </div>
      </header>
  
      <ScrollArea class="flex-1 p-6">
        <div class="max-w-4xl mx-auto h-full flex flex-col gap-6">
            
            {#if activeMode === "tts"}
                <div class="space-y-4">
                    <div class="flex items-center justify-between border-b pb-4">
                        <div>
                            <h2 class="text-2xl font-bold tracking-tight">Text-to-Speech</h2>
                            <p class="text-sm text-muted-foreground">Synthesize speech, clone voices, or design new ones.</p>
                        </div>
                        
                        <div class="flex items-center bg-muted/50 p-1 rounded-lg">
                            <button 
                                class="px-4 py-1.5 text-sm font-medium rounded-md transition-all {activeTtsTab === 'generation' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}"
                                onclick={() => activeTtsTab = 'generation'}
                            >
                                Generation
                            </button>
                            <button 
                                class="px-4 py-1.5 text-sm font-medium rounded-md transition-all {activeTtsTab === 'cloning' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}"
                                onclick={() => activeTtsTab = 'cloning'}
                            >
                                Voice Cloning
                            </button>
                            <button 
                                class="px-4 py-1.5 text-sm font-medium rounded-md transition-all {activeTtsTab === 'voice_design' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}"
                                onclick={() => activeTtsTab = 'voice_design'}
                            >
                                Voice Design
                            </button>
                        </div>
                    </div>
                    
                    {#if activeTtsTab === 'generation'}
                        <div class="grid grid-cols-3 gap-6 pt-2">
                            <div class="col-span-2 space-y-4">
                                <div class="relative">
                                    <Textarea
                                        bind:value={ttsText}
                                        placeholder="Enter text to synthesize... (e.g., 'Hello, welcome to OpenArc Studio.')"
                                        class="min-h-[250px] resize-y text-base p-4"
                                    />
                                    <div class="absolute bottom-3 right-3 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                                        {ttsText.length} characters
                                    </div>
                                </div>
                                
                                <div class="flex items-center gap-3">
                                    <Button class="gap-2" size="lg" onclick={() => {
                                        appState.addLog('v1', `Synthesizing audio`, `Model: ${selectedTTSModel}, Voice: ${selectedVoice}`);
                                    }}>
                                        <Play class="w-4 h-4 fill-current" /> Synthesize Audio
                                    </Button>
                                    <Button variant="outline" class="gap-2" size="lg" disabled={!generatedAudioUrl} onclick={() => {
                                        appState.addLog('v2', `Exporting audio file`);
                                    }}>
                                        <Download class="w-4 h-4" /> Export
                                    </Button>
                                </div>

                                <div class="mt-6 p-4 border rounded-lg bg-muted/20 flex items-center gap-4">
                                    <Button variant="secondary" size="icon" class="rounded-full h-12 w-12 shrink-0 disabled:opacity-50">
                                        <Play class="w-5 h-5 ml-1" />
                                    </Button>
                                    <div class="flex-1 space-y-2">
                                        <div class="h-2 bg-muted rounded-full overflow-hidden">
                                            <div class="h-full bg-primary/50 w-[0%]"></div>
                                        </div>
                                        <div class="flex justify-between text-xs text-muted-foreground font-mono">
                                            <span>0:00</span>
                                            <span>0:00</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="space-y-6 p-5 border rounded-xl bg-muted/5 h-fit">
                                <div class="space-y-2">
                                    <Label class="text-sm font-semibold">TTS Model</Label>
                                    <select 
                                        class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
                                        bind:value={selectedTTSModel}
                                    >
                                        {#each ttsModels as model}
                                            <option value={model.id}>{model.name}</option>
                                        {/each}
                                    </select>
                                </div>

                                <div class="space-y-2">
                                    <div class="flex justify-between items-center">
                                        <Label class="text-sm font-semibold">Voice Profile</Label>
                                        <button class="text-xs text-primary hover:underline flex items-center gap-1" onclick={() => activeTtsTab = 'cloning'}>
                                            <PlusCircle class="w-3 h-3" /> Add Clone
                                        </button>
                                    </div>
                                    <select 
                                        class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
                                        bind:value={selectedVoice}
                                    >
                                        <optgroup label="Preset Voices">
                                            {#each voices.filter(v => v.type === 'preset') as voice}
                                                <option value={voice.id}>{voice.name}</option>
                                            {/each}
                                        </optgroup>
                                        <optgroup label="Custom / Cloned">
                                            {#each voices.filter(v => v.type === 'custom') as voice}
                                                <option value={voice.id}>{voice.name}</option>
                                            {/each}
                                        </optgroup>
                                    </select>
                                </div>

                                <div class="space-y-4">
                                    <div class="flex justify-between items-center">
                                        <Label class="text-sm font-semibold">Speech Speed</Label>
                                        <span class="text-xs font-mono bg-muted px-2 py-0.5 rounded">{speechSpeed[0]}x</span>
                                    </div>
                                    <Slider type="multiple" bind:value={speechSpeed} max={2.0} min={0.25} step={0.1} />
                                </div>

                                <div class="pt-4 border-t space-y-3">
                                    <div class="flex items-center justify-between">
                                        <Label class="text-sm">Auto-play on completion</Label>
                                        <Switch checked={true} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    {:else if activeTtsTab === 'cloning'}
                        <div class="max-w-2xl mx-auto space-y-6 pt-4">
                            <div class="space-y-2">
                                <Label class="text-sm font-semibold">Voice Profile Name</Label>
                                <Input placeholder="E.g., My Personal Voice" class="max-w-md" />
                            </div>

                            <div class="space-y-2">
                                <Label class="text-sm font-semibold">Reference Audio</Label>
                                <p class="text-sm text-muted-foreground">Upload a clean, clear audio sample (10-30 seconds) of the voice you want to clone without background noise.</p>
                                
                                <div class="border-2 border-dashed rounded-xl p-8 text-center flex flex-col items-center justify-center bg-muted/10 hover:bg-muted/20 transition-colors cursor-pointer mt-2">
                                    <Upload class="w-8 h-8 text-muted-foreground mb-3" />
                                    <h3 class="font-medium text-sm">Select or drop audio file here</h3>
                                    <p class="text-xs text-muted-foreground mt-1">MP3, WAV, FLAC (Max 10MB)</p>
                                </div>
                            </div>
                            
                            <div class="space-y-2">
                                <Label class="text-sm font-semibold">Reference Text / Transcript (Recommended)</Label>
                                <p class="text-xs text-muted-foreground">Providing the exact transcript of what is being spoken in the reference audio significantly improves clone accuracy.</p>
                                <Textarea placeholder="Type exactly what the speaker is saying in the uploaded audio..." class="resize-y min-h-[100px]" />
                            </div>

                            <div class="space-y-2">
                                <Label class="text-sm font-semibold">Description / Notes</Label>
                                <Input placeholder="E.g., Recorded in studio, slightly raspy" class="max-w-full" />
                            </div>

                            <div class="pt-4 border-t">
                                <Button size="lg" class="w-full sm:w-auto">Create Voice Clone</Button>
                            </div>
                        </div>
                    {:else if activeTtsTab === 'voice_design'}
                        <div class="max-w-2xl mx-auto space-y-8 pt-4">
                            <p class="text-sm text-muted-foreground">Generate entirely new, unique voices by providing a descriptive prompt and adjusting acoustic parameters.</p>

                            <div class="space-y-6">
                                <div class="space-y-2">
                                    <Label class="text-sm font-semibold">Voice Prompt / Description</Label>
                                    <p class="text-xs text-muted-foreground">Describe the voice characteristics you want the AI to generate.</p>
                                    <Textarea placeholder="E.g., A warm, deep, and raspy elderly male voice with a slow speaking cadence and a subtle British accent..." class="resize-y min-h-[100px]" />
                                </div>

                                <div class="grid grid-cols-2 gap-6">
                                    <div class="space-y-2">
                                        <Label class="text-sm font-semibold">Gender Tone</Label>
                                        <select class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:ring-1 focus:ring-ring">
                                            <option>Female</option>
                                            <option>Male</option>
                                            <option>Androgynous</option>
                                            <option>Let Model Decide</option>
                                        </select>
                                    </div>
                                    <div class="space-y-2">
                                        <Label class="text-sm font-semibold">Age Group</Label>
                                        <select class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:ring-1 focus:ring-ring">
                                            <option>Young</option>
                                            <option>Middle-Aged</option>
                                            <option>Elderly</option>
                                            <option>Let Model Decide</option>
                                        </select>
                                    </div>
                                </div>

                                <div class="space-y-4 pt-2">
                                    <div class="flex justify-between items-center">
                                        <Label class="text-sm font-semibold">Pitch Alignment</Label>
                                    </div>
                                    <Slider type="multiple" max={100} value={[50]} />
                                    <div class="flex justify-between text-xs text-muted-foreground">
                                        <span>Deeper</span>
                                        <span>Higher</span>
                                    </div>
                                </div>

                                <div class="space-y-4 pt-2">
                                    <div class="flex justify-between items-center">
                                        <Label class="text-sm font-semibold">Breathiness / Clarity</Label>
                                    </div>
                                    <Slider type="multiple" max={100} value={[20]} />
                                    <div class="flex justify-between text-xs text-muted-foreground">
                                        <span>Crisp / Clear</span>
                                        <span>Breathy / Raspy</span>
                                    </div>
                                </div>
                                
                                <div class="space-y-2 pt-4">
                                    <Label class="text-sm font-semibold">Save Profile As</Label>
                                    <Input placeholder="E.g., Storyteller Narrator" class="max-w-md" />
                                </div>
                                
                                <div class="pt-4 border-t flex gap-3">
                                    <Button size="lg" variant="secondary" onclick={() => {
                                        appState.addLog('v1', `Generating voice profile preview`);
                                    }}>Generate Preview</Button>
                                    <Button size="lg" class="w-full sm:w-auto" onclick={() => {
                                        appState.addLog('v2', `Saving voice profile`);
                                    }}>Save Voice Profile</Button>
                                </div>
                            </div>
                        </div>
                    {/if}
                </div>

            {:else}
                <div class="space-y-4">
                    <div>
                        <h2 class="text-2xl font-bold tracking-tight">Transcribe Audio</h2>
                        <p class="text-sm text-muted-foreground">Convert speech to text accurately using models like Whisper and Qwen3-ASR.</p>
                    </div>

                    <div class="grid grid-cols-3 gap-6">
                        <div class="col-span-2 space-y-6">
                            
                            <div class="border-2 border-dashed rounded-xl p-8 text-center flex flex-col items-center justify-center bg-muted/10 hover:bg-muted/20 transition-colors cursor-pointer relative group">
                                {#if !isRecording}
                                    <div class="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity z-10 rounded-xl">
                                        <span class="font-medium text-primary">
                                            {#if uploadedFileName}
                                                Click or drag to replace audio file
                                            {:else}
                                                Click to select or drag and drop audio file
                                            {/if}
                                        </span>
                                    </div>
                                {/if}
                                
                                {#if uploadedFileName}
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        class="absolute top-2 right-2 z-20 text-destructive hover:bg-destructive/20 hover:text-destructive transition-colors"
                                        onclick={(e) => { e.stopPropagation(); uploadedFileName = null; }}
                                        title="Remove file"
                                    >
                                        <Trash2 class="w-5 h-5" />
                                    </Button>
                                    <FileAudio class="w-12 h-12 text-primary mb-3" />
                                    <h3 class="font-semibold text-lg">{uploadedFileName}</h3>
                                    <p class="text-sm text-muted-foreground">Ready to transcribe</p>
                                {:else if isRecording}
                                    <div class="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center mb-3 animate-pulse">
                                        <Mic class="w-6 h-6 text-destructive" />
                                    </div>
                                    <h3 class="font-semibold text-lg text-destructive">Recording...</h3>
                                    <p class="text-sm text-muted-foreground font-mono">00:14</p>
                                {:else}
                                    <Upload class="w-12 h-12 text-muted-foreground mb-3" />
                                    <h3 class="font-semibold text-lg">Drop audio file here</h3>
                                    <p class="text-sm text-muted-foreground mt-1">MP3, WAV, FLAC, M4A (Max 50MB)</p>
                                    
                                    <div class="flex items-center gap-4 w-full max-w-xs mt-6">
                                        <div class="h-[1px] flex-1 bg-border"></div>
                                        <span class="text-xs text-muted-foreground uppercase font-semibold">OR</span>
                                        <div class="h-[1px] flex-1 bg-border"></div>
                                    </div>
                                    
                                    <Button variant="secondary" class="mt-6 gap-2 relative z-20" onclick={(e) => { e.stopPropagation(); isRecording = true; }}>
                                        <Mic class="w-4 h-4" /> Record with Microphone
                                    </Button>
                                {/if}
                            </div>

                            <div class="flex items-center gap-3">
                                <Button class="gap-2" size="lg" disabled={!uploadedFileName && !isRecording} onclick={() => {
                                    appState.addLog('v1', `Starting transcription`, `Model: ${selectedSTTModel}, Language: ${selectedLanguage}`);
                                }}>
                                    <Settings2 class="w-4 h-4" /> Start Transcription
                                </Button>
                                {#if isRecording}
                                    <Button variant="destructive" size="lg" onclick={() => { 
                                        isRecording = false; 
                                        uploadedFileName = "Recorded_Audio.wav"; 
                                        appState.addLog('v2', `Recording stopped and saved`);
                                    }}>
                                        Stop Recording
                                    </Button>
                                {/if}
                            </div>

                            <div class="space-y-2 mt-4">
                                <div class="flex items-center justify-between">
                                    <Label class="font-semibold">Transcription Output</Label>
                                    <Button variant="ghost" size="sm" class="h-8 gap-1 text-muted-foreground">
                                        <Copy class="w-3 h-3" /> Copy Text
                                    </Button>
                                </div>
                                <Textarea
                                    bind:value={sttTextOutput}
                                    placeholder="Transcription will appear here..."
                                    class="min-h-[200px] resize-y bg-muted/30"
                                    readonly
                                />
                            </div>
                        </div>

                        <div class="space-y-6 p-5 border rounded-xl bg-muted/5 h-fit">
                            <div class="space-y-2">
                                <Label class="text-sm font-semibold">ASR Model</Label>
                                <select 
                                    class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
                                    bind:value={selectedSTTModel}
                                >
                                    {#each sttModels as model}
                                        <option value={model.id}>{model.name}</option>
                                    {/each}
                                </select>
                            </div>

                            <div class="space-y-2">
                                <Label class="text-sm font-semibold">Source Language</Label>
                                <select 
                                    class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
                                    bind:value={selectedLanguage}
                                >
                                    <option value="auto">Auto-Detect</option>
                                    <option value="en">English</option>
                                    <option value="es">Spanish</option>
                                    <option value="fr">French</option>
                                    <option value="de">German</option>
                                    <option value="zh">Chinese</option>
                                </select>
                            </div>

                            <div class="pt-4 border-t space-y-4">
                                <div class="flex items-center justify-between">
                                    <Label class="text-sm">Translate to English</Label>
                                    <Switch />
                                </div>
                                <div class="flex items-center justify-between">
                                    <Label class="text-sm">Word-level Timestamps</Label>
                                    <Switch />
                                </div>
                                <div class="flex items-center justify-between">
                                    <Label class="text-sm">Filter Profanity</Label>
                                    <Switch />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

        </div>
      </ScrollArea>
    </main>
  
    {#if appState.rightPanelOpen}
      <aside class="w-[300px] shrink-0 border-l bg-muted/10 flex flex-col p-4 overflow-y-auto h-full transition-all duration-200">
        <h2 class="font-semibold mb-4">Advanced Audio Config</h2>
  
        <div class="space-y-6">
          <div class="space-y-2">
            <Label class="text-sm font-medium">Sample Rate (Hz)</Label>
            <Input type="number" value="24000" />
          </div>

          <div class="space-y-2">
            <Label class="text-sm font-medium">Temperature (STT)</Label>
            <Slider type="multiple" max={1} step={0.1} value={[0.2]} />
            <p class="text-xs text-muted-foreground mt-1">Lower values are more deterministic.</p>
          </div>
  
          <div class="space-y-2">
            <Label class="text-sm font-medium">Output Format</Label>
            <select class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:ring-1 focus:ring-ring">
                <option>WAV (Uncompressed)</option>
                <option>MP3 (Standard)</option>
                <option>FLAC (Lossless)</option>
            </select>
          </div>
        </div>
      </aside>
    {/if}
  </div>