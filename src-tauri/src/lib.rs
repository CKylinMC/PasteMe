mod ai_client;
mod clipboard;
mod clipboard_watcher;
mod db;
mod hash;
mod runtime_config;
mod state;
mod tray;

use ai_client::{AiActionRequest, AiActionResponse};
use clipboard::ClipboardDraft;
use db::{ClipItem, ClipKind, DbState};
use runtime_config::{RuntimeConfigState, RuntimePreferences};
use state::AppStatus;

use chrono::Utc;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use tauri_plugin_store::StoreExt;
use tracing::{error, info, warn};
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

const DEFAULT_SHORTCUT: &str = "CmdOrControl+Shift+V";
const HISTORY_LIMIT: u32 = 200;

#[derive(Debug, Serialize)]
struct HistoryExportPayload {
    exported_at: i64,
    items: Vec<ClipItem>,
}

#[tauri::command]
async fn insert_clip(
    status: State<'_, AppStatus>,
    db: State<'_, DbState>,
    config: State<'_, RuntimeConfigState>,
    draft: ClipboardDraft,
) -> Result<ClipItem, String> {
    info!("insert_clip invoked");
    if !status.listening() {
        return Err("监听已暂停".into());
    }
    let payload = draft.into_payload().map_err(|err| err.to_string())?;
    let prefs = config.get();
    let db_clone = db.clone_for_thread();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let item = db_clone.upsert(payload)?;
        db_clone.apply_retention(&prefs)?;
        Ok::<_, anyhow::Error>(item)
    })
    .await
    .map_err(|err| err.to_string())?
    .map_err(|err| err.to_string())?;
    Ok(result)
}

#[tauri::command]
async fn update_clip_content(
    db: State<'_, DbState>,
    id: i64,
    payload: ClipboardDraft,
) -> Result<(), String> {
    let clip_payload = payload.into_payload().map_err(|err| err.to_string())?;
    let db_clone = db.clone_for_thread();
    tauri::async_runtime::spawn_blocking(move || {
        db_clone.update_content(id, clip_payload.content, clip_payload.preview)
    })
    .await
    .map_err(|err| err.to_string())?
    .map_err(|err| err.to_string())
}

#[tauri::command]
async fn fetch_clips(
    db: State<'_, DbState>,
    query: Option<String>,
    favorites_first: Option<bool>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<ClipItem>, String> {
    info!(
        "fetch_clips query={:?} favorites_first={:?} limit={:?}",
        query, favorites_first, limit
    );
    let db_clone = db.clone_for_thread();
    let query_clone = query.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db_clone.list(
            query_clone,
            limit.or(Some(HISTORY_LIMIT)),
            offset.unwrap_or_default(),
            favorites_first.unwrap_or(true),
        )
    })
    .await
    .map_err(|err| err.to_string())?
    .map_err(|err| err.to_string())
}

#[tauri::command]
async fn update_clip_flags(
    db: State<'_, DbState>,
    id: i64,
    pinned: Option<bool>,
    favorite: Option<bool>,
) -> Result<(), String> {
    info!(
        "update_clip_flags invoked: id={}, pinned={:?}, favorite={:?}",
        id, pinned, favorite
    );

    let db_clone = db.clone_for_thread();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let res = db_clone.update_flags(id, pinned, favorite);
        if let Err(ref e) = res {
            error!("Database update_flags error: {:?}", e);
        }
        res
    })
    .await
    .map_err(|err| {
        error!("spawn_blocking join error: {:?}", err);
        err.to_string()
    })?
    .map_err(|err| {
        error!("update_flags database error: {:?}", err);
        err.to_string()
    });

    if result.is_ok() {
        info!("update_clip_flags completed successfully");
    }

    result
}

#[tauri::command]
async fn remove_clip(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let db_clone = db.clone_for_thread();
    tauri::async_runtime::spawn_blocking(move || db_clone.delete(id))
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn clear_history(db: State<'_, DbState>) -> Result<(), String> {
    let db_clone = db.clone_for_thread();
    tauri::async_runtime::spawn_blocking(move || db_clone.clear())
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn export_history(db: State<'_, DbState>) -> Result<HistoryExportPayload, String> {
    let db_clone = db.clone_for_thread();
    let items = tauri::async_runtime::spawn_blocking(move || db_clone.export_all())
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())?;
    Ok(HistoryExportPayload {
        exported_at: Utc::now().timestamp(),
        items,
    })
}

#[tauri::command]
async fn import_history(db: State<'_, DbState>, items: Vec<ClipItem>) -> Result<usize, String> {
    let db_clone = db.clone_for_thread();
    tauri::async_runtime::spawn_blocking(move || db_clone.import_many(items))
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn prune_history(db: State<'_, DbState>, keep_latest: usize) -> Result<usize, String> {
    let db_clone = db.clone_for_thread();
    tauri::async_runtime::spawn_blocking(move || db_clone.prune_older_than(keep_latest))
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn vacuum_database(db: State<'_, DbState>) -> Result<(), String> {
    let db_clone = db.clone_for_thread();
    tauri::async_runtime::spawn_blocking(move || db_clone.vacuum())
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn perform_ai_action(
    app: AppHandle,
    status: State<'_, AppStatus>,
    request: AiActionRequest,
) -> Result<AiActionResponse, String> {
    if status.offline() {
        return Err("离线模式已开启，无法调用 AI 服务".into());
    }
    let store = app.store("store.bin").map_err(|e| e.to_string())?;
    if store
        .get("offlineMode")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
    {
        return Err("离线模式已开启，无法调用 AI 服务".into());
    }

    ai_client::perform(request)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn get_app_status(status: State<'_, AppStatus>) -> Result<AppStatusSnapshot, String> {
    Ok(AppStatusSnapshot {
        listening: status.listening(),
        offline: status.offline(),
    })
}

#[tauri::command]
async fn set_listening(status: State<'_, AppStatus>, listening: bool) -> Result<(), String> {
    status.set_listening(listening);
    Ok(())
}

#[tauri::command]
async fn set_offline(status: State<'_, AppStatus>, offline: bool) -> Result<(), String> {
    status.set_offline(offline);
    Ok(())
}

#[tauri::command]
async fn ignore_next_clipboard_capture(
    status: State<'_, AppStatus>,
    hash: Option<String>,
    kind: Option<u8>,
    content: Option<String>,
) -> Result<(), String> {
    if let Some(hash) = hash.filter(|value| !value.is_empty()) {
        status.mark_self_copy(hash);
        return Ok(());
    }

    if let (Some(kind), Some(content)) = (kind, content) {
        let clip_kind = match kind {
            1 => ClipKind::Text,
            2 => ClipKind::Image,
            3 => ClipKind::File,
            other => return Err(format!("未知的剪贴板类型: {other}")),
        };
        let hash = crate::hash::compute_content_hash(clip_kind, &content);
        status.mark_self_copy(hash);
    }

    Ok(())
}

#[tauri::command]
async fn update_runtime_preferences(
    config: State<'_, RuntimeConfigState>,
    preferences: RuntimePreferences,
) -> Result<(), String> {
    config.update(preferences);
    Ok(())
}

#[tauri::command]
async fn input_text(text: &str) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|err| err.to_string())?;
    enigo.text(text).map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
async fn simulate_paste() -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|err| err.to_string())?;
    let _ = enigo.key(Key::Control, Direction::Press);
    let _ = enigo.key(Key::Unicode('v'), Direction::Click);
    let _ = enigo.key(Key::Control, Direction::Release);
    Ok(())
}

#[tauri::command]
async fn get_value_from_store<R: Runtime>(
    app: AppHandle<R>,
    key: String,
    fallback: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let stores = app.store("store.bin");
    let store = match stores {
        Ok(store) => store,
        Err(_) => return Ok(fallback),
    };
    Ok(store.get(&key).unwrap_or(fallback))
}

#[tauri::command]
async fn set_value_to_store<R: Runtime>(
    app: AppHandle<R>,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let stores = app.store("store.bin");
    let store = match stores {
        Ok(store) => store,
        Err(_) => return Err("无法获取配置存储".to_string()),
    };
    store.set(&key, value);
    store.save().map_err(|_| "保存配置失败".to_string())?;
    Ok(())
}

#[tauri::command]
async fn register_history_shortcut(app: AppHandle, shortcut: Option<String>) -> Result<(), String> {
    let parsed_shortcut = shortcut.unwrap_or_else(|| DEFAULT_SHORTCUT.to_string());
    let parsed = parsed_shortcut.parse::<Shortcut>().map_err(|err| {
        error!("failed to parse shortcut {parsed_shortcut}: {err}");
        err.to_string()
    })?;
    if let Err(err) = app.global_shortcut().unregister_all() {
        warn!("unable to unregister previous shortcuts: {err}");
    }
    app.global_shortcut()
        .on_shortcut(parsed, move |app_handle, _event, _shortcut| {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        })
        .map_err(|err| {
            error!("failed to register shortcut {parsed_shortcut}: {err}");
            err.to_string()
        })?;
    info!("registered history shortcut: {parsed_shortcut}");
    Ok(())
}

#[derive(Debug, Serialize)]
struct AppStatusSnapshot {
    listening: bool,
    offline: bool,
}

#[derive(Debug, Serialize)]
struct RuntimeSummary {
    app_version: &'static str,
    tauri_version: &'static str,
    rustc_channel: &'static str,
}

#[tauri::command]
async fn get_runtime_summary() -> Result<RuntimeSummary, String> {
    Ok(RuntimeSummary {
        app_version: env!("CARGO_PKG_VERSION"),
        tauri_version: tauri::VERSION,
        rustc_channel: option_env!("RUSTC_CHANNEL").unwrap_or("stable"),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let subscriber = tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer());
    let _ = subscriber.try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let handle = app.handle();
            let status = AppStatus::default();
            if let Ok(store) = handle.store("store.bin") {
                if store
                    .get("offlineMode")
                    .and_then(|value| value.as_bool())
                    .unwrap_or(false)
                {
                    status.set_offline(true);
                }
            }
            app.manage(status);
            let config_state = RuntimeConfigState::default();
            app.manage(config_state.clone());
            let db_state = DbState::initialize(&handle)?;
            app.manage(db_state);
            clipboard_watcher::spawn_clipboard_watcher(handle.clone());
            tray::create_tray(&handle)?;

            #[cfg(debug_assertions)]
            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.set_decorations(true);
                let _ = window.open_devtools();
            }

            let args: Vec<String> = std::env::args().collect();
            if !args.contains(&"--autostart".to_string()) && !args.contains(&"--silent".to_string())
            {
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                }
            }
            let db_handle = handle.state::<DbState>().clone();
            let prefs = config_state.get();
            if prefs.retention.vacuum_on_start {
                let db_clone = db_handle.clone_for_thread();
                tauri::async_runtime::spawn_blocking(move || {
                    let _ = db_clone.vacuum();
                });
            }
            info!("application setup complete");
            let app_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let _ = register_history_shortcut(app_handle, None).await;
            });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_cors_fetch::init())
        .invoke_handler(tauri::generate_handler![
            insert_clip,
            update_clip_content,
            fetch_clips,
            update_clip_flags,
            remove_clip,
            clear_history,
            export_history,
            import_history,
            prune_history,
            perform_ai_action,
            get_app_status,
            set_listening,
            set_offline,
            input_text,
            simulate_paste,
            get_value_from_store,
            set_value_to_store,
            register_history_shortcut,
            vacuum_database,
            update_runtime_preferences,
            ignore_next_clipboard_capture,
            get_runtime_summary
        ])
        .run(tauri::generate_context!())
        .expect("error while running VibeClip Pro");
}
