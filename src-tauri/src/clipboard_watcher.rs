use std::{path::Path, time::Duration};

use anyhow::Result;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use image::codecs::png::PngEncoder;
use image::{ColorType, ImageEncoder};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tokio::time::sleep;
use tracing::error;

use crate::clipboard::ClipboardDraft;
use crate::db::{ClipItem, ClipKind, DbState};
use crate::runtime_config::{RuntimeConfigState, RuntimePreferences};
use crate::state::AppStatus;

pub fn spawn_clipboard_watcher<R: Runtime + 'static>(app_handle: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        let db_state = app_handle.state::<DbState>().clone();
        let config_state = app_handle.state::<RuntimeConfigState>().clone();
        let mut last_hash: Option<String> = None;
        let mut consecutive_failures = 0u32;

        loop {
            let status = app_handle.state::<AppStatus>();
            let listening = status.listening();
            drop(status);

            if !listening {
                sleep(Duration::from_millis(320)).await;
                continue;
            }

            let prefs = config_state.get();
            let poll_interval = Duration::from_millis(prefs.debounce_interval_ms.clamp(200, 800));

            // Capture clipboard in async context (not in spawn_blocking)
            let draft_result = match capture_clipboard(&app_handle, &prefs) {
                Ok(opt) => opt,
                Err(err) => {
                    error!("clipboard capture error: {err:?}");
                    consecutive_failures = consecutive_failures.saturating_add(1);
                    let backoff = poll_interval
                        .checked_mul(consecutive_failures.min(5) as u32 + 1)
                        .unwrap_or(poll_interval)
                        .min(Duration::from_secs(3));
                    sleep(backoff).await;
                    continue;
                }
            };

            let Some(draft) = draft_result else {
                consecutive_failures = 0;
                sleep(poll_interval).await;
                continue;
            };

            // Convert draft to payload before spawn_blocking
            let payload = match draft.into_payload() {
                Ok(p) => p,
                Err(err) => {
                    error!("payload conversion error: {err:?}");
                    consecutive_failures = consecutive_failures.saturating_add(1);
                    let backoff = poll_interval
                        .checked_mul(consecutive_failures.min(5) as u32 + 1)
                        .unwrap_or(poll_interval)
                        .min(Duration::from_secs(3));
                    sleep(backoff).await;
                    continue;
                }
            };

            let hash = payload.content_hash.clone().unwrap_or_else(|| {
                crate::hash::compute_content_hash(payload.kind, &payload.content)
            });

            // Check for self-copy before DB操作
            if prefs.ignore_self_copies {
                let status = app_handle.state::<AppStatus>();
                if status.consume_self_copy(&hash) {
                    consecutive_failures = 0;
                    sleep(poll_interval).await;
                    continue;
                }
            }

            // Check for duplicate
            let is_duplicate = last_hash.as_ref() == Some(&hash);
            if prefs.dedupe_enabled && is_duplicate {
                consecutive_failures = 0;
                sleep(poll_interval).await;
                continue;
            }

            // Process in spawn_blocking (database operations only)
            let db_clone = db_state.clone_for_thread();
            let prefs_snapshot = prefs.clone();
            let result = tauri::async_runtime::spawn_blocking(move || -> Result<ClipItem> {
                let clip = db_clone.upsert(payload)?;
                db_clone.apply_retention(&prefs_snapshot)?;
                Ok(clip)
            })
            .await;

            match result {
                Ok(Ok(clip)) => {
                    let _ = app_handle.emit("clipboard://captured", &clip);
                    last_hash = Some(hash);
                    consecutive_failures = 0;
                }
                Ok(Err(err)) => {
                    error!("clipboard watcher error: {err:?}");
                    consecutive_failures = consecutive_failures.saturating_add(1);
                }
                Err(join_err) => {
                    error!("clipboard watcher join error: {join_err:?}");
                    consecutive_failures = consecutive_failures.saturating_add(1);
                }
            }

            let backoff = if consecutive_failures == 0 {
                poll_interval
            } else {
                poll_interval
                    .checked_mul(consecutive_failures.min(5) as u32 + 1)
                    .unwrap_or(poll_interval)
                    .min(Duration::from_secs(3))
            };
            sleep(backoff).await;
        }
    });
}

fn capture_clipboard<R: Runtime>(
    app: &AppHandle<R>,
    prefs: &RuntimePreferences,
) -> Result<Option<ClipboardDraft>> {
    let clipboard = app.clipboard();

    if let Ok(image) = clipboard.read_image() {
        if let Ok(draft) = build_image_payload(&image) {
            return Ok(Some(draft));
        }
    }

    if let Ok(text) = clipboard.read_text() {
        let sanitized = text.replace('\0', "");
        if sanitized.trim().is_empty() {
            return Ok(None);
        }

        if let Some((content, preview, extra)) = try_build_file_payload(&sanitized) {
            if should_ignore(&content, prefs) {
                return Ok(None);
            }
            return Ok(Some(ClipboardDraft {
                kind: ClipKind::File,
                text: None,
                image_base64: None,
                file_path: Some(content),
                preview: Some(preview),
                extra,
                is_pinned: false,
                is_favorite: false,
            }));
        }

        if should_ignore(&sanitized, prefs) {
            return Ok(None);
        }

        let preview = sanitized.chars().take(120).collect::<String>();
        return Ok(Some(ClipboardDraft {
            kind: ClipKind::Text,
            text: Some(sanitized),
            image_base64: None,
            file_path: None,
            preview: Some(preview),
            extra: None,
            is_pinned: false,
            is_favorite: false,
        }));
    }

    Ok(None)
}

fn should_ignore(content: &str, prefs: &RuntimePreferences) -> bool {
    if prefs.ignored_keywords.is_empty() {
        return false;
    }
    let lower = content.to_lowercase();
    prefs
        .ignored_keywords
        .iter()
        .filter(|keyword| !keyword.trim().is_empty())
        .map(|keyword| keyword.trim().to_lowercase())
        .any(|needle| lower.contains(&needle))
}

fn build_image_payload(image: &tauri::image::Image<'_>) -> Result<ClipboardDraft> {
    let mut buffer = Vec::new();
    {
        let encoder = PngEncoder::new(&mut buffer);
        let rgba = image.rgba();
        encoder.write_image(
            rgba.as_ref(),
            image.width(),
            image.height(),
            ColorType::Rgba8.into(),
        )?;
    }
    let base64 = BASE64_STANDARD.encode(buffer);
    let preview = format!("{} × {} 图像", image.width(), image.height());
    Ok(ClipboardDraft {
        kind: ClipKind::Image,
        text: None,
        image_base64: Some(base64),
        file_path: None,
        preview: Some(preview),
        extra: None,
        is_pinned: false,
        is_favorite: false,
    })
}

fn try_build_file_payload(text: &str) -> Option<(String, String, Option<String>)> {
    let segments = text
        .split(|c| c == '\n' || c == '\r')
        .map(|part| part.trim())
        .filter(|part| !part.is_empty())
        .map(|part| part.trim_matches('"').to_string())
        .collect::<Vec<_>>();

    if segments.is_empty() {
        return None;
    }

    let looks_like_path = segments.iter().all(|segment| is_path_like(segment));
    if !looks_like_path {
        return None;
    }

    let preview = if segments.len() == 1 {
        Path::new(&segments[0])
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.to_string())
            .unwrap_or_else(|| segments[0].clone())
    } else {
        format!("{} 个项目", segments.len())
    };
    let extra = segments.get(0).cloned();
    Some((segments.join("\n"), preview, extra))
}

fn is_path_like(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }
    let path = Path::new(value);
    if path.exists() {
        return true;
    }
    value.contains('/') || value.contains('\\') || value.contains(':') || value.starts_with('~')
}
