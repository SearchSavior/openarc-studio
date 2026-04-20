use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use tauri::{Manager, Emitter};
use tauri::async_runtime::JoinHandle;
use futures_util::StreamExt;
use async_openai::{
    Client as OpenAIClient,
    config::OpenAIConfig,
    types::chat::{CreateChatCompletionRequest, CreateChatCompletionStreamResponse, CreateChatCompletionResponse},
};

fn openarc_config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app.path().config_dir().map_err(|e| e.to_string())?;
    let dir = base.join("openarc-studio");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn chats_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = openarc_config_dir(app)?.join("chats");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn voice_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = openarc_config_dir(app)?.join("voice");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn voice_subdir(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = voice_dir(app)?.join(name);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn is_safe_id(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn ext_from_path(p: &std::path::Path) -> String {
    p.extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_else(|| "bin".to_string())
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// workaround for openarc tts bug: the streaming wav writer finalises chunk
// sizes before flushing the last buffer so the header under-reports payload
// by ~512 bytes. ffmpeg/chromium/aplay tolerate it; mpv/vlc reject.
// patches riff size and data chunk to match actual buffer length.
fn fix_wav_chunk_sizes(buf: &mut [u8]) -> Option<(u32, u32)> {
    if buf.len() < 44 || &buf[0..4] != b"RIFF" || &buf[8..12] != b"WAVE" {
        return None;
    }
    let total = buf.len();
    let mut pos = 12usize;
    let mut last_data_pos: Option<usize> = None;
    while pos + 8 <= total {
        let is_data = &buf[pos..pos + 4] == b"data";
        let size = u32::from_le_bytes([
            buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7],
        ]) as usize;
        if is_data {
            last_data_pos = Some(pos);
        }
        let Some(next) = pos
            .checked_add(8)
            .and_then(|n| n.checked_add(size))
            .and_then(|n| n.checked_add(size & 1))
        else {
            break;
        };
        if next > total {
            break;
        }
        pos = next;
    }
    let data_pos = last_data_pos?;
    let declared_data = u32::from_le_bytes([
        buf[data_pos + 4],
        buf[data_pos + 5],
        buf[data_pos + 6],
        buf[data_pos + 7],
    ]);
    let actual_data = (total - (data_pos + 8)) as u32;
    let declared_riff = u32::from_le_bytes([buf[4], buf[5], buf[6], buf[7]]);
    let actual_riff = (total - 8) as u32;
    if declared_data == actual_data && declared_riff == actual_riff {
        return None;
    }
    buf[4..8].copy_from_slice(&actual_riff.to_le_bytes());
    buf[data_pos + 4..data_pos + 8].copy_from_slice(&actual_data.to_le_bytes());
    Some((declared_data, actual_data))
}

use openarc_rs::audio::SpeechRequest;
use openarc_rs::client::OpenArcClient;
use openarc_rs::management::{
    ServerStatusResponse, LoadModelRequest, UnloadModelRequest, BenchmarkRequest, BenchmarkResponse,
    VersionResponse, MetricsResponse, DownloaderRequest, DownloaderActionRequest,
    DownloaderListResponse, DownloaderResponse, LocalModelsResponse
};

struct AppState {
    client: Arc<RwLock<Option<OpenArcClient>>>,
    openai_client: Arc<RwLock<Option<OpenAIClient<OpenAIConfig>>>>,
    stream_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
}

#[tauri::command]
async fn get_server_status(state: tauri::State<'_, AppState>) -> Result<ServerStatusResponse, String> {
    let client_guard = state.client.read().unwrap().clone();
    if let Some(client) = client_guard.as_ref() {
        client.get_status().await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn load_model(req: LoadModelRequest, state: tauri::State<'_, AppState>) -> Result<openarc_rs::management::LoadModelResponse, String> {
    let client_guard = state.client.read().unwrap().clone();
    if let Some(client) = client_guard.as_ref() {
        client.load_model(req).await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn unload_model(req: UnloadModelRequest, state: tauri::State<'_, AppState>) -> Result<openarc_rs::management::UnloadModelResponse, String> {
    let client_guard = state.client.read().unwrap().clone();
    if let Some(client) = client_guard.as_ref() {
        client.unload_model(req).await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn benchmark_model(req: BenchmarkRequest, state: tauri::State<'_, AppState>) -> Result<BenchmarkResponse, String> {
    let client_guard = state.client.read().unwrap().clone();
    if let Some(client) = client_guard.as_ref() {
        client.benchmark(req).await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn configure_client(base_url: String, api_key: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let trimmed = base_url.trim_end_matches('/').to_string();
    let openai_base = if trimmed.ends_with("/v1") {
        trimmed.clone()
    } else {
        format!("{}/v1", trimmed)
    };

    {
        let mut client_guard = state.client.write().unwrap();
        *client_guard = Some(OpenArcClient::new(&trimmed, &api_key));
    }
    {
        let mut openai_guard = state.openai_client.write().unwrap();
        let config = OpenAIConfig::new()
            .with_api_base(openai_base)
            .with_api_key(api_key);
        *openai_guard = Some(OpenAIClient::with_config(config));
    }

    Ok(())
}

#[tauri::command]
async fn get_version(state: tauri::State<'_, AppState>) -> Result<VersionResponse, String> {
    let client_guard = state.client.read().unwrap().clone();
    if let Some(client) = client_guard.as_ref() {
        client.get_version().await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn get_metrics(state: tauri::State<'_, AppState>) -> Result<MetricsResponse, String> {
    let client_guard = state.client.read().unwrap().clone();
    if let Some(client) = client_guard.as_ref() {
        client.get_metrics().await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn start_download(req: DownloaderRequest, state: tauri::State<'_, AppState>) -> Result<DownloaderResponse, String> {
    let client_guard = state.client.read().unwrap().clone();
    if let Some(client) = client_guard.as_ref() {
        client.start_download(req).await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn list_downloads(state: tauri::State<'_, AppState>) -> Result<DownloaderListResponse, String> {
    let client_guard = state.client.read().unwrap().clone();
    if let Some(client) = client_guard.as_ref() {
        client.list_downloads().await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn cancel_download(req: DownloaderActionRequest, state: tauri::State<'_, AppState>) -> Result<DownloaderResponse, String> {
    let client_guard = state.client.read().unwrap().clone();
    if let Some(client) = client_guard.as_ref() {
        client.cancel_download(req).await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn pause_download(req: DownloaderActionRequest, state: tauri::State<'_, AppState>) -> Result<DownloaderResponse, String> {
    let client_guard = state.client.read().unwrap().clone();
    if let Some(client) = client_guard.as_ref() {
        client.pause_download(req).await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn resume_download(req: DownloaderActionRequest, state: tauri::State<'_, AppState>) -> Result<DownloaderResponse, String> {
    let client_guard = state.client.read().unwrap().clone();
    if let Some(client) = client_guard.as_ref() {
        client.resume_download(req).await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn get_local_models(path: Option<String>, state: tauri::State<'_, AppState>) -> Result<LocalModelsResponse, String> {
    let client_guard = state.client.read().unwrap().clone();
    if let Some(client) = client_guard.as_ref() {
        client.get_local_models(path.as_deref()).await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}


#[tauri::command]
async fn save_settings(app: tauri::AppHandle, settings: serde_json::Value, has_completed_setup: bool) -> Result<(), String> {
    let config_path = openarc_config_dir(&app)?.join("config.json");

    let payload = serde_json::json!({
        "settings": settings,
        "hasCompletedSetup": has_completed_setup
    });

    let json_string = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    std::fs::write(config_path, json_string).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn load_app_settings(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let config_path = openarc_config_dir(&app)?.join("config.json");
    if !config_path.exists() {
        return Ok(serde_json::json!(null));
    }
    let json_string = std::fs::read_to_string(config_path).map_err(|e| e.to_string())?;
    let payload: serde_json::Value = serde_json::from_str(&json_string).map_err(|e| e.to_string())?;
    Ok(payload)
}

#[tauri::command]
async fn list_chat_sessions(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let dir = chats_dir(&app)?;
    let mut sessions = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let contents = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        match serde_json::from_str::<serde_json::Value>(&contents) {
            Ok(v) => sessions.push(v),
            Err(_) => continue,
        }
    }
    Ok(sessions)
}

#[tauri::command]
async fn save_chat_session(app: tauri::AppHandle, session: serde_json::Value) -> Result<(), String> {
    let id = session.get("id").and_then(|v| v.as_str())
        .ok_or_else(|| "Session missing id".to_string())?;
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Invalid session id".into());
    }
    let path = chats_dir(&app)?.join(format!("{}.json", id));
    let json_string = serde_json::to_string_pretty(&session).map_err(|e| e.to_string())?;
    std::fs::write(path, json_string).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn delete_chat_session(app: tauri::AppHandle, id: String) -> Result<(), String> {
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Invalid session id".into());
    }
    let path = chats_dir(&app)?.join(format!("{}.json", id));
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn load_presets(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = openarc_config_dir(&app)?.join("presets.json");
    if !path.exists() {
        return Ok(serde_json::json!(null));
    }
    let contents = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let value: serde_json::Value = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    Ok(value)
}

#[tauri::command]
async fn save_presets(app: tauri::AppHandle, presets: serde_json::Value) -> Result<(), String> {
    let path = openarc_config_dir(&app)?.join("presets.json");
    let json_string = serde_json::to_string_pretty(&presets).map_err(|e| e.to_string())?;
    std::fs::write(path, json_string).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn update_model_config(
    model_path: String,
    config: serde_json::Value,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let client_guard = state.client.read().unwrap().clone();
    if let Some(client) = client_guard.as_ref() {
        client
            .update_local_model_config(&model_path, config)
            .await
            .map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn delete_local_model(model_path: String) -> Result<(), String> {
    std::fs::remove_dir_all(&model_path).map_err(|e| format!("Failed to delete model directory: {}", e))
}


#[tauri::command]
async fn chat_inference_stream(
    req: CreateChatCompletionRequest,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    if let Some(old) = state.stream_handle.lock().unwrap().take() {
        old.abort();
    }

    let client = {
        let guard = state.openai_client.read().unwrap();
        guard.as_ref().cloned()
    };

    let client = client.ok_or("Client not configured")?;
    let slot = state.stream_handle.clone();

    let handle = tauri::async_runtime::spawn(async move {
        match client.chat().create_stream(req).await {
            Ok(mut stream) => {
                while let Some(result) = stream.next().await {
                    match result {
                        Ok(response) => {
                            let _ = app_handle.emit("chat-chunk", response);
                        }
                        Err(e) => {
                            let _ = app_handle.emit("chat-error", e.to_string());
                            break;
                        }
                    }
                }
                let _ = app_handle.emit("chat-done", ());
            }
            Err(e) => {
                let _ = app_handle.emit("chat-error", e.to_string());
            }
        }
        if let Ok(mut guard) = slot.lock() {
            *guard = None;
        }
    });

    *state.stream_handle.lock().unwrap() = Some(handle);
    Ok(())
}

#[tauri::command]
async fn cancel_chat_inference(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    let handle = state.stream_handle.lock().unwrap().take();
    if let Some(h) = handle {
        h.abort();
        let _ = app_handle.emit("chat-done", ());
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
async fn chat_inference(
    req: CreateChatCompletionRequest,
    state: tauri::State<'_, AppState>,
) -> Result<CreateChatCompletionResponse, String> {
    let client = {
        let guard = state.openai_client.read().unwrap();
        guard.as_ref().cloned()
    };

    let client = client.ok_or("Client not configured")?;
    client.chat().create(req).await.map_err(|e| e.to_string())
}

// ========================================================================
// voice studio - audio commands
// ========================================================================

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AudioSpeechArgs {
    model: String,
    input: String,
    #[serde(default)]
    voice: Option<String>,
    #[serde(default)]
    instructions: Option<String>,
    #[serde(default)]
    language: Option<String>,
    #[serde(default)]
    response_format: Option<String>,
    #[serde(default)]
    openarc_tts: Option<serde_json::Value>,
    #[serde(default)]
    voice_profile_id: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioSpeechResult {
    id: String,
    path: String,
    meta_path: String,
    bytes: u64,
    elapsed_ms: u64,
    created_at: u64,
}

// merges ref audio from a saved voice profile into the qwen3-tts payload.
// server expects ref_audio_b64 + ref_text inline; frontend only stores a local
// path so base64 encoding happens here. missing profile or unreadable file
// surfaces as an error instead of silently synthesizing without clone data.
async fn resolve_voice_profile(
    app: &tauri::AppHandle,
    openarc_tts: Option<serde_json::Value>,
    voice_profile_id: Option<&str>,
) -> Result<Option<serde_json::Value>, String> {
    let Some(id) = voice_profile_id else {
        return Ok(openarc_tts);
    };
    if !is_safe_id(id) {
        return Err("Invalid voice profile id".into());
    }
    let profiles_path = voice_profiles_path(app)?;
    if !profiles_path.exists() {
        return Err(format!("Voice profile not found: {}", id));
    }
    let contents = tokio::fs::read_to_string(&profiles_path)
        .await
        .map_err(|e| e.to_string())?;
    let doc: serde_json::Value = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    let profile = doc
        .get("profiles")
        .and_then(|v| v.as_array())
        .and_then(|arr| {
            arr.iter()
                .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(id))
        })
        .ok_or_else(|| format!("Voice profile not found: {}", id))?;

    let mut tts = openarc_tts
        .unwrap_or_else(|| serde_json::json!({}))
        .as_object()
        .cloned()
        .unwrap_or_default();
    let qwen3 = tts
        .entry("qwen3_tts".to_string())
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .ok_or_else(|| "openarc_tts.qwen3_tts must be an object".to_string())?;

    if let Some(ref_path) = profile.get("refAudioPath").and_then(|v| v.as_str()) {
        let references = voice_subdir(app, "references")?;
        let p = PathBuf::from(ref_path);
        if !p.starts_with(&references) || !p.exists() {
            return Err(format!("Reference audio missing: {}", ref_path));
        }
        let audio_bytes = tokio::fs::read(&p).await.map_err(|e| e.to_string())?;
        use base64::Engine;
        let encoded = base64::engine::general_purpose::STANDARD.encode(&audio_bytes);
        qwen3.insert("ref_audio_b64".into(), serde_json::Value::String(encoded));
    }
    if let Some(ref_text) = profile.get("refText").and_then(|v| v.as_str()) {
        qwen3.insert(
            "ref_text".into(),
            serde_json::Value::String(ref_text.to_string()),
        );
    }
    if let Some(x_vec) = profile.get("xVectorOnly").and_then(|v| v.as_bool()) {
        qwen3.insert("x_vector_only".into(), serde_json::Value::Bool(x_vec));
    }
    if let Some(voice_desc) = profile.get("voiceDescription").and_then(|v| v.as_str()) {
        qwen3.insert(
            "voice_description".into(),
            serde_json::Value::String(voice_desc.to_string()),
        );
    }
    // strip the placeholder path injected client-side
    qwen3.remove("ref_audio_path");

    Ok(Some(serde_json::Value::Object(tts)))
}

#[tauri::command]
async fn audio_speech(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    req: AudioSpeechArgs,
) -> Result<AudioSpeechResult, String> {
    let client = {
        let guard = state.client.read().unwrap();
        guard.clone()
    }
    .ok_or_else(|| "Client not initialized".to_string())?;

    let resolved_openarc_tts =
        resolve_voice_profile(&app, req.openarc_tts.clone(), req.voice_profile_id.as_deref())
            .await?;

    let speech_req = SpeechRequest {
        model: req.model.clone(),
        input: req.input.clone(),
        voice: req.voice.clone(),
        instructions: req.instructions.clone(),
        language: req.language.clone(),
        response_format: req.response_format.clone(),
        openarc_tts: resolved_openarc_tts,
    };

    let started = std::time::Instant::now();
    let bytes = client
        .audio_speech(&speech_req)
        .await
        .map_err(|e| e.to_string())?;
    let elapsed_ms = started.elapsed().as_millis() as u64;

    let mut audio = bytes.to_vec();
    if let Some((old, new)) = fix_wav_chunk_sizes(&mut audio) {
        eprintln!(
            "audio_speech: patched WAV chunk sizes (data: {} -> {} bytes)",
            old, new
        );
    }

    let id = uuid::Uuid::new_v4().to_string();
    let dir = voice_subdir(&app, "generations")?;
    let audio_path = dir.join(format!("{}.wav", id));
    let meta_path = dir.join(format!("{}.json", id));

    tokio::fs::write(&audio_path, &audio)
        .await
        .map_err(|e| format!("Failed to write audio: {}", e))?;

    let created_at = now_ms();
    let meta = serde_json::json!({
        "id": id,
        "model": req.model,
        "input": req.input,
        "voice": req.voice,
        "instructions": req.instructions,
        "language": req.language,
        "voiceProfileId": req.voice_profile_id,
        "path": audio_path.to_string_lossy(),
        "bytes": audio.len() as u64,
        "elapsedMs": elapsed_ms,
        "createdAt": created_at,
    });
    let meta_string = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    tokio::fs::write(&meta_path, meta_string)
        .await
        .map_err(|e| format!("Failed to write metadata: {}", e))?;

    Ok(AudioSpeechResult {
        id,
        path: audio_path.to_string_lossy().into_owned(),
        meta_path: meta_path.to_string_lossy().into_owned(),
        bytes: audio.len() as u64,
        elapsed_ms,
        created_at,
    })
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AudioTranscribeArgs {
    audio_path: String,
    model: String,
    #[serde(default)]
    response_format: Option<String>,
    #[serde(default)]
    openarc_asr: Option<serde_json::Value>,
    #[serde(default)]
    source_label: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioTranscribeResult {
    id: String,
    path: String,
    body: serde_json::Value,
    elapsed_ms: u64,
    created_at: u64,
}

#[tauri::command]
async fn audio_transcribe(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    req: AudioTranscribeArgs,
) -> Result<AudioTranscribeResult, String> {
    let client = {
        let guard = state.client.read().unwrap();
        guard.clone()
    }
    .ok_or_else(|| "Client not initialized".to_string())?;

    let response_format = req.response_format.clone().unwrap_or_else(|| "verbose_json".to_string());
    let audio_path = PathBuf::from(&req.audio_path);
    if !audio_path.exists() {
        return Err(format!("Audio file does not exist: {}", req.audio_path));
    }

    let started = std::time::Instant::now();
    let body = client
        .audio_transcribe(
            &audio_path,
            &req.model,
            &response_format,
            req.openarc_asr.as_ref(),
        )
        .await
        .map_err(|e| e.to_string())?;
    let elapsed_ms = started.elapsed().as_millis() as u64;

    let id = uuid::Uuid::new_v4().to_string();
    let created_at = now_ms();
    let dir = voice_subdir(&app, "transcriptions")?;
    let out_path = dir.join(format!("{}.json", id));

    let record = serde_json::json!({
        "id": id,
        "model": req.model,
        "responseFormat": response_format,
        "sourcePath": req.audio_path,
        "sourceLabel": req.source_label,
        "body": body,
        "elapsedMs": elapsed_ms,
        "createdAt": created_at,
    });
    tokio::fs::write(
        &out_path,
        serde_json::to_string_pretty(&record).map_err(|e| e.to_string())?,
    )
    .await
    .map_err(|e| format!("Failed to write transcription: {}", e))?;

    Ok(AudioTranscribeResult {
        id,
        path: out_path.to_string_lossy().into_owned(),
        body: record["body"].clone(),
        elapsed_ms,
        created_at,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportedAudio {
    id: String,
    path: String,
    bytes: u64,
}

async fn import_into_subdir(
    app: &tauri::AppHandle,
    src_path: &str,
    subdir: &str,
) -> Result<ImportedAudio, String> {
    let src = PathBuf::from(src_path);
    if !src.exists() {
        return Err(format!("Source file does not exist: {}", src_path));
    }
    let ext = ext_from_path(&src);
    let id = uuid::Uuid::new_v4().to_string();
    let dst_dir = voice_subdir(app, subdir)?;
    let dst = dst_dir.join(format!("{}.{}", id, ext));
    tokio::fs::copy(&src, &dst)
        .await
        .map_err(|e| format!("Failed to copy audio: {}", e))?;
    let bytes = tokio::fs::metadata(&dst)
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    Ok(ImportedAudio {
        id,
        path: dst.to_string_lossy().into_owned(),
        bytes,
    })
}

#[tauri::command]
async fn import_audio_for_transcription(
    app: tauri::AppHandle,
    src_path: String,
) -> Result<ImportedAudio, String> {
    import_into_subdir(&app, &src_path, "recordings").await
}

#[tauri::command]
async fn import_reference_audio(
    app: tauri::AppHandle,
    src_path: String,
) -> Result<ImportedAudio, String> {
    import_into_subdir(&app, &src_path, "references").await
}

// copies a generation wav from voice/generations/ into voice/references/ so it
// can be used as ref audio for a profile. needed to turn a voice-design preview
// into a profile that resolve_voice_profile can use, which only accepts paths
// under voice/references/.
#[tauri::command]
async fn promote_generation_to_reference(
    app: tauri::AppHandle,
    generation_id: String,
    profile_id: String,
) -> Result<ImportedAudio, String> {
    if !is_safe_id(&generation_id) {
        return Err("Invalid generation id".into());
    }
    if !is_safe_id(&profile_id) {
        return Err("Invalid profile id".into());
    }
    let generations_dir = voice_subdir(&app, "generations")?;
    let src = generations_dir.join(format!("{}.wav", generation_id));
    if !src.starts_with(&generations_dir) || !src.exists() {
        return Err(format!("Generation audio not found: {}", generation_id));
    }
    let references_dir = voice_subdir(&app, "references")?;
    let dst = references_dir.join(format!("{}.wav", profile_id));
    tokio::fs::copy(&src, &dst)
        .await
        .map_err(|e| format!("Failed to copy audio: {}", e))?;
    let bytes = tokio::fs::metadata(&dst)
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    Ok(ImportedAudio {
        id: profile_id,
        path: dst.to_string_lossy().into_owned(),
        bytes,
    })
}

#[tauri::command]
async fn record_mic_stop_save(
    app: tauri::AppHandle,
    audio_bytes: Vec<u8>,
    mime_type: Option<String>,
) -> Result<ImportedAudio, String> {
    let ext = match mime_type.as_deref() {
        Some(m) if m.contains("webm") => "webm",
        Some(m) if m.contains("ogg") => "ogg",
        Some(m) if m.contains("wav") => "wav",
        Some(m) if m.contains("mp4") => "m4a",
        _ => "webm",
    };
    let id = uuid::Uuid::new_v4().to_string();
    let dst_dir = voice_subdir(&app, "recordings")?;
    let dst = dst_dir.join(format!("{}.{}", id, ext));
    let bytes = audio_bytes.len() as u64;
    tokio::fs::write(&dst, &audio_bytes)
        .await
        .map_err(|e| format!("Failed to write recording: {}", e))?;
    Ok(ImportedAudio {
        id,
        path: dst.to_string_lossy().into_owned(),
        bytes,
    })
}

// ========================================================================
// voice studio - profile/library/preset CRUD
// ========================================================================

fn voice_profiles_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(voice_dir(app)?.join("voice_profiles.json"))
}

#[tauri::command]
async fn list_voice_profiles(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = voice_profiles_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::json!({ "profiles": [] }));
    }
    let contents = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| e.to_string())?;
    let value: serde_json::Value =
        serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    Ok(value)
}

#[tauri::command]
async fn save_voice_profiles(
    app: tauri::AppHandle,
    profiles: serde_json::Value,
) -> Result<(), String> {
    let path = voice_profiles_path(&app)?;
    let body = serde_json::to_string_pretty(&profiles).map_err(|e| e.to_string())?;
    tokio::fs::write(&path, body)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_voice_profile(
    app: tauri::AppHandle,
    id: String,
    ref_audio_path: Option<String>,
) -> Result<(), String> {
    if !is_safe_id(&id) {
        return Err("Invalid profile id".into());
    }
    let path = voice_profiles_path(&app)?;
    if path.exists() {
        let contents = tokio::fs::read_to_string(&path)
            .await
            .map_err(|e| e.to_string())?;
        let mut value: serde_json::Value =
            serde_json::from_str(&contents).map_err(|e| e.to_string())?;
        if let Some(arr) = value.get_mut("profiles").and_then(|v| v.as_array_mut()) {
            arr.retain(|p| p.get("id").and_then(|v| v.as_str()) != Some(&id));
        }
        let body = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
        tokio::fs::write(&path, body)
            .await
            .map_err(|e| e.to_string())?;
    }
    if let Some(ref_path) = ref_audio_path {
        let p = PathBuf::from(ref_path);
        // only delete if path is inside voice/references/
        if let Ok(references) = voice_subdir(&app, "references") {
            if p.starts_with(&references) && p.exists() {
                let _ = tokio::fs::remove_file(&p).await;
            }
        }
    }
    Ok(())
}

async fn read_json_dir(dir: &PathBuf) -> Result<Vec<serde_json::Value>, String> {
    let mut out = Vec::new();
    if !dir.exists() {
        return Ok(out);
    }
    let mut entries = tokio::fs::read_dir(dir)
        .await
        .map_err(|e| e.to_string())?;
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        if let Ok(contents) = tokio::fs::read_to_string(&path).await {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&contents) {
                out.push(v);
            }
        }
    }
    Ok(out)
}

#[tauri::command]
async fn list_generations(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let dir = voice_subdir(&app, "generations")?;
    read_json_dir(&dir).await
}

#[tauri::command]
async fn delete_generation(app: tauri::AppHandle, id: String) -> Result<(), String> {
    if !is_safe_id(&id) {
        return Err("Invalid generation id".into());
    }
    let dir = voice_subdir(&app, "generations")?;
    for ext in ["wav", "json", "peaks.json"] {
        let p = dir.join(format!("{}.{}", id, ext));
        if p.exists() {
            let _ = tokio::fs::remove_file(&p).await;
        }
    }
    Ok(())
}

#[tauri::command]
async fn list_transcriptions(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let dir = voice_subdir(&app, "transcriptions")?;
    read_json_dir(&dir).await
}

#[tauri::command]
async fn delete_transcription(app: tauri::AppHandle, id: String) -> Result<(), String> {
    if !is_safe_id(&id) {
        return Err("Invalid transcription id".into());
    }
    let dir = voice_subdir(&app, "transcriptions")?;
    let p = dir.join(format!("{}.json", id));
    if p.exists() {
        let _ = tokio::fs::remove_file(&p).await;
    }
    Ok(())
}

#[tauri::command]
async fn load_voice_presets(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = voice_dir(&app)?.join("voice_presets.json");
    if !path.exists() {
        return Ok(serde_json::json!(null));
    }
    let contents = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&contents).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_voice_presets(
    app: tauri::AppHandle,
    presets: serde_json::Value,
) -> Result<(), String> {
    let path = voice_dir(&app)?.join("voice_presets.json");
    let body = serde_json::to_string_pretty(&presets).map_err(|e| e.to_string())?;
    tokio::fs::write(&path, body).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn read_audio_file(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read audio file: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            client: Arc::new(RwLock::new(None)),
            openai_client: Arc::new(RwLock::new(None)),
            stream_handle: Arc::new(Mutex::new(None)),
        })
        .setup(|app| {
            // asset protocol scope resolved at runtime so convertFileSrc
            // can load files under ~/.config/openarc-studio/ (recordings,
            // generated wavs, reference audio, etc.)
            let handle = app.handle();
            let dir = openarc_config_dir(handle)
                .map_err(|e| format!("openarc_config_dir: {}", e))?;
            app.asset_protocol_scope().allow_directory(&dir, true)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_server_status,
            load_model,
            unload_model,
            benchmark_model,
            configure_client,
            get_version,
            get_metrics,
            start_download,
            list_downloads,
            cancel_download,
            pause_download,
            resume_download,
            get_local_models,
            update_model_config,
            delete_local_model,
            chat_inference_stream,
            cancel_chat_inference,
            chat_inference,
            list_chat_sessions,
            save_chat_session,
            delete_chat_session,
            load_presets,
            save_presets,
            audio_speech,
            audio_transcribe,
            import_audio_for_transcription,
            import_reference_audio,
            promote_generation_to_reference,
            record_mic_stop_save,
            list_voice_profiles,
            save_voice_profiles,
            delete_voice_profile,
            list_generations,
            delete_generation,
            list_transcriptions,
            delete_transcription,
            load_voice_presets,
            save_voice_presets,
            read_audio_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
