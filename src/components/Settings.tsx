import { useEffect, useMemo, useState } from "react";
import { invoke } from "../tauri";
import { useTheme } from "../themes/ThemeProvider";
import { ThemePicker, PaletteIcon } from "./ThemePicker";
import { WorkWeekdays } from "./WorkWeekdays";
import { UpdatePanel } from "../update/UpdateProvider";
import { BackupPanel } from "../update/BackupPanel";
import { ShortcutPanel } from "../display/ShortcutPanel";
import { useDisplay, type DisplayMode } from "../display/DisplayProvider";
import { useAutonomousPreferences } from "../autonomous/Preferences";
import {
  DEFAULT_SETTINGS,
  dailySalary,
  dailyWorkMinutes,
  hourlySalary,
  normalizeWorkWeekdays,
  validateSettings,
  type SalarySettings,
  type ValidationErrors,
} from "../salary/calc";

interface FormState {
  salary: string;
  days: string;
  workWeekdays: number[];
  start: string;
  end: string;
  lunchStart: string;
  lunchEnd: string;
}

const INITIAL: FormState = {
  salary: String(DEFAULT_SETTINGS.monthlySalary),
  days: String(DEFAULT_SETTINGS.workdaysPerMonth),
  workWeekdays: [...DEFAULT_SETTINGS.workWeekdays],
  start: DEFAULT_SETTINGS.workStart,
  end: DEFAULT_SETTINGS.workEnd,
  lunchStart: DEFAULT_SETTINGS.lunchStart,
  lunchEnd: DEFAULT_SETTINGS.lunchEnd,
};

function toSettings(f: FormState): SalarySettings {
  return {
    monthlySalary: Number(f.salary),
    workdaysPerMonth: Number(f.days),
    workWeekdays: [...f.workWeekdays],
    workStart: f.start,
    workEnd: f.end,
    lunchStart: f.lunchStart,
    lunchEnd: f.lunchEnd,
  };
}

export function Settings() {
  const { theme, assetError, notice } = useTheme();
  const { displayMode: savedDisplayMode } = useDisplay();
  const [displayMode, setDisplayMode] = useState<DisplayMode>(savedDisplayMode);
  const { reduced } = useAutonomousPreferences();
  const [autonomousMotionEnabled, setAutonomousMotionEnabled] = useState(true);
  const [page, setPage] = useState<"salary" | "themes">("salary");
  const [form, setForm] = useState<FormState>(INITIAL);
  const [isFirstRun, setIsFirstRun] = useState(true);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [baseline, setBaseline] = useState("");

  useEffect(() => {
    invoke<{ settings: SalarySettings | null; displayMode?: DisplayMode; autonomousMotionEnabled?: boolean; configError?: string }>("load_data")
      .then((data) => {
        if (data.configError) setLoadError(data.configError);
        setDisplayMode(data.displayMode === "collection" ? "collection" : "amount");
        setAutonomousMotionEnabled(data.autonomousMotionEnabled !== false);
        if (data.settings) {
          const s = data.settings;
          const loadedForm: FormState = {
            salary: String(s.monthlySalary),
            days: String(s.workdaysPerMonth),
            workWeekdays: normalizeWorkWeekdays(s.workWeekdays),
            start: s.workStart,
            end: s.workEnd,
            lunchStart: s.lunchStart,
            lunchEnd: s.lunchEnd,
          };
          setForm(loadedForm);
          setBaseline(JSON.stringify({ settings: toSettings(loadedForm), displayMode: data.displayMode === "collection" ? "collection" : "amount", autonomousMotionEnabled: data.autonomousMotionEnabled !== false }));
          setIsFirstRun(false);
        }
      })
      .catch((err) => {
        console.error(err);
        setLoadError(String(err));
      });
  }, []);

  const parsed = toSettings(form);
  const valid = useMemo(() => validateSettings(parsed), [parsed]);
  const daily = valid === null ? dailySalary(parsed) : 0;
  const dailyHours = valid === null ? dailyWorkMinutes(parsed) / 60 : 0;
  const hourly = valid === null ? hourlySalary(parsed) : 0;

  const set = (key: Exclude<keyof FormState, "workWeekdays">) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateSettings(parsed);
    setErrors(errs ?? {});
    if (errs) return;
    setSubmitting(true);
    try {
      // Rust 端保存后会隐藏设置窗口并显示主悬浮窗
      await invoke("save_settings", { settings: parsed, displayMode, autonomousMotionEnabled });
    } catch (err) {
      setErrors({ form: String(err) });
      setSubmitting(false);
    }
  };

  if (page === "themes") return <ThemePicker onBack={() => setPage("salary")} />;

  return (
    <div className="settings-shell">
      <div className="card settings-card salary-settings-card">
        <button type="button" className="theme-entry" aria-label="皮肤主题" onClick={() => setPage("themes")}>
          <PaletteIcon />
          <span><strong>皮肤主题</strong><small>当前：{theme.name}</small></span>
          <span aria-hidden="true">›</span>
        </button>
        <button type="button" className="icon-btn close-btn" title="关闭" aria-label="关闭设置"
          onClick={() => invoke("hide_settings").catch(console.error)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        {loadError && (
          <p className="error form-error">设置读取失败：{loadError}</p>
        )}
        {notice && <p className="theme-notice" role="status">{notice}</p>}

        <div className="settings-head" data-tauri-drag-region>
          <div className="settings-portrait" aria-hidden="true">
            <img className="settings-portrait-image" src={theme.characters.settings} onError={assetError} alt="" draggable={false} />
          </div>
          <h1>先来算算你的打工身价！</h1>
          <p className="subtitle">{isFirstRun ? "设置完成后，小女孩就到桌面陪你上班" : "保存后立即生效，今日收入按新设置重新计算"}</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <fieldset className="display-mode-picker">
            <legend>显示方式</legend>
            <div className="display-mode-options">
              <label><input type="radio" name="display-mode" value="amount" checked={displayMode === "amount"} onChange={() => setDisplayMode("amount")} /><span>实时金额</span></label>
              <label><input type="radio" name="display-mode" value="collection" checked={displayMode === "collection"} onChange={() => setDisplayMode("collection")} /><span>趣味积累</span></label>
            </div>
            <p>{displayMode === "collection" ? "用饭饭和小鱼干，收藏今天的努力" : "实时查看今天的工作收入"}</p>
          </fieldset>
          <div className="field-row">
            <div className="field">
              <label htmlFor="salary">月薪（元）</label>
              <input
                id="salary"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="例如 10000"
                value={form.salary}
                onChange={set("salary")}
                aria-invalid={!!errors.monthlySalary}
              />
              {errors.monthlySalary && <span className="error">{errors.monthlySalary}</span>}
            </div>
            <div className="field">
              <label htmlFor="days">每月工作天数</label>
              <input
                id="days"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                step="1"
                placeholder="22"
                value={form.days}
                onChange={set("days")}
                aria-invalid={!!errors.workdaysPerMonth}
              />
              {errors.workdaysPerMonth && <span className="error">{errors.workdaysPerMonth}</span>}
            </div>
          </div>

          <WorkWeekdays value={form.workWeekdays} onChange={workWeekdays => { setForm(f => ({ ...f, workWeekdays })); setErrors(previous => ({ ...previous, workWeekdays: undefined })); }} error={errors.workWeekdays} />

          <div className="field-row">
            <div className="field">
              <label htmlFor="start">上班时间</label>
              <input id="start" type="time" value={form.start} onChange={set("start")} aria-invalid={!!errors.workStart} />
              {errors.workStart && <span className="error">{errors.workStart}</span>}
            </div>
            <div className="field">
              <label htmlFor="end">下班时间</label>
              <input id="end" type="time" value={form.end} onChange={set("end")} aria-invalid={!!errors.workEnd} />
              {errors.workEnd && <span className="error">{errors.workEnd}</span>}
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="lunchStart">午休开始</label>
              <input id="lunchStart" type="time" value={form.lunchStart} onChange={set("lunchStart")} aria-invalid={!!errors.lunchStart} />
              {errors.lunchStart && <span className="error">{errors.lunchStart}</span>}
            </div>
            <div className="field">
              <label htmlFor="lunchEnd">午休结束</label>
              <input id="lunchEnd" type="time" value={form.lunchEnd} onChange={set("lunchEnd")} aria-invalid={!!errors.lunchEnd} />
              {errors.lunchEnd && <span className="error">{errors.lunchEnd}</span>}
            </div>
          </div>

          <p className="work-hours-hint">
            每日实际工作 <strong>{valid === null ? dailyHours.toFixed(1) : "--"}</strong> 小时（自动扣除午休）
          </p>
          <div className="autonomous-setting">
            <label><input type="checkbox" checked={autonomousMotionEnabled} onChange={event => setAutonomousMotionEnabled(event.target.checked)} />桌宠自主小动作</label>
            <p>偶尔眨眼、打哈欠或动动耳朵，安静陪你工作。</p>
            {reduced && <p role="status">系统已要求减少动态效果，自主小动作暂时暂停。</p>}
          </div>

          <div className="preview">
            <span className="preview-title">你的打工身价</span>
            <div className="preview-values">
              <span>日薪 <strong>¥ {valid === null ? daily.toFixed(2) : "--"}</strong></span>
              <span>时薪 <strong>¥ {valid === null ? hourly.toFixed(2) : "--"}</strong></span>
            </div>
          </div>

          {errors.form && <span className="error form-error">{errors.form}</span>}

          <button type="submit" className="primary-btn" disabled={submitting}>
            {isFirstRun ? "开始赚钱！" : "保存设置"}
          </button>
        </form>
        <UpdatePanel unsaved={isFirstRun || !!loadError || baseline !== JSON.stringify({ settings: parsed, displayMode, autonomousMotionEnabled })} />
        <BackupPanel />
        <ShortcutPanel />
      </div>
    </div>
  );
}
