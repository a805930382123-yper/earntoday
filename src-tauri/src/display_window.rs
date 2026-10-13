use crate::config::{AppState, WindowMode, WindowPosition};
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindow};

pub fn dimensions(mode: WindowMode) -> (f64, f64) {
    match mode { WindowMode::Full => (260.0, 276.0), WindowMode::Mini => (260.0, 108.0) }
}

pub fn position(win: &WebviewWindow) -> tauri::Result<WindowPosition> {
    let pos = win.outer_position()?;
    let scale = win.scale_factor()?;
    Ok(WindowPosition { x: pos.x as f64 / scale, y: pos.y as f64 / scale })
}

// All monitor bounds are physical desktop coordinates; never mix logical
// origins of adjacent displays with different Windows scale factors.
pub fn clamp_axis(value: i32, origin: i32, extent: u32, window: u32) -> i32 {
    value.clamp(origin, origin.saturating_add(extent.saturating_sub(window) as i32))
}

pub fn place(win: &WebviewWindow, target: Option<WindowPosition>, saved_scale: Option<f64>) -> tauri::Result<()> {
    let monitors = win.available_monitors()?;
    if monitors.is_empty() { return Ok(()); }
    let scale = win.scale_factor()?;
    let current = win.outer_position()?;
    let wanted = target.map(|p| {
        if let Some(saved_scale) = saved_scale.filter(|s| s.is_finite() && *s > 0.0) {
            return PhysicalPosition::new((p.x * saved_scale).round() as i32, (p.y * saved_scale).round() as i32);
        }
        // Saved logical coordinates use the window's monitor scale. Recover
        // that monitor before applying coordinates after a restart on another DPI.
        monitors.iter().find_map(|m| {
            let candidate = PhysicalPosition::new((p.x * m.scale_factor()).round() as i32, (p.y * m.scale_factor()).round() as i32);
            let origin = m.position(); let size = m.size();
            (candidate.x >= origin.x && candidate.x < origin.x + size.width as i32 && candidate.y >= origin.y && candidate.y < origin.y + size.height as i32).then_some(candidate)
        }).unwrap_or(PhysicalPosition::new((p.x * scale).round() as i32, (p.y * scale).round() as i32))
    }).unwrap_or(current);
    let monitor = monitors.iter().find(|m| {
        let p = m.position(); let s = m.size();
        wanted.x >= p.x && wanted.x < p.x + s.width as i32 && wanted.y >= p.y && wanted.y < p.y + s.height as i32
    }).or_else(|| monitors.iter().min_by_key(|m| {
        let p = m.position(); let s = m.size();
        let dx = (wanted.x as i64 - (p.x as i64 + s.width as i64 / 2)).abs();
        let dy = (wanted.y as i64 - (p.y as i64 + s.height as i64 / 2)).abs();
        dx * dx + dy * dy
    })).expect("nonempty monitors");
    let area = monitor.work_area();
    let size = win.outer_size()?;
    win.set_position(PhysicalPosition::new(
        clamp_axis(wanted.x, area.position.x, area.size.width, size.width),
        clamp_axis(wanted.y, area.position.y, area.size.height, size.height),
    ))
}

pub fn restore(app: &AppHandle, show: bool) -> tauri::Result<()> {
    let state = app.state::<AppState>();
    let (mode, saved, scale) = { let data = state.data.lock().expect("app data poisoned"); (data.window_mode, data.position, data.position_scale) };
    if let Some(win) = app.get_webview_window("main") {
        let (width, height) = dimensions(mode);
        win.set_size(tauri::LogicalSize::new(width, height))?;
        if saved.is_none() { win.center()?; }
        place(&win, saved, scale)?;
        *state.settings_open.lock().expect("view state poisoned") = false;
        if show { win.show()?; win.set_focus()?; }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn clamp_uses_work_area_including_negative_monitor_origins() {
        assert_eq!(clamp_axis(-2000, -1920, 1920, 390), -1920);
        assert_eq!(clamp_axis(-10, -1920, 1920, 390), -390);
        assert_eq!(clamp_axis(1900, 0, 1920, 390), 1530);
        assert_eq!(clamp_axis(900, 0, 1040, 414), 626);
        assert_eq!(clamp_axis(900, 0, 100, 390), 0);
    }
    #[test]
    fn mode_sizes_are_logical_and_distinct() {
        assert_eq!(dimensions(WindowMode::Full), (260.0, 276.0));
        assert_eq!(dimensions(WindowMode::Mini), (260.0, 108.0));
    }
}
