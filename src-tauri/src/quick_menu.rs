use crate::config::{AppState, DisplayMode, PrivacyMode, WindowMode};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager};

struct MenuSet {
    menu: Menu<tauri::Wry>,
    display: Submenu<tauri::Wry>,
    size: Submenu<tauri::Wry>,
    theme: Submenu<tauri::Wry>,
    checks: Vec<CheckMenuItem<tauri::Wry>>,
    visibility: MenuItem<tauri::Wry>,
}

pub struct QuickMenus { tray: MenuSet, widget: MenuSet }

impl QuickMenus {
    pub fn new(app: &AppHandle) -> tauri::Result<Self> {
        Ok(Self { tray: MenuSet::new(app, true)?, widget: MenuSet::new(app, false)? })
    }

    pub fn tray(&self) -> &Menu<tauri::Wry> { &self.tray.menu }

    pub fn popup_widget(&self, app: &AppHandle) -> tauri::Result<()> {
        let win = app.get_webview_window("main").ok_or(tauri::Error::WindowNotFound)?;
        win.popup_menu(&self.widget.menu)
    }

    pub fn sync(&self, app: &AppHandle) -> tauri::Result<()> {
        let state = app.state::<AppState>();
        let editing = *state.settings_open.lock().expect("view state poisoned");
        let data = state.data.lock().expect("app data poisoned");
        let visible = app.get_webview_window("main")
            .is_some_and(|win| win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false));
        for set in [&self.tray, &self.widget] {
            let values = [
                data.display_mode == DisplayMode::Amount,
                data.display_mode == DisplayMode::Collection,
                data.window_mode == WindowMode::Full,
                data.window_mode == WindowMode::Mini,
                data.selected_theme_id.as_deref() != Some("mibao"),
                data.selected_theme_id.as_deref() == Some("mibao"),
                data.privacy_mode == PrivacyMode::Hidden,
                data.autonomous_motion_enabled,
            ];
            for (item, checked) in set.checks.iter().zip(values) { item.set_checked(checked)?; }
            set.display.set_enabled(!editing)?;
            set.size.set_enabled(!editing)?;
            set.theme.set_enabled(!editing)?;
            set.checks[7].set_enabled(!editing)?;
        }
        self.tray.visibility.set_text(if visible { "隐藏窗口" } else { "显示窗口" })?;
        Ok(())
    }
}

impl MenuSet {
    fn new(app: &AppHandle, tray: bool) -> tauri::Result<Self> {
        let choices = [
            ("display_amount", "实时金额"), ("display_collection", "趣味积累"),
            ("size_full", "完整模式"), ("size_mini", "迷你模式"),
            ("theme_blue-whale-girl", "蓝色大肥鱼"), ("theme_mibao", "咪宝"),
            ("privacy", "隐私隐藏"), ("motion", "桌宠自主小动作"),
        ];
        let checks = choices.iter().map(|(id, label)| CheckMenuItem::with_id(app, *id, *label, true, false, None::<&str>))
            .collect::<tauri::Result<Vec<_>>>()?;
        let display = Submenu::with_items(app, "显示方式", true, &[&checks[0], &checks[1]])?;
        let size = Submenu::with_items(app, "窗口大小", true, &[&checks[2], &checks[3]])?;
        let theme = Submenu::with_items(app, "皮肤主题", true, &[&checks[4], &checks[5]])?;
        let visibility = MenuItem::with_id(app, if tray { "toggle_visibility" } else { "hide" }, if tray { "显示窗口" } else { "隐藏桌宠" }, true, None::<&str>)?;
        let settings = MenuItem::with_id(app, "settings", "设置…", true, None::<&str>)?;
        let quit = MenuItem::with_id(app, "quit", "退出程序", true, None::<&str>)?;
        let first = PredefinedMenuItem::separator(app)?;
        let second = PredefinedMenuItem::separator(app)?;
        let menu = Menu::with_items(app, &[&display, &size, &theme, &checks[6], &checks[7], &first, &visibility, &settings, &second, &quit])?;
        Ok(Self { menu, display, size, theme, checks, visibility })
    }
}

pub fn sync(app: &AppHandle) {
    if let Some(menus) = app.try_state::<QuickMenus>() {
        if let Err(error) = menus.sync(app) { eprintln!("同步快捷菜单失败：{error}"); }
    }
}
