use crate::{
    config::{self, AppState},
    config_storage,
};
use serde::Serialize;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

fn restart_marker_path() -> std::path::PathBuf {
    config::config_path().with_file_name("update-restart.marker")
}

pub fn consume_update_restart() -> bool {
    let path = restart_marker_path();
    let recent = std::fs::metadata(&path).ok()
        .and_then(|entry| entry.modified().ok())
        .and_then(|time| time.elapsed().ok())
        .is_some_and(|elapsed| elapsed < Duration::from_secs(30 * 60));
    let _ = std::fs::remove_file(path);
    recent
}

#[derive(Default)]
pub struct UpdateState {
    pending: Mutex<Option<Update>>,
    busy: AtomicBool,
}

struct Busy<'a>(&'a AtomicBool);
impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    notes: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    phase: &'static str,
    downloaded: u64,
    total: Option<u64>,
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let state = app.state::<UpdateState>();
    if state.busy.swap(true, Ordering::AcqRel) {
        return Err("更新正在处理中，请稍候".into());
    }
    let _busy = Busy(&state.busy);
    *state.pending.lock().map_err(|e| e.to_string())? = None;
    let config = app.config().plugins.0.get("updater");
    if config
        .and_then(|v| v.get("pubkey"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .is_empty()
    {
        return Err("此构建尚未配置更新签名，请等待正式更新版本".into());
    }
    let updater = app
        .updater_builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "更新配置无效".to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|_| "暂时无法连接更新服务，请稍后重试".to_string())?;
    if let Some(ref update) = update {
        // Require HTTPS for the artifact as well as the manifest.
        if update.download_url.scheme() != "https" {
            return Err("更新下载地址不安全，已取消更新".into());
        }
    }
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        notes: u
            .body
            .clone()
            .unwrap_or_else(|| "本次更新包含体验优化。".into()),
    });
    *state.pending.lock().map_err(|e| e.to_string())? = update;
    Ok(info)
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let state = app.state::<UpdateState>();
    if state.busy.swap(true, Ordering::AcqRel) {
        return Err("更新正在处理中，请稍候".into());
    }
    let _busy = Busy(&state.busy);
    let mut update = state
        .pending
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("请先检查更新")?;
    update.timeout = Some(Duration::from_secs(600));
    let mut downloaded = 0u64;
    let bytes = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                let _ = app.emit(
                    "update-progress",
                    Progress {
                        phase: "downloading",
                        downloaded,
                        total,
                    },
                );
            },
            || {},
        )
        .await
        .map_err(|_| "下载或签名验证失败，未安装更新；请重新检查更新后重试".to_string())?;
    app.emit(
        "update-progress",
        Progress {
            phase: "preparing",
            downloaded,
            total: Some(downloaded),
        },
    )
    .ok();
    // Hold the shared settings lock until installer launch so no UI/drag write can race this checkpoint.
    let app_state = app.state::<AppState>();
    let data = app_state.data.lock().map_err(|e| e.to_string())?;
    config::persist(&data)?;
    config_storage::checkpoint_at(&config::config_path())?;
    app.emit(
        "update-progress",
        Progress {
            phase: "installing",
            downloaded,
            total: Some(downloaded),
        },
    )
    .ok();
    // Official plugin verifies the signature again, starts NSIS and exits Windows app;
    // NSIS launches the new version on successful completion (plugin default).
    let from_autostart = std::env::args_os().any(|arg| arg == "--autostart");
    if from_autostart {
        std::fs::write(restart_marker_path(), b"restart")
            .map_err(|e| format!("无法准备更新后重启：{e}"))?;
    }
    let result = update
        .install(bytes)
        .map_err(|_| "更新安装未完成，请重试；本机配置及备份已保留".to_string());
    if result.is_err() && from_autostart { let _ = std::fs::remove_file(restart_marker_path()); }
    result
}

#[tauri::command]
pub fn list_config_backups() -> Result<Vec<config_storage::BackupInfo>, String> {
    config_storage::list_at(&config::config_path())
}

#[tauri::command]
pub fn create_config_backup(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let data = state.data.lock().map_err(|e| e.to_string())?;
    config::persist(&data)?;
    config_storage::checkpoint_at(&config::config_path())
}

#[tauri::command]
pub fn restore_config_backup(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut data = state.data.lock().map_err(|e| e.to_string())?;
    let restored = config_storage::restore_at(&config::config_path(), &id)?;
    *data = restored;
    app.emit("display-updated", data.display()).ok();
    app.emit(
        "theme-updated",
        data.selected_theme_id
            .as_deref()
            .unwrap_or("blue-whale-girl"),
    )
    .ok();
    app.emit("settings-updated", ()).ok();
    drop(data);
    if let Err(error) = crate::shortcut::reload_preference(&app) { eprintln!("配置已恢复，快捷键暂不可用：{error}"); }
    Ok(())
}
