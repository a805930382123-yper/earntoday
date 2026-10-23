use crate::{config::{self, AppState}, visibility};
use serde::Serialize;
use std::sync::{atomic::{AtomicBool, Ordering}, Mutex};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub const LABEL: &str = "Ctrl+Shift+H";
fn shortcut() -> Shortcut { Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyH) }

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    enabled: bool,
    registered: bool,
    error: Option<String>,
}

#[derive(Default)]
pub struct ShortcutRuntime {
    status: Mutex<Status>,
    ready: AtomicBool,
    held: AtomicBool,
}

// One toggle per physical press, including when Windows sends repeated Pressed events.
fn accept_key(held: &AtomicBool, state: ShortcutState) -> bool {
    match state {
        ShortcutState::Pressed => !held.swap(true, Ordering::SeqCst),
        ShortcutState::Released => { held.store(false, Ordering::SeqCst); false }
    }
}

pub fn initialize(app: &AppHandle, enabled: bool) {
    let runtime = app.state::<ShortcutRuntime>();
    let plugin = tauri_plugin_global_shortcut::Builder::new().with_handler(|app, key, event| {
        if key == &shortcut() && accept_key(&app.state::<ShortcutRuntime>().held, event.state()) {
            let handle = app.clone();
            if let Err(error) = app.run_on_main_thread(move || {
                if let Err(error) = visibility::toggle_main_visibility(handle) { eprintln!("窗口切换失败：{error}"); }
            }) { eprintln!("窗口切换失败：{error}"); }
        }
    }).build();
    match app.plugin(plugin) {
        Ok(()) => {
            runtime.ready.store(true, Ordering::SeqCst);
            if let Err(error) = configure(app, enabled, false) { eprintln!("{error}"); }
        }
        Err(_) => {
            *runtime.status.lock().expect("shortcut state poisoned") = Status {
                enabled, registered: false, error: Some("全局快捷键不可用，请使用托盘恢复窗口。".into()),
            };
        }
    }
}

fn configure(app: &AppHandle, enabled: bool, save: bool) -> Result<Status, String> {
    let runtime = app.state::<ShortcutRuntime>();
    let mut status = runtime.status.lock().map_err(|e| e.to_string())?;
    if enabled && !runtime.ready.load(Ordering::SeqCst) { return Err("全局快捷键不可用，请使用托盘恢复窗口。".into()); }
    let previous = status.clone();
    let mut registration_error = None;
    if enabled && !status.registered {
        if app.global_shortcut().register(shortcut()).is_err() {
            // Keep the requested preference so the user can retry after releasing a conflict.
            registration_error = Some(format!("{LABEL} 注册失败，可能已被占用。请释放快捷键后重试；仍可点击托盘恢复。"));
        } else {
            status.registered = true;
        }
    } else if !enabled && status.registered {
        app.global_shortcut().unregister(shortcut()).map_err(|_| "快捷键停用失败，请重试".to_string())?;
        status.registered = false;
    }
    runtime.held.store(false, Ordering::SeqCst);
    if save {
        let state = app.state::<AppState>();
        let mut data = state.data.lock().map_err(|e| e.to_string())?;
        let mut updated = data.clone();
        updated.shortcut_enabled = enabled;
        // First-run choices stay in memory until salary/theme is deliberately saved.
        let result = if updated.config_error.is_some() { Err("请先修复配置读取错误".into()) }
            else if updated.settings.is_some() || updated.selected_theme_id.is_some() { config::persist(&updated) }
            else { Ok(()) };
        if let Err(error) = result {
            // Undo the native registration if persistence failed.
            let rollback = if previous.registered == status.registered { Ok(()) }
                else if previous.registered { app.global_shortcut().register(shortcut()) }
                else { app.global_shortcut().unregister(shortcut()) };
            if rollback.is_err() {
                status.error = Some("快捷键保存及恢复失败，请重启应用；托盘仍可恢复窗口。".into());
            } else { *status = previous; }
            return Err(error);
        }
        *data = updated;
    }
    status.enabled = enabled;
    status.error = registration_error;
    Ok(status.clone())
}

#[tauri::command]
pub fn get_shortcut_status(app: AppHandle) -> Result<Status, String> {
    Ok(app.state::<ShortcutRuntime>().status.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub fn set_shortcut_enabled(app: AppHandle, enabled: bool) -> Result<Status, String> {
    configure(&app, enabled, true)
}

pub fn reload_preference(app: &AppHandle) -> Result<Status, String> {
    let enabled = app.state::<AppState>().data.lock().map_err(|e| e.to_string())?.shortcut_enabled;
    configure(app, enabled, false)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn press_release_and_repeat_only_toggle_once_per_press() {
        let held = AtomicBool::new(false);
        assert!(!accept_key(&held, ShortcutState::Released));
        assert!(accept_key(&held, ShortcutState::Pressed));
        for _ in 0..20 { assert!(!accept_key(&held, ShortcutState::Pressed)); }
        assert!(!accept_key(&held, ShortcutState::Released));
        assert!(accept_key(&held, ShortcutState::Pressed));
    }
}
