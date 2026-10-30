mod config;
mod display_window;
mod config_storage;
mod updater;
mod visibility;
mod shortcut;
mod quick_menu;

use config::{persist, validate_settings, AppData, AppState, AutostartBehavior, DisplayMode, DisplayPreferences, PrivacyMode, SalarySettings, WindowMode};
use tauri_plugin_autostart::ManagerExt;

const AUTOSTART_ENTRY: &str = "今天又赚了多少";
use std::time::{SystemTime, UNIX_EPOCH};
use std::sync::Mutex;
use tauri::image::Image;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

// ---------------------------------------------------------------------------
// 窗口管理
// ---------------------------------------------------------------------------

fn restore_main_window(app: &AppHandle, show: bool) -> tauri::Result<()> {
    display_window::restore(app, show)
}

fn show_main(app: &AppHandle) {
    // Explicit navigation after save/close only. Tray and hotkey restore the current view.
    if let Err(error) = restore_main_window(app, false) {
        eprintln!("返回小组件失败：{error}");
        return;
    }
    app.emit_to("main", "show-main", ()).ok();
    quick_menu::sync(app);
    if let Err(error) = visibility::show(app) { eprintln!("显示窗口失败：{error}"); }
}

fn open_settings_window(app: &AppHandle, initializing: bool) {
    if let Some(win) = app.get_webview_window("main") {
        let state = app.state::<AppState>();
        let was_open = *state.settings_open.lock().expect("view state poisoned");
        if was_open && !initializing {
            // Idempotent view synchronization also recovers a missed startup event.
            // Setting the same App view does not remount Settings or its theme page.
            app.emit_to("main", "open-settings", ()).ok();
            quick_menu::sync(app);
            if let Err(error) = visibility::show(app) { eprintln!("恢复设置失败：{error}"); }
            return;
        }
        *state.settings_open.lock().expect("view state poisoned") = true;
        if !was_open {
            if let Ok(position) = display_window::position(&win) {
                let mut data = state.data.lock().expect("app data poisoned");
                data.position = Some(position);
                data.position_scale = win.scale_factor().ok();
                if data.window_mode == WindowMode::Full { data.full_position = Some(position); data.full_position_scale = data.position_scale; }
                if data.config_error.is_none() { let _ = persist(&data); }
            }
        }
        // 只保留一个 WebView：设置页复用主窗口，避免 WebView2 启动资源冲突。
        let _ = win.set_size(tauri::LogicalSize::new(400.0, 600.0));
        let _ = win.center();
        app.emit_to("main", "open-settings", ()).ok();
        quick_menu::sync(app);
        if let Err(error) = visibility::show(app) { eprintln!("显示设置失败：{error}"); }
    }
}

// ---------------------------------------------------------------------------
// 托盘
// ---------------------------------------------------------------------------

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let menus = quick_menu::QuickMenus::new(app)?;
    let menu = menus.tray().clone();
    app.manage(menus);
    quick_menu::sync(app);

    let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))?;
    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("今天又赚了多少")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Err(error) = visibility::show(tray.app_handle()) { eprintln!("恢复窗口失败：{error}"); }
            }
        })
        .build(app)?;
    Ok(())
}

fn handle_menu_event(app: &AppHandle, id: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    let editing = *state.settings_open.lock().map_err(|e| e.to_string())?;
    let guarded = id.starts_with("display_") || id.starts_with("size_") || id.starts_with("theme_") || id == "motion";
    if guarded && editing { return Err("请先返回桌宠再切换此选项".into()); }
    match id {
        "display_amount" | "display_collection" => {
            let mode = if id == "display_amount" { DisplayMode::Amount } else { DisplayMode::Collection };
            let mut data = state.data.lock().map_err(|e| e.to_string())?;
            if data.display_mode != mode {
                let mut updated = data.clone(); updated.display_mode = mode;
                persist(&updated)?; *data = updated;
                drop(data); emit_display(app);
            }
        }
        "size_full" | "size_mini" => {
            let mode = if id == "size_full" { WindowMode::Full } else { WindowMode::Mini };
            set_window_mode(app.clone(), mode)?;
        }
        "theme_blue-whale-girl" | "theme_mibao" => {
            let theme = id.strip_prefix("theme_").unwrap();
            let current = state.data.lock().map_err(|e| e.to_string())?.selected_theme_id.clone();
            if current.as_deref().unwrap_or("blue-whale-girl") != theme { save_theme(app.clone(), theme.into())?; }
        }
        "privacy" => {
            let current = state.data.lock().map_err(|e| e.to_string())?.privacy_mode;
            set_privacy_mode(app.clone(), if current == PrivacyMode::Hidden { PrivacyMode::Visible } else { PrivacyMode::Hidden })?;
        }
        "motion" => {
            let mut data = state.data.lock().map_err(|e| e.to_string())?;
            let mut updated = data.clone(); updated.autonomous_motion_enabled = !data.autonomous_motion_enabled;
            persist(&updated)?; *data = updated;
            app.emit("autonomous-updated", ()).ok();
        }
        "hide" => visibility::hide(app)?,
        "toggle_visibility" => {
            let win = app.get_webview_window("main").ok_or("主窗口不可用")?;
            if win.is_visible().map_err(|e| e.to_string())? && !win.is_minimized().map_err(|e| e.to_string())? { visibility::hide(app)?; }
            else { visibility::show(app)?; }
        }
        "settings" => open_settings_window(app, false),
        "quit" => app.exit(0),
        _ => {}
    }
    Ok(())
}

#[tauri::command]
fn popup_widget_menu(app: AppHandle) -> Result<(), String> {
    if *app.state::<AppState>().settings_open.lock().map_err(|e| e.to_string())? { return Ok(()); }
    let menus = app.state::<quick_menu::QuickMenus>();
    menus.sync(&app).map_err(|e| e.to_string())?;
    menus.popup_widget(&app).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// 前端命令
// ---------------------------------------------------------------------------

#[tauri::command]
fn load_data(app: AppHandle) -> AppData {
    let state = app.state::<AppState>();
    let mut data = state.data.lock().expect("app data poisoned").clone();
    if data.config_error.is_none() {
        if let Some(settings) = &data.settings {
            if let Err(error) = validate_settings(settings) { data.config_error = Some(error); }
        }
    }
    data
}

#[tauri::command]
fn save_settings(app: AppHandle, mut settings: SalarySettings, display_mode: Option<DisplayMode>, autonomous_motion_enabled: Option<bool>) -> Result<(), String> {
    validate_settings(&settings)?;
    {
        let state = app.state::<AppState>();
        let mut data = state.data.lock().map_err(|e| e.to_string())?;
        let mut updated = data.clone();
        if let Some(previous) = &data.settings {
            let mut extra = previous.extra.clone();
            extra.extend(settings.extra);
            settings.extra = extra;
        }
        updated.settings = Some(settings);
        if let Some(mode) = display_mode { updated.display_mode = mode; }
        if let Some(enabled) = autonomous_motion_enabled { updated.autonomous_motion_enabled = enabled; }
        updated.config_error = None;
        persist(&updated)?;
        *data = updated;
    }
    emit_display(&app);
    show_main(&app);
    app.emit_to("main", "settings-updated", ()).ok();
    Ok(())
}

#[tauri::command]
fn save_theme(app: AppHandle, selected_theme_id: String) -> Result<(), String> {
    config::validate_theme_id(&selected_theme_id)?;
    {
        let state = app.state::<AppState>();
        let mut data = state.data.lock().map_err(|e| e.to_string())?;
        let mut updated = data.clone();
        updated.selected_theme_id = Some(selected_theme_id.clone());
        persist(&updated)?;
        *data = updated;
    }
    // No resize, focus, navigation or salary update on a visual-only change.
    app.emit("theme-updated", &selected_theme_id).ok();
    quick_menu::sync(&app);
    Ok(())
}

#[tauri::command]
fn save_position(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    if !x.is_finite() || !y.is_finite() {
        return Err("位置数据无效".into());
    }
    let state = app.state::<AppState>();
    if *state.settings_open.lock().map_err(|e| e.to_string())? { return Ok(()); }
    let mut data = state.data.lock().map_err(|e| e.to_string())?;
    data.position = Some(config::WindowPosition { x, y });
    data.position_scale = app.get_webview_window("main").and_then(|win| win.scale_factor().ok());
    if data.window_mode == WindowMode::Full { data.full_position = data.position; data.full_position_scale = data.position_scale; }
    if data.config_error.is_some() { return Ok(()); }
    persist(&data)
}

fn emit_display(app: &AppHandle) {
    let display = app.state::<AppState>().data.lock().expect("app data poisoned").display();
    app.emit("display-updated", display).ok();
    quick_menu::sync(&app);
}

#[tauri::command]
fn set_privacy_mode(app: AppHandle, privacy_mode: PrivacyMode) -> Result<DisplayPreferences, String> {
    let state = app.state::<AppState>();
    let display = {
        let mut data = state.data.lock().map_err(|e| e.to_string())?;
        let mut updated = data.clone();
        updated.privacy_mode = privacy_mode;
        updated.config_error = None;
        persist(&updated)?;
        *data = updated;
        data.display()
    };
    app.emit("display-updated", display).ok();
    quick_menu::sync(&app);
    Ok(display)
}

#[tauri::command]
fn set_window_mode(app: AppHandle, window_mode: WindowMode) -> Result<DisplayPreferences, String> {
    let state = app.state::<AppState>();
    if *state.settings_open.lock().map_err(|e| e.to_string())? { return Err("请先返回小组件再切换模式".into()); }
    let win = app.get_webview_window("main").ok_or("主窗口不可用")?;
    let current = display_window::position(&win).map_err(|e| e.to_string())?;
    let current_scale = win.scale_factor().map_err(|e| e.to_string())?;
    let (previous, target, target_scale) = {
        let mut data = state.data.lock().map_err(|e| e.to_string())?;
        if data.window_mode == window_mode { return Ok(data.display()); }
        let previous = data.clone();
        let mut updated = data.clone();
        if window_mode == WindowMode::Mini { updated.full_position = Some(current); updated.full_position_scale = Some(current_scale); }
        let target = if window_mode == WindowMode::Full { updated.full_position.unwrap_or(current) } else { current };
        let target_scale = if window_mode == WindowMode::Full { updated.full_position_scale.unwrap_or(current_scale) } else { current_scale };
        updated.window_mode = window_mode;
        updated.position = Some(target);
        updated.position_scale = Some(target_scale);
        persist(&updated)?;
        *data = updated;
        (previous, target, target_scale)
    };
    let (width, height) = display_window::dimensions(window_mode);
    let resized = win.set_size(tauri::LogicalSize::new(width, height)).and_then(|_| display_window::place(&win, Some(target), Some(target_scale)));
    if let Err(error) = resized {
        { let mut data = state.data.lock().map_err(|e| e.to_string())?; persist(&previous)?; *data = previous.clone(); }
        let (w, h) = display_window::dimensions(previous.window_mode);
        let _ = win.set_size(tauri::LogicalSize::new(w, h));
        let _ = display_window::place(&win, Some(current), Some(current_scale));
        return Err(error.to_string());
    }
    let display = state.data.lock().map_err(|e| e.to_string())?.display();
    app.emit("display-updated", display).ok();
    quick_menu::sync(&app);
    Ok(display)
}

#[tauri::command]
fn open_settings(app: AppHandle) {
    open_settings_window(&app, false);
}

#[tauri::command]
fn hide_main(app: AppHandle) -> Result<(), String> {
    visibility::hide(&app)
}

#[tauri::command]
fn hide_settings(app: AppHandle) {
    show_main(&app);
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AutostartStatus { enabled: bool, behavior: AutostartBehavior }

#[tauri::command]
fn get_autostart_status(app: AppHandle) -> Result<AutostartStatus, String> {
    let enabled = app.autolaunch().is_enabled().map_err(|e| e.to_string())?;
    let behavior = app.state::<AppState>().data.lock().map_err(|e| e.to_string())?.autostart_behavior;
    Ok(AutostartStatus { enabled, behavior })
}

#[tauri::command]
fn set_autostart_behavior(app: AppHandle, behavior: AutostartBehavior) -> Result<AutostartStatus, String> {
    let state = app.state::<AppState>();
    let mut data = state.data.lock().map_err(|e| e.to_string())?;
    if let Some(error) = &data.config_error { return Err(error.clone()); }
    let mut updated = data.clone();
    updated.autostart_behavior = behavior;
    persist(&updated)?;
    *data = updated;
    drop(data);
    get_autostart_status(app)
}

#[tauri::command]
fn set_autostart_enabled(app: AppHandle, enabled: bool) -> Result<AutostartStatus, String> {
    if enabled {
        // Only the executable named by this user's installed application may register.
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let installed = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
            .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\今天又赚了多少")
            .ok()
            .and_then(|key| key.get_value::<String, _>("DisplayIcon").ok())
            .map(|path| std::path::PathBuf::from(path.trim_matches('"')));
        if cfg!(debug_assertions) || installed.as_ref().and_then(|path| path.canonicalize().ok()) != exe.canonicalize().ok() {
            return Err("请安装候选版本后再开启开机启动".into());
        }
        app.autolaunch().enable().map_err(|e| e.to_string())?;
        // auto-launch 0.6 writes the raw path. Quote this same plugin entry for
        // installed paths containing spaces, without adding another startup method.
        let quoted = format!("\"{}\" --autostart", exe.display());
        let write_result = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
            .open_subkey_with_flags("Software\\Microsoft\\Windows\\CurrentVersion\\Run", winreg::enums::KEY_SET_VALUE)
            .and_then(|key| key.set_value(AUTOSTART_ENTRY, &quoted));
        if let Err(error) = write_result {
            let _ = app.autolaunch().disable();
            return Err(format!("开机启动注册未完成：{error}"));
        }
    } else {
        app.autolaunch().disable().map_err(|e| e.to_string())?;
    }
    get_autostart_status(app)
}

#[tauri::command]
fn startup_widget_ready(app: AppHandle) -> Result<(), String> {
    let state = app.state::<StartupState>();
    if state.quiet_widget && !state.ready.swap(true, std::sync::atomic::Ordering::AcqRel) {
        visibility::show_quietly(&app)?;
    }
    Ok(())
}

struct StartupState { quiet_widget: bool, ready: std::sync::atomic::AtomicBool }

// ---------------------------------------------------------------------------
// 应用入口
// ---------------------------------------------------------------------------

pub fn run() {
    let autostart_arg = std::env::args_os().any(|arg| arg == "--autostart");
    let update_restart = updater::consume_update_restart();
    let autostart = autostart_arg && !update_restart;
    let data = config::load_data();
    let quiet_widget = autostart && data.autostart_behavior == AutostartBehavior::Widget;
    let shortcut_enabled = data.shortcut_enabled;
    let settings_valid = data.config_error.is_none() && data
        .settings
        .as_ref()
        .map(|s| validate_settings(s).is_ok())
        .unwrap_or(false);

    let builder = tauri::Builder::default();
    // The isolated acceptance binary deliberately permits a second instance
    // to exercise global shortcut registration conflicts.
    #[cfg(not(feature = "isolated-test"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _| {
        if args.iter().any(|arg| arg == "--autostart") { return; }
        let handle = app.clone();
        if let Err(error) = app.run_on_main_thread(move || {
            if let Err(error) = visibility::show(&handle) { eprintln!("再次启动时恢复窗口失败：{error}"); }
        }) { eprintln!("再次启动时恢复窗口失败：{error}"); }
    }));

    builder
        .plugin(tauri_plugin_autostart::Builder::new().app_name(AUTOSTART_ENTRY).arg("--autostart").build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updater::UpdateState::default())
        .manage(visibility::VisibilityState::default())
        .manage(StartupState { quiet_widget, ready: std::sync::atomic::AtomicBool::new(false) })
        .manage(shortcut::ShortcutRuntime::default())
        .manage(AppState {
            data: Mutex::new(data),
            // Ignore queued startup/centering moves until the first view is placed.
            settings_open: Mutex::new(true),
        })
        .on_menu_event(|app, event| {
            if let Err(error) = handle_menu_event(app, event.id().as_ref()) {
                eprintln!("快捷菜单操作失败：{error}");
                app.emit_to("main", "quick-menu-error", &error).ok();
            }
            quick_menu::sync(app);
        })
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_settings,
            save_theme,
            save_position,
            set_window_mode,
            set_privacy_mode,
            open_settings,
            hide_main,
            hide_settings,
            popup_widget_menu,
            get_autostart_status,
            set_autostart_behavior,
            set_autostart_enabled,
            startup_widget_ready,
            visibility::get_main_visibility,
            visibility::toggle_main_visibility,
            shortcut::get_shortcut_status,
            shortcut::set_shortcut_enabled,
            updater::check_update,
            updater::install_update,
            updater::list_config_backups,
            updater::create_config_backup,
            updater::restore_config_backup
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            // 工资配置保存在独立的 Rust 配置文件中，WebView 不需要持久化数据。
            // 这里为每次启动分配独立目录。WebView2 的默认目录即使配合无痕模式，
            // 仍会在创建 Environment 阶段被检查；残留锁或异常状态会导致
            // 返回 HRESULT 0x800700AA（“请求的资源在使用中”）。
            let startup_key = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|value| value.as_nanos())
                .unwrap_or(0);
            #[cfg(feature = "isolated-test")]
            let session_root = config::isolated_test_root();
            #[cfg(not(feature = "isolated-test"))]
            let session_root = dirs::data_local_dir()
                .unwrap_or_else(|| std::env::temp_dir())
                .join("earn-today");
            let data_directory = session_root
                .join("webview-sessions")
                .join(format!("{}-{}", std::process::id(), startup_key));

            WebviewWindowBuilder::new(&handle, "main", WebviewUrl::App("index.html".into()))
                .title("今天又赚了多少")
                .inner_size(260.0, 276.0)
                .visible(false)
                .focused(!autostart)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .resizable(false)
                .skip_taskbar(true)
                .shadow(false)
                .center()
                .data_directory(data_directory)
                .incognito(true)
                .build()?;

            create_tray(&handle).expect("创建系统托盘失败");
            shortcut::initialize(&handle, shortcut_enabled);
            if settings_valid {
                restore_main_window(&handle, false)?;
                if !autostart { visibility::show(&handle).map_err(std::io::Error::other)?; }
            } else {
                // Automatic login remains in the tray until the user explicitly opens it.
                if !autostart { open_settings_window(&handle, true); }
            }
            quick_menu::sync(&handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Resized(_)) {
                if let Err(error) = visibility::refresh(window.app_handle()) { eprintln!("同步窗口可见性失败：{error}"); }
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                // 点关闭 = 隐藏窗口，程序驻留托盘，只有托盘菜单可真正退出
                api.prevent_close();
                if let Err(error) = visibility::hide(window.app_handle()) { eprintln!("隐藏窗口失败：{error}"); }
            }
            if let WindowEvent::Moved(position) = event {
                let state = window.state::<AppState>();
                if !*state.settings_open.lock().expect("view state poisoned") {
                    // Ignore stale queued moves from centering the settings page.
                    if window.outer_position().ok().as_ref() == Some(position) {
                        if let Ok(scale) = window.scale_factor() {
                            let mut data = state.data.lock().expect("app data poisoned");
                            data.position = Some(config::WindowPosition { x: position.x as f64 / scale, y: position.y as f64 / scale });
                            data.position_scale = Some(scale);
                            if data.window_mode == WindowMode::Full { data.full_position = data.position; data.full_position_scale = Some(scale); }
                            if data.config_error.is_none() { let _ = persist(&data); }
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
