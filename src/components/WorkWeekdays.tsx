import { DEFAULT_WORK_WEEKDAYS, WEEKDAYS } from "../salary/calc";

export function WorkWeekdays({ value, onChange, error }: { value: number[]; onChange: (days: number[]) => void; error?: string }) {
  const toggle = (day: number) => onChange(WEEKDAYS.filter(item => item.day === day ? !value.includes(day) : value.includes(item.day)).map(item => item.day));
  return <fieldset className="work-weekdays" aria-describedby={`weekdays-purpose${error ? " weekdays-error" : ""}`}>
    <legend>每周工作日</legend>
    <div className="weekday-presets">
      <button type="button" onClick={() => onChange([...DEFAULT_WORK_WEEKDAYS])}>双休</button>
      <button type="button" onClick={() => onChange([1, 2, 3, 4, 5, 6])}>单休</button>
    </div>
    <div className="weekday-options">
      {WEEKDAYS.map(({ day, label }) => <button key={day} type="button" aria-pressed={value.includes(day)} aria-label={label} onClick={() => toggle(day)}><span aria-hidden="true">{value.includes(day) ? "✓" : ""}</span>{label}</button>)}
    </div>
    <p id="weekdays-purpose">每周决定上班日期，每月天数用于计算日薪。</p>
    {error && <span className="error" id="weekdays-error" role="alert">{error}</span>}
  </fieldset>;
}
