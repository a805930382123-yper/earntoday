mod config;
mod display_window;

use config::{persist, validate_settings, AppData, AppState, DisplayMode, DisplayPreferences, PrivacyMode, SalarySettings, WindowMode};
use std::time::{SystemTime, UNIX_EPOCH};
use std::sync::Mutex;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

// ---------------------------------------------------------------------------
// 窗口管理
// ---------------------------------------------------------------------------

fn restore_main_window(app: &AppHandle, show: bool) -> tauri::Result<()> {
    display_window::restore(app, show)
}

fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = restore_main_window(app, false);
        let _ = win.set_focus();
        let _ = win.show();
    }
    app.emit_to("main", "show-main", ()).ok();
}

fn open_settings_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let state = app.state::<AppState>();
        let was_open = *state.settings_open.lock().expect("view state poisoned");
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
        let _ = win.show();
        let _ = win.set_focus();
        app.emit_to("main", "open-settings", ()).ok();
    }
}

// ---------------------------------------------------------------------------
// 托盘
// ---------------------------------------------------------------------------

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示小组件", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出程序", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &settings, &quit])?;

    let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))?;
    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("今天又赚了多少")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "settings" => open_settings_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 前端命令
// ---------------------------------------------------------------------------

#[tauri::command]
fn load_data(app: AppHandle) -> AppData {
    let state = app.state::<AppState>();
    let data = state.data.lock().expect("app data poisoned").clone();
    data
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: SalarySettings, display_mode: Option<DisplayMode>) -> Result<(), String> {
    validate_settings(&settings)?;
    {
        let state = app.state::<AppState>();
        let mut data = state.data.lock().map_err(|e| e.to_string())?;
        let mut updated = data.clone();
        updated.settings = Some(settings);
        if let Some(mode) = display_mode { updated.display_mode = mode; }
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
    Ok(display)
}

#[tauri::command]
fn open_settings(app: AppHandle) {
    open_settings_window(&app);
}

#[tauri::command]
fn hide_main(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
}

#[tauri::command]
fn hide_settings(app: AppHandle) {
    show_main(&app);
}

// ---------------------------------------------------------------------------
// 应用入口
// ---------------------------------------------------------------------------

pub fn run() {
    let data = config::load_data();
    let settings_valid = data
        .settings
        .as_ref()
        .map(|s| validate_settings(s).is_ok())
        .unwrap_or(false);

    tauri::Builder::default()
        .manage(AppState {
            data: Mutex::new(data),
            settings_open: Mutex::new(true),
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
            hide_settings
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
            let data_directory = dirs::data_local_dir()
                .unwrap_or_else(|| std::env::temp_dir())
                .join("earn-today")
                .join("webview-sessions")
                .join(format!("{}-{}", std::process::id(), startup_key));

            WebviewWindowBuilder::new(&handle, "main", WebviewUrl::App("index.html".into()))
                .title("今天又赚了多少")
                .inner_size(260.0, 276.0)
                .visible(false)
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
            if settings_valid {
                restore_main_window(&handle, true)?;
            } else {
                // 首次启动或已有配置无效：直接引导设置
                open_settings_window(&handle);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // 点关闭 = 隐藏窗口，程序驻留托盘，只有托盘菜单可真正退出
                api.prevent_close();
                let _ = window.hide();
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
