use tauri::{
    image::Image,
    include_image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

use crate::{db::DbState, state::AppStatus};

pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "打开主界面", true, None::<&str>)?;
    let listening_item = MenuItem::with_id(app, "toggle-listener", "暂停监听", true, None::<&str>)?;
    let offline_item = MenuItem::with_id(app, "toggle-offline", "离线模式", true, None::<&str>)?;
    let clear_history_item =
        MenuItem::with_id(app, "clear-history", "清空历史", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "最小化到托盘", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出应用", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &show_item,
            &listening_item,
            &offline_item,
            &clear_history_item,
            &hide_item,
            &quit_item,
        ],
    )?;

    let listening_menu_item = listening_item.clone();
    let offline_menu_item = offline_item.clone();

    TrayIconBuilder::with_id("main")
        .icon(Image::from(include_image!("icons/icon.png")).to_owned())
        .menu(&menu)
        .tooltip("VibeClip Pro")
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "toggle-listener" => {
                let status = app.state::<AppStatus>();
                let is_listening = status.toggle_listening();
                let _ = listening_menu_item.set_text(if is_listening {
                    "暂停监听"
                } else {
                    "恢复监听"
                });
            }
            "toggle-offline" => {
                let status = app.state::<AppStatus>();
                let offline = status.toggle_offline();
                let _ = offline_menu_item.set_text(if offline {
                    "✓ 离线模式"
                } else {
                    "离线模式"
                });
            }
            "clear-history" => {
                let db_state = app.state::<DbState>().clone_for_thread();
                tauri::async_runtime::spawn_blocking(move || {
                    if let Err(err) = db_state.clear() {
                        tracing::error!("failed to clear history from tray: {err:?}");
                    }
                });
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
