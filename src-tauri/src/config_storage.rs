//! Keep the established config path; backups contain real on-disk bytes, never defaults.
use crate::config::{self, AppData};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Backup {
    format: u32,
    app_version: String,
    created_at_unix_ms: u128,
    reason: String,
    raw_config: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    id: String,
    app_version: String,
    created_at_unix_ms: u128,
    restorable: bool,
}

fn backup_dir(path: &Path) -> Result<PathBuf, String> {
    Ok(path.parent().ok_or("配置目录无效")?.join("config-backups"))
}

fn read_optional(path: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(path) {
        Ok(raw) => Ok(Some(raw)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("无法读取原配置，已停止写入：{e}")),
    }
}

// tempfile persists using an atomic replace on Windows. Sync before replacement;
// failure leaves the original intact and the temp file is removed by its owner.
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("配置目录无效")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.write_all(bytes)
        .and_then(|_| temp.as_file().sync_all())
        .map_err(|e| e.to_string())?;
    temp.persist(path)
        .map_err(|e| format!("原子写入失败，原配置保留：{e}"))?;
    Ok(())
}

fn backup_raw(path: &Path, raw: &str, reason: &str, name: &str) -> Result<(), String> {
    let backup = Backup {
        format: 1,
        app_version: VERSION.into(),
        created_at_unix_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis(),
        reason: reason.into(),
        raw_config: raw.into(),
    };
    atomic_write(
        &backup_dir(path)?.join(name),
        &serde_json::to_vec_pretty(&backup).map_err(|e| e.to_string())?,
    )
}

fn compatible(raw: &str) -> Result<AppData, String> {
    let value: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    if !value.as_object().is_some_and(|object| !object.is_empty()) {
        return Err("配置对象为空或无效".into());
    }
    let data = config::parse_data(raw);
    if let Some(error) = &data.config_error {
        return Err(error.clone());
    }
    if let Some(settings) = &data.settings {
        config::validate_settings(settings)?;
    }
    Ok(data)
}

fn usable(raw: &str) -> Result<AppData, String> {
    let data = compatible(raw)?;
    let settings = data
        .settings
        .as_ref()
        .ok_or("配置没有工资设置，不能用空配置覆盖或恢复")?;
    config::validate_settings(settings)?;
    Ok(data)
}

pub(crate) fn persist_at(path: &Path, data: &AppData) -> Result<(), String> {
    let original = read_optional(path)?;
    if let Some(raw) = &original {
        let first = format!("before-{VERSION}.json");
        if !backup_dir(path)?.join(&first).exists() {
            backup_raw(path, raw, "before-first-write-in-version", &first)?;
        }
        // Re-check the disk, even if a caller cleared an in-memory error flag.
        // Invalid old data must never turn into defaults via position/theme events.
        compatible(raw).map_err(|e| format!("原配置已保护，未覆盖。{e} 请从配置备份恢复。"))?;
    }
    let mut stored = data.clone();
    stored.config_error = None;
    let content = serde_json::to_string_pretty(&stored).map_err(|e| e.to_string())?;
    compatible(&content)?;
    // A deliberate first-run theme selection is allowed; initialization defaults are not.
    if stored.settings.is_none() && stored.selected_theme_id.is_none() {
        return Err("请先保存设置".into());
    }
    if original.as_deref() == Some(&content) {
        return Ok(());
    }
    if let Some(raw) = original {
        if usable(&raw).is_ok() {
            backup_raw(path, &raw, "previous-valid-config", "last-good.json")?;
        }
    }
    atomic_write(path, content.as_bytes())
}

pub(crate) fn checkpoint_at(path: &Path) -> Result<(), String> {
    let raw = read_optional(path)?.ok_or("请先保存设置，再安装更新")?;
    usable(&raw)?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    backup_raw(
        path,
        &raw,
        "before-update-or-manual-backup",
        &format!("checkpoint-{stamp}.json"),
    )?;
    // Read back both the disk configuration and backup before allowing installation.
    if fs::read_to_string(path).map_err(|e| e.to_string())? != raw {
        return Err("配置在备份过程中发生变化，请重试".into());
    }
    let saved: Backup = serde_json::from_str(
        &fs::read_to_string(backup_dir(path)?.join(format!("checkpoint-{stamp}.json")))
            .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    if saved.raw_config != raw {
        return Err("配置备份校验失败，已取消更新".into());
    }
    Ok(())
}

pub(crate) fn list_at(path: &Path) -> Result<Vec<BackupInfo>, String> {
    let dir = backup_dir(path)?;
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut result = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
            continue;
        }
        let Ok(raw) = fs::read_to_string(entry.path()) else {
            continue;
        };
        let Ok(backup) = serde_json::from_str::<Backup>(&raw) else {
            continue;
        };
        result.push(BackupInfo {
            id: entry.file_name().to_string_lossy().into(),
            app_version: backup.app_version,
            created_at_unix_ms: backup.created_at_unix_ms,
            restorable: backup.format == 1 && usable(&backup.raw_config).is_ok(),
        });
    }
    result.sort_by(|a, b| b.created_at_unix_ms.cmp(&a.created_at_unix_ms));
    Ok(result)
}

pub(crate) fn restore_at(path: &Path, id: &str) -> Result<AppData, String> {
    if !id.ends_with(".json")
        || !id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'.')
        || id.contains("..")
    {
        return Err("备份标识无效".into());
    }
    let backup: Backup = serde_json::from_str(
        &fs::read_to_string(backup_dir(path)?.join(id)).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    if backup.format != 1 {
        return Err("备份格式不支持".into());
    }
    let data = usable(&backup.raw_config)?;
    // Even a corrupt original is preserved byte-for-byte before explicit recovery.
    if let Some(raw) = read_optional(path)? {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        backup_raw(
            path,
            &raw,
            "before-explicit-restore",
            &format!("before-restore-{stamp}.json"),
        )?;
    }
    atomic_write(path, backup.raw_config.as_bytes())?;
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn raw() -> String {
        serde_json::json!({"settings":{"monthlySalary":12345,"workdaysPerMonth":23,"workWeekdays":[0,2,4],"workStart":"08:30","workEnd":"19:00","lunchStart":"12:10","lunchEnd":"13:20","futureFalse":false,"futureZero":0,"futureArray":[]},"position":{"x":0,"y":-100},"selectedThemeId":"mibao","windowMode":"mini","privacyMode":"hidden","displayMode":"collection","futureFlag":false}).to_string()
    }
    #[test]
    fn legacy_missing_fields_and_unknown_values_survive_atomic_save() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        let raw = raw();
        fs::write(&path, &raw).unwrap();
        let mut data = config::parse_data(&raw);
        assert!(data.shortcut_enabled);
        assert!(data.autonomous_motion_enabled);
        data.autonomous_motion_enabled = false;
        data.shortcut_enabled = false;
        data.position.as_mut().unwrap().y = 90.;
        persist_at(&path, &data).unwrap();
        let saved: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(saved["settings"]["futureZero"], 0);
        assert_eq!(saved["settings"]["futureFalse"], false);
        assert_eq!(saved["settings"]["futureArray"], serde_json::json!([]));
        assert_eq!(saved["futureFlag"], false);
        assert_eq!(saved["shortcutEnabled"], false);
        assert_eq!(saved["autonomousMotionEnabled"], false);
        assert!(!config::parse_data(&fs::read_to_string(&path).unwrap()).autonomous_motion_enabled);
        assert_eq!(saved["position"]["x"], 0.);
        assert_eq!(saved["windowMode"], "mini");
        checkpoint_at(&path).unwrap();
        assert!(list_at(&path).unwrap().iter().all(|b| b.restorable));
    }
    #[test]
    fn corruption_cannot_be_overwritten_even_after_caller_clears_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        for broken in [
            "{broken",
            "{}",
            "null",
            r#"{"settings":{"monthlySalary":0}}"#,
        ] {
            fs::write(&path, broken).unwrap();
            assert!(persist_at(&path, &config::parse_data(&raw())).is_err());
            assert!(checkpoint_at(&path).is_err());
            assert_eq!(fs::read_to_string(&path).unwrap(), broken);
        }
    }
    #[test]
    fn restore_is_explicit_validated_and_preserves_corrupt_original() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, raw()).unwrap();
        checkpoint_at(&path).unwrap();
        let id = list_at(&path).unwrap()[0].id.clone();
        fs::write(&path, "broken").unwrap();
        assert!(restore_at(&path, "../config.json").is_err());
        restore_at(&path, &id).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), raw());
        assert!(list_at(&path).unwrap().iter().any(|b| !b.restorable));
        backup_raw(&path, "{}", "bad", "empty.json").unwrap();
        assert!(restore_at(&path, "empty.json").is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), raw());
    }
    #[test]
    fn failed_write_leaves_original_and_never_initializes_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        assert!(persist_at(&path, &AppData::default()).is_err());
        assert!(!path.exists());
        fs::write(&path, raw()).unwrap();
        fs::create_dir(dir.path().join("config-backups")).unwrap();
        fs::create_dir(
            dir.path()
                .join("config-backups")
                .join(format!("before-{VERSION}.json")),
        )
        .unwrap();
        fs::create_dir(dir.path().join("config-backups/last-good.json")).unwrap();
        let mut data = config::parse_data(&raw());
        data.position.as_mut().unwrap().x = 42.;
        assert!(persist_at(&path, &data).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), raw());
    }

    #[test]
    fn first_run_theme_choice_can_be_saved_before_salary_but_not_restored_as_empty_settings() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        let mut data = AppData::default();
        data.selected_theme_id = Some("mibao".into());
        persist_at(&path, &data).unwrap();
        assert!(checkpoint_at(&path).is_err());
        data.settings = config::parse_data(&raw()).settings;
        persist_at(&path, &data).unwrap();
        assert_eq!(
            usable(&fs::read_to_string(path).unwrap())
                .unwrap()
                .selected_theme_id
                .as_deref(),
            Some("mibao")
        );
    }
}
