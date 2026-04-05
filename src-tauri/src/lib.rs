use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{Manager, Emitter};
use futures_util::StreamExt;
use async_openai::{
    Client as OpenAIClient,
    config::OpenAIConfig,
    types::chat::{CreateChatCompletionRequest, CreateChatCompletionStreamResponse, CreateChatCompletionResponse},
};

use openarc_rs::client::OpenArcClient;
use openarc_rs::management::{
    ServerStatusResponse, LoadModelRequest, UnloadModelRequest, BenchmarkRequest, BenchmarkResponse,
    VersionResponse, MetricsResponse, DownloaderRequest, DownloaderActionRequest, 
    DownloaderListResponse, DownloaderResponse, LocalModelsResponse
};

struct AppState {
    client: Arc<Mutex<Option<OpenArcClient>>>,
    openai_client: Arc<Mutex<Option<OpenAIClient<OpenAIConfig>>>>,
}

#[tauri::command]
async fn get_server_status(state: tauri::State<'_, AppState>) -> Result<ServerStatusResponse, String> {
    let client_guard = state.client.lock().await;
    if let Some(client) = client_guard.as_ref() {
        client.get_status().await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn load_model(req: LoadModelRequest, state: tauri::State<'_, AppState>) -> Result<openarc_rs::management::LoadModelResponse, String> {
    let client_guard = state.client.lock().await;
    if let Some(client) = client_guard.as_ref() {
        client.load_model(req).await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn unload_model(req: UnloadModelRequest, state: tauri::State<'_, AppState>) -> Result<openarc_rs::management::UnloadModelResponse, String> {
    let client_guard = state.client.lock().await;
    if let Some(client) = client_guard.as_ref() {
        client.unload_model(req).await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn benchmark_model(req: BenchmarkRequest, state: tauri::State<'_, AppState>) -> Result<BenchmarkResponse, String> {
    let client_guard = state.client.lock().await;
    if let Some(client) = client_guard.as_ref() {
        client.benchmark(req).await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn configure_client(base_url: String, api_key: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut client_guard = state.client.lock().await;
    *client_guard = Some(OpenArcClient::new(&base_url, &api_key));
    
    let mut openai_guard = state.openai_client.lock().await;
    let config = OpenAIConfig::new()
        .with_api_base(base_url)
        .with_api_key(api_key);
    *openai_guard = Some(OpenAIClient::with_config(config));
    
    Ok(())
}

#[tauri::command]
async fn get_version(state: tauri::State<'_, AppState>) -> Result<VersionResponse, String> {
    let client_guard = state.client.lock().await;
    if let Some(client) = client_guard.as_ref() {
        client.get_version().await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn get_metrics(state: tauri::State<'_, AppState>) -> Result<MetricsResponse, String> {
    let client_guard = state.client.lock().await;
    if let Some(client) = client_guard.as_ref() {
        client.get_metrics().await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn start_download(req: DownloaderRequest, state: tauri::State<'_, AppState>) -> Result<DownloaderResponse, String> {
    let client_guard = state.client.lock().await;
    if let Some(client) = client_guard.as_ref() {
        client.start_download(req).await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn list_downloads(state: tauri::State<'_, AppState>) -> Result<DownloaderListResponse, String> {
    let client_guard = state.client.lock().await;
    if let Some(client) = client_guard.as_ref() {
        client.list_downloads().await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn cancel_download(req: DownloaderActionRequest, state: tauri::State<'_, AppState>) -> Result<DownloaderResponse, String> {
    let client_guard = state.client.lock().await;
    if let Some(client) = client_guard.as_ref() {
        client.cancel_download(req).await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn pause_download(req: DownloaderActionRequest, state: tauri::State<'_, AppState>) -> Result<DownloaderResponse, String> {
    let client_guard = state.client.lock().await;
    if let Some(client) = client_guard.as_ref() {
        client.pause_download(req).await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn resume_download(req: DownloaderActionRequest, state: tauri::State<'_, AppState>) -> Result<DownloaderResponse, String> {
    let client_guard = state.client.lock().await;
    if let Some(client) = client_guard.as_ref() {
        client.resume_download(req).await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}

#[tauri::command]
async fn get_local_models(path: Option<String>, state: tauri::State<'_, AppState>) -> Result<LocalModelsResponse, String> {
    let client_guard = state.client.lock().await;
    if let Some(client) = client_guard.as_ref() {
        client.get_local_models(path.as_deref()).await.map_err(|e| e.to_string())
    } else {
        Err("Client not initialized".into())
    }
}


#[tauri::command]
async fn save_settings(app: tauri::AppHandle, settings: serde_json::Value, has_completed_setup: bool) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");
    
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
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");
    if !config_path.exists() {
        return Ok(serde_json::json!(null));
    }
    let json_string = std::fs::read_to_string(config_path).map_err(|e| e.to_string())?;
    let payload: serde_json::Value = serde_json::from_str(&json_string).map_err(|e| e.to_string())?;
    Ok(payload)
}

#[tauri::command]
async fn update_model_config(
    model_path: String,
    config: serde_json::Value,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let client_guard = state.client.lock().await;
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
    let client = {
        let guard = state.openai_client.lock().await;
        guard.as_ref().cloned()
    };

    let client = client.ok_or("Client not configured")?;

    tauri::async_runtime::spawn(async move {
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
    });

    Ok(())
}

#[tauri::command]
async fn chat_inference(
    req: CreateChatCompletionRequest,
    state: tauri::State<'_, AppState>,
) -> Result<CreateChatCompletionResponse, String> {
    let client = {
        let guard = state.openai_client.lock().await;
        guard.as_ref().cloned()
    };

    let client = client.ok_or("Client not configured")?;
    client.chat().create(req).await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            client: Arc::new(Mutex::new(None)),
            openai_client: Arc::new(Mutex::new(None)),
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
            chat_inference
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
