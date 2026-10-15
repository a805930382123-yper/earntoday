import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  dailySalary,
  dailyWorkMinutes,
  earnedAmount,
  effectiveWorkedMinutes,
  formatDuration,
  hourlySalary,
  minutesUntilOffWork,
  normalizeWorkWeekdays,
  parseMinutes,
  validateSettings,
  workProgress,
  workState,
} from "./calc.ts";

// 2024-10-14 是周一
function at(h: number, m = 0, s = 0): Date {
  return new Date(2024, 9, 14, h, m, s);
}
const settings = { ...DEFAULT_SETTINGS, monthlySalary: 10000 };

describe("parseMinutes", () => {
  test("解析标准 HH:MM", () => {
    assert.equal(parseMinutes("09:00"), 540);
    assert.equal(parseMinutes("18:30"), 1110);
    assert.equal(parseMinutes("00:00"), 0);
    assert.equal(parseMinutes("23:59"), 1439);
  });
  test("拒绝非法格式", () => {
    assert.ok(Number.isNaN(parseMinutes("9:0")));
    assert.ok(Number.isNaN(parseMinutes("24:00")));
    assert.ok(Number.isNaN(parseMinutes("12:60")));
    assert.ok(Number.isNaN(parseMinutes("abc")));
  });
});

describe("工资基础计算", () => {
  test("日薪与每日工时", () => {
    assert.ok(Math.abs(dailySalary(settings) - 454.5454545) < 1e-6);
    assert.equal(dailyWorkMinutes(settings), 480); // 9 小时 - 1 小时午休
  });
  test("时薪", () => {
    assert.ok(Math.abs(hourlySalary(settings) - 56.8181818) < 1e-6);
  });
});

describe("工作状态判断", () => {
  test("按时间段判断", () => {
    assert.equal(workState(at(8, 30), settings), "before");
    assert.equal(workState(at(9, 0), settings), "working");
    assert.equal(workState(at(11, 59, 59), settings), "working");
    assert.equal(workState(at(12, 30), settings), "lunch");
    assert.equal(workState(at(13, 0), settings), "working");
    assert.equal(workState(at(18, 0), settings), "after");
    assert.equal(workState(at(20, 0), settings), "after");
  });
  test("周末判断", () => {
    const sat = new Date(2024, 9, 12, 10, 0, 0); // 周六
    const sun = new Date(2024, 9, 13, 10, 0, 0); // 周日
    assert.equal(workState(sat, settings), "rest_day");
    assert.equal(workState(sun, settings), "rest_day");
  });
});

describe("自定义工作日", () => {
  const sample = { ...DEFAULT_SETTINGS, monthlySalary: 12000, workdaysPerMonth: 22 };
  test("七天所有非空组合都以本地星期优先判断，工资分母始终为22", () => {
    for (let mask = 1; mask < 128; mask++) {
      const workWeekdays = Array.from({ length: 7 }, (_, day) => day).filter(day => mask & (1 << day));
      const s = { ...sample, workWeekdays };
      assert.equal(validateSettings(s), null);
      assert.equal(dailySalary(s), 12000 / 22);
      assert.equal(hourlySalary(s), (12000 / 22) / 8);
      for (let day = 0; day < 7; day++) for (const [hour, minute, expected] of [[8, 0, "before"], [10, 0, "working"], [12, 30, "lunch"], [14, 0, "working"], [20, 0, "after"]] as const) {
        const now = new Date(2024, 9, 13 + day, hour, minute); // Sunday through Saturday
        assert.equal(now.getDay(), day);
        assert.equal(workState(now, s), workWeekdays.includes(day) ? expected : "rest_day");
        if (!workWeekdays.includes(day)) {
          assert.equal(earnedAmount(now, s), 0);
          assert.equal(effectiveWorkedMinutes(now, s), 0);
          assert.equal(workProgress(now, s), 0);
          assert.equal(minutesUntilOffWork(now, s), 0);
        }
      }
    }
  });
  test("仅周日上班和全周上班正常累计，午休暂停、下班封顶", () => {
    for (const workWeekdays of [[0], [0, 1, 2, 3, 4, 5, 6]]) {
      const s = { ...sample, workWeekdays };
      assert.equal(earnedAmount(new Date(2024, 9, 13, 10), s), hourlySalary(s));
      assert.equal(earnedAmount(new Date(2024, 9, 13, 12), s), earnedAmount(new Date(2024, 9, 13, 12, 59), s));
      assert.equal(earnedAmount(new Date(2024, 9, 13, 23), s), dailySalary(s));
    }
  });
  test("增加或移除当天后从实际时间重新计算，不从零累计", () => {
    const saturday = new Date(2024, 9, 19, 14);
    const six = { ...sample, workWeekdays: [1, 2, 3, 4, 5, 6] };
    assert.equal(workState(saturday, sample), "rest_day");
    assert.equal(workState(saturday, six), "working");
    assert.equal(earnedAmount(saturday, six), dailySalary(six) / 2);
    assert.equal(earnedAmount(saturday, sample), 0);
  });
  test("午夜、唤醒大幅时间跳变按新本地日期判断", () => {
    assert.equal(workState(new Date(2024, 9, 18, 23, 59, 59), sample), "after");
    assert.equal(workState(new Date(2024, 9, 19, 0), sample), "rest_day");
    assert.equal(workState(new Date(2024, 9, 20, 23, 59), sample), "rest_day");
    assert.equal(workState(new Date(2024, 9, 21, 0), sample), "before");
    assert.equal(workState(new Date(2024, 9, 21, 14), sample), "working");
  });
  test("使用本地 getDay 而非 UTC 星期", () => {
    const localSunday = new Date(2024, 9, 13, 0, 30);
    const s = { ...sample, workStart: "00:00", lunchStart: "04:00", lunchEnd: "05:00", workEnd: "08:00", workWeekdays: [0] };
    assert.equal(workState(localSunday, s), "working");
    assert.ok(earnedAmount(localSunday, s) > 0);
  });
  test("老用户和损坏星期字段读取回退，空集合保存严格拒绝", () => {
    for (const bad of [undefined, null, [], [7], [-1], [1.5], [1, 1], ["1"], "1,2"]) {
      assert.deepEqual(normalizeWorkWeekdays(bad), [1, 2, 3, 4, 5]);
      assert.ok(validateSettings({ ...sample, workWeekdays: bad as number[] })?.workWeekdays);
    }
    assert.deepEqual(normalizeWorkWeekdays([0, 6, 1]), [1, 6, 0]);
  });
});

describe("今日已赚金额", () => {
  test("上班前为 0", () => {
    assert.equal(earnedAmount(at(8, 0), settings), 0);
  });
  test("10:00 已赚约一时薪", () => {
    assert.ok(Math.abs(earnedAmount(at(10, 0), settings) - 56.8181818) < 1e-6);
  });
  test("12:00 已赚 3 小时", () => {
    assert.ok(Math.abs(earnedAmount(at(12, 0), settings) - 170.4545454) < 1e-6);
  });
  test("午休期间金额暂停", () => {
    const lunchStart = earnedAmount(at(12, 0), settings);
    const lunchMid = earnedAmount(at(12, 30), settings);
    const lunchEnd = earnedAmount(at(13, 0), settings);
    assert.ok(Math.abs(lunchMid - lunchStart) < 1e-9);
    assert.ok(Math.abs(lunchEnd - lunchStart) < 1e-9);
  });
  test("13:30 已赚 3.5 小时", () => {
    assert.ok(Math.abs(earnedAmount(at(13, 30), settings) - 198.8636363) < 1e-6);
  });
  test("18:00 后固定为日薪", () => {
    const atEnd = earnedAmount(at(18, 0), settings);
    const after = earnedAmount(at(19, 30), settings);
    assert.ok(Math.abs(atEnd - 454.5454545) < 1e-6);
    assert.equal(after, atEnd);
  });
  test("周末不累计", () => {
    const sat = new Date(2024, 9, 12, 10, 0, 0);
    assert.equal(effectiveWorkedMinutes(sat, settings), 0);
    assert.equal(earnedAmount(sat, settings), 0);
  });
  test("每秒平滑增长（不依赖增量累加）", () => {
    const a = earnedAmount(at(10, 0, 0), settings);
    const b = earnedAmount(at(10, 0, 1), settings);
    assert.ok(b > a && b - a < 0.02);
  });
});

describe("进度与倒计时", () => {
  test("进度范围与封顶", () => {
    assert.equal(workProgress(at(9, 0), settings), 0);
    assert.ok(Math.abs(workProgress(at(10, 0), settings) - 0.125) < 1e-9);
    assert.ok(Math.abs(workProgress(at(12, 30), settings) - 0.375) < 1e-9);
    assert.equal(workProgress(at(18, 0), settings), 1);
    assert.equal(workProgress(at(20, 0), settings), 1);
  });
  test("距离下班", () => {
    assert.equal(minutesUntilOffWork(at(8, 0), settings), 600);
    assert.ok(Math.abs(minutesUntilOffWork(at(14, 0), settings) - 240) < 1e-9);
    assert.equal(minutesUntilOffWork(at(19, 0), settings), 0);
  });
  test("时长格式化", () => {
    assert.equal(formatDuration(0), "0m");
    assert.equal(formatDuration(45), "45m");
    assert.equal(formatDuration(200), "3h 20m");
    assert.equal(formatDuration(480), "8h 0m");
  });
});

describe("设置校验", () => {
  test("默认设置合法", () => {
    assert.equal(validateSettings(DEFAULT_SETTINGS), null);
  });
  test("月薪非法", () => {
    const e = validateSettings({ ...DEFAULT_SETTINGS, monthlySalary: 0 });
    assert.ok(e?.monthlySalary);
  });
  test("工作天数非法", () => {
    const e = validateSettings({ ...DEFAULT_SETTINGS, workdaysPerMonth: 0.5 });
    assert.ok(e?.workdaysPerMonth);
    const e2 = validateSettings({ ...DEFAULT_SETTINGS, workdaysPerMonth: 40 });
    assert.ok(e2?.workdaysPerMonth);
  });
  test("时间交叉与午休越界", () => {
    const e = validateSettings({ ...DEFAULT_SETTINGS, workEnd: "08:00" });
    assert.ok(e?.workEnd);
    const e2 = validateSettings({ ...DEFAULT_SETTINGS, lunchStart: "08:00" });
    assert.ok(e2?.lunchStart);
    const e3 = validateSettings({ ...DEFAULT_SETTINGS, lunchEnd: "19:00" });
    assert.ok(e3?.lunchEnd);
  });
  test("午休被限制在上下班之间，保证每日工时大于 0", () => {
    // 只要四个时间校验全部通过，end - start - (lunchEnd - lunchStart) 必然大于 0
    const e = validateSettings({
      ...DEFAULT_SETTINGS,
      workStart: "09:00",
      workEnd: "18:00",
      lunchStart: "10:00",
      lunchEnd: "17:00",
    });
    assert.equal(e, null);
  });
});

describe("午休边界与恢复", () => {
  const sample = { ...DEFAULT_SETTINGS, monthlySalary: 8800, workdaysPerMonth: 22 };
  const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

  for (const [h, m, sec, state, worked] of [
    [11, 59, 59, "working", 180 - 1 / 60],
    [12, 0, 0, "lunch", 180],
    [12, 30, 0, "lunch", 180],
    [12, 59, 59, "lunch", 180],
    [13, 0, 0, "working", 180],
    [13, 0, 1, "working", 180 + 1 / 60],
  ] as const) {
    test(`${h}:${m}:${sec} 状态、有效工时、收入及进度一致`, () => {
      const now = at(h, m, sec);
      assert.equal(workState(now, sample), state);
      close(effectiveWorkedMinutes(now, sample), worked);
      close(earnedAmount(now, sample), worked * 400 / 480);
      close(workProgress(now, sample), worked / 480);
      close(minutesUntilOffWork(now, sample), 18 * 60 - h * 60 - m - sec / 60);
    });
  }

  test("午休冷启动不依赖历史计时，午休不补算收入", () => {
    assert.equal(earnedAmount(at(12, 30), sample), 150);
    assert.equal(earnedAmount(at(13), sample), 150);
    assert.equal(earnedAmount(at(14), sample), 200);
    assert.equal(earnedAmount(at(12, 0), sample), earnedAmount(at(12, 59, 59), sample));
    assert.ok(minutesUntilOffWork(at(12, 59, 59), sample) < minutesUntilOffWork(at(12), sample));
  });

  test("修改午休时段立即按新设置计算", () => {
    const changed = { ...sample, lunchStart: "12:30", lunchEnd: "13:30" };
    assert.equal(workState(at(12, 15), sample), "lunch");
    assert.equal(workState(at(12, 15), changed), "working");
    assert.equal(workState(at(13, 15), changed), "lunch");
    close(earnedAmount(at(13, 15), changed), 175);
    assert.equal(workState(at(13, 30), changed), "working");
  });

  test("秒与毫秒连续计入有效工时", () => {
    const now = at(10, 0, 59);
    now.setMilliseconds(500);
    close(effectiveWorkedMinutes(now, sample), 60 + 59.5 / 60);
    close(earnedAmount(at(10, 0, 1), sample) - earnedAmount(at(10), sample), 400 / (8 * 3600));
  });
});
