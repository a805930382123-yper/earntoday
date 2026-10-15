# V1.3 自定义工作日

## 设计计划

工资设置增加一排周一至周日选择按钮，保持当前字体与主题：雪白 #f7fbff、蓝色 #4a9dff、浅蓝 #a9d8ff、奶白 #fff9ee、嫩绿 #9cc45b、焦糖 #805a36。12px 标签、11px 星期文字，选中同时带勾选符号和 aria-pressed，支持键盘焦点。

```text
原计算器角色 / 标题
[月薪]            [每月工作天数]
每周工作日                 双休 单休
[周一][周二][周三][周四][周五][周六][周日]
每周判断哪天上班；每月天数用于日薪
[上班]            [下班]
[午休开始]        [午休结束]
原工资预览 / 保存
```

原 400×600 设置窗口优先减少留白容纳新内容，保留完整人物和所有字段。休息日沿用原主卡片和迷你布局，显示睡觉角色、零收入和主题休息文案，隐藏进度/时长/倒计时。

计划核对：不增加日历、排班页、模板管理或新角色；每周选择与每月天数独立。扩展现有设置保存、每秒时钟及非工作日判断，不建立第二套计时或业务状态。

## 实现与文件

- 新增 `src/components/WorkWeekdays.tsx`：七天独立选择、双休/单休快捷按钮、勾选提示和键盘操作。
- 修改 `src/components/Settings.tsx`：加入星期草稿，读取旧值/异常值时回退默认值，沿用原保存和取消流程。
- 修改 `src/salary/calc.ts`：设置增加 `workWeekdays`，扩展原非工作日状态为 `rest_day`，星期判断优先于当天时间；日薪和时薪公式保持原样。
- 修改 `src-tauri/src/config.rs`：默认字段、读盘恢复和保存严格校验；旧工资、位置、主题和显示偏好保持独立。
- 修改 `src/components/Widget.tsx`、`src/components/MiniWidget.tsx`、`src/themes/mibao.ts`、`src/widget.css`：休息日原睡觉图片、主题文案、隐藏进度/时长/倒计时；无下班庆祝。
- 修改 `src/styles.css`：共用主题色工作日按钮、可见焦点；仅工资设置页压缩留白。角色展示 170×116，原设置窗口仍 400×600，正常表单无滚动，完整字段及保存按钮可见；校验错误增高时使用原滚动容器。
- 修改 `src/salary/calc.test.ts`，更新 `tools/verify-settings.cjs`、`tools/verify-widget.cjs`、`tools/verify-interaction.cjs`、`tools/verify-display.cjs` 的新字段/状态预期；新增 `tools/verify-work-weekdays.cjs`、`tools/verify-work-weekdays-desktop.cjs`，更新 README。

没有新素材、依赖或独立计时器，没有修改 Tauri 窗口、拖动、置顶、托盘或工资公式。

## 保存与判断

在现有工资配置内保存 `settings.workWeekdays`，例如 `[1,2,3,4,5]`；编号与 `Date.getDay()` 一致，周日为 0。保存到原 `%APPDATA%/earn-today/config.json`，星期不影响 `workdaysPerMonth`，六天工作搭配每月22天合法。表单草稿修改后保存才生效，关闭未保存则丢弃。

新旧用户缺字段时默认周一至周五。读盘中的空值、空集合、越界、非整数、重复或错误类型仅恢复星期字段，保留其他配置；保存请求严格拒绝空集合或非法星期，避免静默用默认值替代用户的空选择。

现有每秒刷新取本地 `new Date()`，先以 `getDay()` 判断是否入选；未入选为 `rest_day`，金额、有效工时、进度和剩余下班时间均为零；否则沿用原上班/午休/下班判断。跨午夜或唤醒时间跳变重新按当前时间计算，增加当天后立即获得原应得收入，取消后立即归零。

业务休息日保持独立，仅视觉 mood 映射到睡觉：正常和迷你使用各自主题原 lunch PNG，迷你使用原 lunch 裁切偏移。蓝色文案“今天休息啦～”、咪宝“今天休息喵～”。休息日不触发点击反应；隐私遮盖继续由原 DisplayProvider 控制，疑惑表情和问号仍只限 working。主题切换、窗口模式或隐私开关不修改星期集合。

## 测试与构建

2026-10-14 完成：

- TypeScript 检查及 Vite 构建通过；`npm run build:exe` 的 Tauri release 和启动器构建通过。
- `npm test`：37 项全部通过，包括127种非空星期组合×七天×五个时间段，确认本地星期优先、休息日始终归零、月薪12000/每月22天的日薪/时薪不随星期数改变；周日单选、全周、即时增删当天、午夜、时间跳变和读取回退均覆盖。
- `cargo test --manifest-path src-tauri/Cargo.toml`：12 项通过，覆盖旧配置默认、星期字段异常恢复、空集合严格拒绝、星期与工资/主题/模式/隐私独立序列化。
- `verify-work-weekdays.cjs`：两主题及100/125/150/200% DPI通过，涵盖双休/单休、空保存拒绝、取消、仅周日、任意组合、每月天数不变、即时切换、正常/迷你及隐私休息日、主题切换、午夜、时间跳变。
- `verify-settings.cjs`：六个原字段、预览、保存载荷、校验、关闭按钮、减少动态效果及四档 DPI通过，原400×600设置窗口完整适配。
- `verify-privacy-question.cjs`、`verify-display.cjs`、`verify-interaction.cjs`：原工作/午休/下班隐私及互动回归通过，疑惑问号不扩展到休息日。
- `verify-work-weekdays-desktop.cjs`：实际发布版 WebView 与 Rust 后端通过。检查真实表单及原生命令拒绝空保存、读回真实磁盘配置、重新打开、只选周日后的工作/午休暂停/下班封顶、当天增删立即重算、两主题/两模式/隐私睡觉状态、无问号/庆祝/进度、午夜和进程重启持久化。工资和原显示偏好在验收后恢复。

## 实际截图与限制

实际截图位于 `docs/ui/work-weekdays-desktop/`，已查看：

- `settings-work-weekdays.png`：原生设置页，演示只选周日且每月天数保持原值。
- `rest-blue-whale-girl-full.png`：蓝色大肥鱼休息日正常模式，零收入、睡觉形象。
- `rest-mibao-mini.png`：咪宝休息日迷你模式，零收入、睡觉形象。
- 同目录包含两主题/两模式隐私截图，`rest-mibao-mini-private-restart.png` 验证进程重启后的休息日隐私状态。

测试仅控制 WebView 时间，未改系统时钟。Windows实机使用当前系统缩放；四档DPI另外在浏览器验证。没有实际执行操作系统休眠，而通过同一时钟的大幅时间跳变验证恢复计算。沿用原限制：不支持跨午夜班次、节假日和调休，不自动统计每月天数。未发现未解决的功能或视觉问题。
