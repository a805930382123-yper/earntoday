use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// 工资与工作时间设置（与前端 SalarySettings 对应，camelCase 序列化）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalarySettings {
    pub monthly_salary: f64,
    pub workdays_per_month: u32,
    pub work_start: String,
    pub work_end: String,
    pub lunch_start: String,
    pub lunch_end: String,
}

/// 悬浮窗位置：逻辑坐标，跨 DPI 缩放恢复更稳定。
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WindowMode { #[default] Full, Mini }

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PrivacyMode { #[default] Visible, Hidden }

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayPreferences {
    pub window_mode: WindowMode,
    pub privacy_mode: PrivacyMode,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppData {
    #[serde(default)]
    pub settings: Option<SalarySettings>,
    #[serde(default)]
    pub position: Option<WindowPosition>,
    #[serde(default, deserialize_with = "deserialize_theme_id")]
    pub selected_theme_id: Option<String>,
    #[serde(default)]
    pub window_mode: WindowMode,
    #[serde(default)]
    pub privacy_mode: PrivacyMode,
    #[serde(default)]
    pub full_position: Option<WindowPosition>,
    #[serde(default)]
    pub position_scale: Option<f64>,
    #[serde(default)]
    pub full_position_scale: Option<f64>,
    // Report failures to the UI; this transient diagnostic is never persisted.
    #[serde(default, skip_deserializing, skip_serializing_if = "Option::is_none")]
    pub config_error: Option<String>,
}

impl AppData {
    pub fn display(&self) -> DisplayPreferences {
        DisplayPreferences { window_mode: self.window_mode, privacy_mode: self.privacy_mode }
    }
}

// A malformed optional theme must never discard otherwise valid salary data.
fn deserialize_theme_id<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Option<String>, D::Error> {
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(value.as_str().map(str::to_owned))
}

pub fn validate_theme_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 64 || !id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-') {
        return Err("主题标识无效".into());
    }
    Ok(())
}

/// 全局共享的应用数据。
pub struct AppState {
    pub data: Mutex<AppData>,
    pub settings_open: Mutex<bool>,
}

fn config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("earn-today")
        .join("config.json")
}

pub fn load_data() -> AppData {
    match fs::read_to_string(config_path()) {
        Ok(content) => parse_data(&content),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => AppData::default(),
        Err(error) => failed_data(format!("配置读取失败：{error}")),
    }
}

fn failed_data(message: String) -> AppData {
    AppData { privacy_mode: PrivacyMode::Hidden, config_error: Some(message), ..AppData::default() }
}

fn parse_data(content: &str) -> AppData {
    let mut value: serde_json::Value = match serde_json::from_str(content) {
        Ok(value) => value,
        Err(error) => return failed_data(format!("配置格式损坏：{error}")),
    };
    let mut invalid = false;
    for (key, valid, fallback) in [
        ("windowMode", ["full", "mini"], "full"),
        ("privacyMode", ["visible", "hidden"], "hidden"),
    ] {
        if let Some(field) = value.get(key) {
            if !field.as_str().is_some_and(|s| valid.contains(&s)) {
                value[key] = serde_json::json!(fallback);
                invalid = true;
            }
        }
    }
    match serde_json::from_value::<AppData>(value) {
        Ok(mut data) => {
            if invalid {
                data.privacy_mode = PrivacyMode::Hidden;
                data.config_error = Some("显示配置无效，暂不显示收入；请检查并保存设置。".into());
            }
            data
        },
        Err(error) => failed_data(format!("配置内容无效：{error}")),
    }
}

pub fn persist(data: &AppData) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut stored = data.clone();
    stored.config_error = None;
    let content = serde_json::to_string_pretty(&stored).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

fn minutes(hm: &str) -> Option<i32> {
    let parts: Vec<&str> = hm.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let h: i32 = parts[0].trim().parse().ok()?;
    let m: i32 = parts[1].trim().parse().ok()?;
    if !(0..=23).contains(&h) || !(0..=59).contains(&m) {
        return None;
    }
    Some(h * 60 + m)
}

/// 后端侧再次校验设置；非法数据不会被持久化。
pub fn validate_settings(s: &SalarySettings) -> Result<(), String> {
    if !s.monthly_salary.is_finite() || s.monthly_salary <= 0.0 {
        return Err("月薪必须大于 0".into());
    }
    if s.monthly_salary > 1_000_000_000.0 {
        return Err("月薪数值过大".into());
    }
    if s.workdays_per_month == 0 || s.workdays_per_month > 31 {
        return Err("工作天数需为 1-31 的整数".into());
    }
    let start = minutes(&s.work_start).ok_or("上班时间无效")?;
    let end = minutes(&s.work_end).ok_or("下班时间无效")?;
    let lunch_start = minutes(&s.lunch_start).ok_or("午休开始时间无效")?;
    let lunch_end = minutes(&s.lunch_end).ok_or("午休结束时间无效")?;
    if end <= start {
        return Err("下班时间必须晚于上班时间".into());
    }
    if lunch_start <= start {
        return Err("午休开始必须晚于上班时间".into());
    }
    if lunch_end <= lunch_start {
        return Err("午休结束必须晚于午休开始".into());
    }
    if lunch_end >= end {
        return Err("午休结束必须早于下班时间".into());
    }
    Ok(())
}

#[cfg(test)]
mod theme_tests {
    use super::*;

    fn legacy() -> serde_json::Value {
        serde_json::json!({"settings":{"monthlySalary":8800,"workdaysPerMonth":22,"workStart":"09:00","workEnd":"18:00","lunchStart":"12:00","lunchEnd":"13:00"},"position":{"x":150.0,"y":200.0}})
    }

    #[test]
    fn old_configuration_keeps_salary_and_position() {
        let data: AppData = serde_json::from_value(legacy()).unwrap();
        assert!(data.selected_theme_id.is_none());
        assert_eq!(data.settings.unwrap().monthly_salary, 8800.0);
        assert_eq!(data.position.unwrap().x, 150.0);
    }

    #[test]
    fn malformed_theme_does_not_discard_salary() {
        for invalid in [serde_json::json!(null), serde_json::json!(3), serde_json::json!({"broken":true})] {
            let mut value = legacy();
            value["selectedThemeId"] = invalid;
            let data: AppData = serde_json::from_value(value).unwrap();
            assert!(data.selected_theme_id.is_none());
            assert_eq!(data.settings.unwrap().monthly_salary, 8800.0);
        }
    }

    #[test]
    fn salary_theme_and_position_roundtrip_independently() {
        let mut data: AppData = serde_json::from_value(legacy()).unwrap();
        data.selected_theme_id = Some("blue-whale-girl".into());
        data.settings.as_mut().unwrap().monthly_salary = 9900.0;
        let restored: AppData = serde_json::from_str(&serde_json::to_string(&data).unwrap()).unwrap();
        assert_eq!(restored.selected_theme_id.as_deref(), Some("blue-whale-girl"));
        assert_eq!(restored.settings.unwrap().monthly_salary, 9900.0);
        assert_eq!(restored.position.unwrap().y, 200.0);
    }

    #[test]
    fn theme_id_validation_is_bounded() {
        assert!(validate_theme_id("blue-whale-girl").is_ok());
        for invalid in ["", "../theme", "BAD THEME", &"x".repeat(65)] { assert!(validate_theme_id(invalid).is_err()); }
    }

    #[test]
    fn legacy_modes_default_to_full_visible() {
        let data = parse_data(&legacy().to_string());
        assert_eq!(data.window_mode, WindowMode::Full);
        assert_eq!(data.privacy_mode, PrivacyMode::Visible);
        assert!(data.config_error.is_none());
    }

    #[test]
    fn modes_roundtrip_without_losing_salary_theme_or_anchors() {
        let mut data: AppData = serde_json::from_value(legacy()).unwrap();
        data.window_mode = WindowMode::Mini;
        data.privacy_mode = PrivacyMode::Hidden;
        data.selected_theme_id = Some("mibao".into());
        data.full_position = Some(WindowPosition { x: -1000.0, y: 200.0 });
        let restored = parse_data(&serde_json::to_string(&data).unwrap());
        assert_eq!(restored.window_mode, WindowMode::Mini);
        assert_eq!(restored.privacy_mode, PrivacyMode::Hidden);
        assert_eq!(restored.selected_theme_id.as_deref(), Some("mibao"));
        assert_eq!(restored.settings.unwrap().monthly_salary, 8800.0);
        assert_eq!(restored.full_position.unwrap().x, -1000.0);
    }

    #[test]
    fn corrupt_privacy_fails_closed_and_keeps_valid_salary() {
        for invalid in [serde_json::json!(null), serde_json::json!(false), serde_json::json!("unknown")] {
            let mut value = legacy(); value["privacyMode"] = invalid;
            let data = parse_data(&value.to_string());
            assert_eq!(data.privacy_mode, PrivacyMode::Hidden);
            assert!(data.config_error.is_some());
            assert_eq!(data.settings.unwrap().monthly_salary, 8800.0);
        }
        let data = parse_data("broken json");
        assert_eq!(data.privacy_mode, PrivacyMode::Hidden);
        assert!(data.config_error.is_some());
    }
}
