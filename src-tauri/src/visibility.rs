//! Visibility changes never navigate, resize, relocate, or persist the current view.
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub visible: bool,
    pub revision: u64,
}

#[derive(Default)]
pub struct VisibilityState(Mutex<Snapshot>);

fn publish(app: &AppHandle, visible: bool) -> Result<Snapshot, String> {
    let state = app.state::<VisibilityState>();
    let mut snapshot = state.0.lock().map_err(|e| e.to_string())?;
    if snapshot.visible != visible {
        snapshot.visible = visible;
        snapshot.revision += 1;
        app.emit_to("main", "main-visibility", *snapshot).map_err(|e| e.to_string())?;
    }
    Ok(*snapshot)
}

#[tauri::command]
pub fn get_main_visibility(app: AppHandle) -> Result<Snapshot, String> {
    refresh(&app)
}

// Query on initialization and native size/minimize transitions only, never on
// focus loss and never from a polling loop. Hidden/minimized is not unfocused.
pub fn refresh(app: &AppHandle) -> Result<Snapshot, String> {
    let win = app.get_webview_window("main").ok_or("主窗口不可用")?;
    publish(app, win.is_visible().map_err(|e| e.to_string())? && !win.is_minimized().map_err(|e| e.to_string())?)
}

pub fn show(app: &AppHandle) -> Result<(), String> {
    let win = app.get_webview_window("main").ok_or("主窗口不可用")?;
    win.show().map_err(|e| e.to_string())?;
    refresh(app)?;
    win.set_focus().map_err(|e| e.to_string())
}

pub fn hide(app: &AppHandle) -> Result<(), String> {
    let win = app.get_webview_window("main").ok_or("主窗口不可用")?;
    win.hide().map_err(|e| e.to_string())?;
    publish(app, false)?;
    Ok(())
}

#[tauri::command]
pub fn toggle_main_visibility(app: AppHandle) -> Result<(), String> {
    let win = app.get_webview_window("main").ok_or("主窗口不可用")?;
    if win.is_visible().map_err(|e| e.to_string())? { hide(&app) } else { show(&app) }
}
