mod tray;

use enigo::{Direction, Enigo, Key, Keyboard, Mouse, Settings};
use tauri::{AppHandle, Manager, Monitor, PhysicalPosition, Runtime};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use tauri_plugin_store::StoreExt;

use serde_json::json;

const DEFAULT_PANEL_WIDTH: i32 = 400;
const DEFAULT_PANEL_HEIGHT: i32 = 476;

#[tauri::command]
async fn input_text(text: &str) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).unwrap();
    enigo.text(text).unwrap();
    Ok(())
}

#[tauri::command]
async fn simulate_paste() -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).unwrap();
    let _ = enigo.key(Key::Control, Direction::Press);
    let _ = enigo.key(Key::V, Direction::Click);
    let _ = enigo.key(Key::Control, Direction::Release);
    Ok(())
}

#[tauri::command]
async fn get_key_from_store<R: Runtime>(
    app: tauri::AppHandle<R>,
    key: String,
    fallback: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let stores = app.store("store.bin");
    let store = match stores {
        Ok(store) => store,
        Err(_) => return Ok(fallback),
    };
    if store.has(key.clone()) {
        let value = store
            .get(key.clone())
            .expect("Failed to get value from store");
        Ok(value)
    } else {
        Ok(fallback)
    }
}

#[tauri::command]
async fn set_key_to_store<R: Runtime>(
    app: tauri::AppHandle<R>,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let stores = app.store("store.bin");
    let store = match stores {
        Ok(store) => store,
        Err(_) => return Err("Failed to get store".to_string()),
    };
    store.set(key.clone(), json!(value));
    store.save().expect("Failed to save store");
    Ok(())
}

fn show_window_with_name(app: &AppHandle<tauri::Wry>, name: &str) {
    let windows = app.webview_windows();

    let window = windows.get(name).expect("Sorry, no window found");
    window.show().expect("Can't Show Window");
    window.set_focus().expect("Can't Bring Window to Focus");
}

fn show_window_with_name_and_position(app: &AppHandle<tauri::Wry>, pos: PhysicalPosition<i32>) {
    let windows = app.webview_windows();
    let window = match windows.get("context") {
        Some(win) => win.clone(),
        None => return,
    };

    let monitors = match window.available_monitors() {
        Ok(m) => m,
        Err(_) => {
            let _ = window.center();
            let _ = window.show();
            let _ = window.set_focus();
            return;
        }
    };

    if monitors.is_empty() {
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    tauri::async_runtime::spawn(async move {
        let mut current_monitor: Option<Monitor> = None;
        for monitor in monitors {
            let size = monitor.size();
            let position: &PhysicalPosition<i32> = monitor.position();

            let monitor_x = position.x;
            let monitor_y = position.y;
            let monitor_width = size.width as i32;
            let monitor_height = size.height as i32;

            if pos.x >= monitor_x
                && pos.x < monitor_x + monitor_width
                && pos.y >= monitor_y
                && pos.y < monitor_y + monitor_height
            {
                current_monitor = Some(monitor);
                break;
            }
        }

        if let Some(monitor) = current_monitor {
            let scale = monitor.scale_factor();
            let panel_width = (DEFAULT_PANEL_WIDTH as f64 * scale) as i32;
            let panel_height = (DEFAULT_PANEL_HEIGHT as f64 * scale) as i32;
            
            let size = monitor.size();
            let position = monitor.position();

            let monitor_x = position.x;
            let monitor_y = position.y;
            let monitor_width = size.width as i32;
            let monitor_height = size.height as i32;

            let mut x = pos.x;
            let mut y = pos.y;

            if x + panel_width > monitor_x + monitor_width {
                x = x - panel_width;
            }

            if y + panel_height > monitor_y + monitor_height {
                y = y - panel_height;
            }

            x = std::cmp::max(
                monitor_x,
                std::cmp::min(x, monitor_x + monitor_width - panel_width),
            );
            y = std::cmp::max(
                monitor_y,
                std::cmp::min(y, monitor_y + monitor_height - panel_height),
            );

            let adjusted_pos = PhysicalPosition::new(x, y);

            let _ = window.set_position(adjusted_pos);
            let _ = window.show();
            let _ = window.set_always_on_top(true);
            let _ = window.set_focus();
            return;
        }

        let _ = window.set_position(pos);
        let _ = window.show();
        let _ = window.set_always_on_top(true);
        let _ = window.set_focus();

    });
}

#[tauri::command]
async fn reregister_panel_shortcut(app: tauri::AppHandle<tauri::Wry>) -> Result<(), String> {
    let _ = app.global_shortcut().unregister_all();
    let mut shortcut_string = "CmdOrControl+Shift+V".to_string();
    let stores = app.store("store.bin");
    let _store = match stores {
        Ok(store) => {
            if let Some(value) = store.get("globalShortcut") {
                if let Some(s) = value.as_str() {
                    shortcut_string = s.to_string();
                }
            }
        }
        Err(_) => return Err("Failed to read config".to_string()),
    };
    let shortcut = match shortcut_string.parse::<Shortcut>() {
        Ok(s) => s,
        Err(_) => return Err("Failed to parse shortcut".to_string()),
    };

    let _ = app
        .global_shortcut()
        .on_shortcut(shortcut, move |app_handle, _event, _shortcut| {
            let enigo = Enigo::new(&Settings::default());
            let mut location = PhysicalPosition::new(0, 0);

            if let Ok(enigo) = enigo {
                if let Ok(pos) = enigo.location() {
                    location = PhysicalPosition::new(pos.0 as i32, pos.1 as i32);
                }
            }

            show_window_with_name_and_position(app_handle, location);
        });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = show_window_with_name(app, "main");
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let handle = app.handle();
            let _ = tray::create_tray(handle);

            let args: Vec<String> = std::env::args().collect();
            if !args.contains(&"--autostart".to_string()) && !args.contains(&"--silent".to_string())
            {
                show_window_with_name(app.handle(), "main");
            }
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = reregister_panel_shortcut(app_handle).await;
            });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_cors_fetch::init())
        .invoke_handler(tauri::generate_handler![
            input_text,
            simulate_paste,
            get_key_from_store,
            set_key_to_store,
            reregister_panel_shortcut
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
