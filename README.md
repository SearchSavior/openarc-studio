# OpenArc Studio

This is a GUI app for managing an OpenArc instance. Basically, it lets you use OpenArc without having to deal with the terminal.

> [!IMPORTANT]
> The setup process to install a local OpenArc server isn't included yet. For now, you need to connect to an OpenArc server that's already running.
> The OpenArc version must contain the necessary OpenArc API endpoints for the features you want to use.

### Notable Special Features
- **Voice Profiles**: You can create voice profiles for TTS generation. You can either create one with the voice design tool or you can clone an existing voice with the voice cloning tool. You can then use these voice profiles to generate TTS audio with the TTS generation feature in the voice studio.
- **Benchmark Tool**: You can run benchmarks on your hardware to see how well it performs with different models.
- **Curated Model List**: You can browse a curated list of models and download them directly from the app. This is currently local, but in the future, the manifest/repo will be hosted either on the OpenArc repo, or on a separate repo.

### Screenshots



#### Chat
![Chat](display-images/chat.png)

#### Models & Downloader
![Models List](display-images/models-list.png)
![Downloader](display-images/downloader.png)

#### Server Management
![OpenArc Server Stuff](display-images/openarc-server-stuff.png)
![OpenArc Server API Endpoints](display-images/openarc-server-api-endpoints.png)

#### Benchmark Tool
![Benchmark Tool](display-images/benchmark-tool.png)
![Benchmark Results](display-images/benchmark-results.png)

#### Settings & Stats
![Hardware Stats](display-images/settings-hardware-stats.png)
![Runtime Settings](display-images/settings-runtime.png)
![System Logs](display-images/settings-system-logs.png)

#### Voice Studio
![Voice Studio - STT](display-images/voice-studio-stt.png)
![Voice Studio - TTS Generation](display-images/voice-studio-tts-generation.png)
![Voice Studio - Voice Cloning](display-images/voice-studio-tts-voice-cloning.png)
![Voice Studio - Voice Design](display-images/voice-studio-tts-voice-design.png)

---

### Short-term to do list
- Add buttons to actually start/stop the local server from the UI, plus a view for the console logs (this will be implemented when the local server setup process is implemented)
- A fully functional download manager (with pause/cancel and progress bars (do not work perfectly))
- Make the app automatically find OpenVINO models you already have on your hard drive
- Basic desktop app stuff (a hardware resource monitor (half implemented), making external links open in your browser)
- Voice feature: recording from your mic
