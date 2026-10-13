// 核心工资计算与工作状态判断：纯函数，与 UI 完全分离。
// 所有金额使用未提前四舍五入的中间值，仅在展示层保留两位小数。

export interface SalarySettings {
  /** 月薪（元） */
  monthlySalary: number;
  /** 每月工作天数 */
  workdaysPerMonth: number;
  /** 上班时间，24 小时制 "HH:MM" */
  workStart: string;
  /** 下班时间，24 小时制 "HH:MM" */
  workEnd: string;
  /** 午休开始时间，24 小时制 "HH:MM" */
  lunchStart: string;
  /** 午休结束时间，24 小时制 "HH:MM" */
  lunchEnd: string;
}

export type WorkState =
  | "before" // 上班前
  | "working" // 上班中
  | "lunch" // 午休中
  | "after" // 下班后
  | "weekend"; // 非工作日

/** 将 "HH:MM" 解析为当天从 00:00 起的分钟数，非法格式返回 NaN。 */
export function parseMinutes(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min)) return NaN;
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN;
  return h * 60 + min;
}

export function isValidTime(hm: string): boolean {
  return Number.isFinite(parseMinutes(hm));
}

/** 日薪 = 月薪 ÷ 每月工作天数 */
export function dailySalary(s: SalarySettings): number {
  return s.monthlySalary / s.workdaysPerMonth;
}

/** 每日实际工作时长（分钟）= 下班 - 上班 - 午休 */
export function dailyWorkMinutes(s: SalarySettings): number {
  const start = parseMinutes(s.workStart);
  const end = parseMinutes(s.workEnd);
  const lunch = parseMinutes(s.lunchEnd) - parseMinutes(s.lunchStart);
  return end - start - lunch;
}

/** 时薪 = 日薪 ÷ 每日工时 */
export function hourlySalary(s: SalarySettings): number {
  return dailySalary(s) / (dailyWorkMinutes(s) / 60);
}

/** 当前时间在当天中的分钟数（含秒的小数部分，用于每秒平滑刷新）。 */
function nowMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + now.getMilliseconds() / 60000;
}

export function workState(now: Date, s: SalarySettings): WorkState {
  const day = now.getDay();
  if (day === 0 || day === 6) return "weekend";
  const t = nowMinutes(now);
  const start = parseMinutes(s.workStart);
  const lunchStart = parseMinutes(s.lunchStart);
  const lunchEnd = parseMinutes(s.lunchEnd);
  const end = parseMinutes(s.workEnd);
  if (t < start) return "before";
  if (t < lunchStart) return "working";
  if (t < lunchEnd) return "lunch";
  if (t < end) return "working";
  return "after";
}

/**
 * 今日已累计的有效工作分钟数（午休剔除，下班封顶，上班前/周末为 0）。
 * 每次都基于当前系统时间重新计算，不依赖增量累加，
 * 因此隐藏、睡眠恢复、重启后结果依然正确。
 */
export function effectiveWorkedMinutes(now: Date, s: SalarySettings): number {
  const state = workState(now, s);
  if (state === "weekend" || state === "before") return 0;
  const t = nowMinutes(now);
  const start = parseMinutes(s.workStart);
  const end = parseMinutes(s.workEnd);
  const lunchStart = parseMinutes(s.lunchStart);
  const lunchEnd = parseMinutes(s.lunchEnd);
  const span = Math.min(t, end) - start; // 从上班开始经过的时间
  const lunchElapsed = Math.min(Math.max(t - lunchStart, 0), lunchEnd - lunchStart); // 已流逝的午休
  return Math.max(span - lunchElapsed, 0);
}

/** 今日已赚金额 = 日薪 ×（已工作分钟 ÷ 每日工作分钟），中间值不四舍五入。 */
export function earnedAmount(now: Date, s: SalarySettings): number {
  const total = dailyWorkMinutes(s);
  if (total <= 0) return 0;
  return dailySalary(s) * (effectiveWorkedMinutes(now, s) / total);
}

/** 今日工作进度 0-1（下班后固定为 1）。 */
export function workProgress(now: Date, s: SalarySettings): number {
  const total = dailyWorkMinutes(s);
  if (total <= 0) return 0;
  const v = effectiveWorkedMinutes(now, s) / total;
  return Math.min(Math.max(v, 0), 1);
}

/** 距离下班的剩余分钟数（按自然时间计算，午休期间也在倒计时）。 */
export function minutesUntilOffWork(now: Date, s: SalarySettings): number {
  const t = nowMinutes(now);
  const end = parseMinutes(s.workEnd);
  return Math.max(end - t, 0);
}

/** 将分钟数格式化为 "3h 20m" / "45m" / "0m"。 */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h <= 0) return `${rest}m`;
  return `${h}h ${rest}m`;
}

// ---------------------------------------------------------------------------
// 设置校验
// ---------------------------------------------------------------------------

export interface ValidationErrors {
  monthlySalary?: string;
  workdaysPerMonth?: string;
  workStart?: string;
  workEnd?: string;
  lunchStart?: string;
  lunchEnd?: string;
  /** 后端保存失败等表单级错误 */
  form?: string;
}

/** 校验设置；全部合法返回 null，否则返回按字段分组的错误信息。 */
export function validateSettings(s: SalarySettings): ValidationErrors | null {
  const errors: ValidationErrors = {};
  if (!Number.isFinite(s.monthlySalary) || s.monthlySalary <= 0) {
    errors.monthlySalary = "月薪必须大于 0";
  } else if (s.monthlySalary > 1_000_000_000) {
    errors.monthlySalary = "月薪数值过大";
  }
  if (!Number.isInteger(s.workdaysPerMonth) || s.workdaysPerMonth < 1 || s.workdaysPerMonth > 31) {
    errors.workdaysPerMonth = "工作天数需为 1-31 的整数";
  }
  const start = parseMinutes(s.workStart);
  const end = parseMinutes(s.workEnd);
  const lunchStart = parseMinutes(s.lunchStart);
  const lunchEnd = parseMinutes(s.lunchEnd);
  if (!Number.isFinite(start)) errors.workStart = "请输入有效时间";
  if (!Number.isFinite(end)) errors.workEnd = "请输入有效时间";
  if (!Number.isFinite(lunchStart)) errors.lunchStart = "请输入有效时间";
  if (!Number.isFinite(lunchEnd)) errors.lunchEnd = "请输入有效时间";
  const timesOk =
    Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(lunchStart) && Number.isFinite(lunchEnd);
  if (timesOk) {
    if (end <= start) errors.workEnd = "下班时间必须晚于上班时间";
    if (lunchStart <= start) errors.lunchStart = "午休开始必须晚于上班时间";
    if (lunchEnd <= lunchStart) errors.lunchEnd = "午休结束必须晚于午休开始";
    if (lunchEnd >= end) errors.lunchEnd = "午休结束必须早于下班时间";
  }
  if (Object.keys(errors).length === 0) return null;
  return errors;
}

export const DEFAULT_SETTINGS: SalarySettings = {
  monthlySalary: 10000,
  workdaysPerMonth: 22,
  workStart: "09:00",
  workEnd: "18:00",
  lunchStart: "12:00",
  lunchEnd: "13:00",
};
