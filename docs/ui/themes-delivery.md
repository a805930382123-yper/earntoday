# 皮肤主题系统 V1.0

## 修改清单

新增 `src/themes/catalog.ts`、`src/themes/ThemeProvider.tsx`、`src/components/ThemePicker.tsx`、`src/themes.css`、`tools/verify-themes.cjs`、设计/交付记录及实际验收截图。

修改 `src/App.tsx`、`src/main.tsx`、`src/components/ChibiGirl.tsx`、`src/components/Widget.tsx`、`src/components/Settings.tsx`、`src/widget.css`、`src/styles.css`、`src-tauri/src/config.rs`、`src-tauri/src/lib.rs`、`tools/verify-widget.cjs`、`tools/verify-desktop.cjs`、`vite.config.ts`、README。新增主题配置序列化测试置于config.rs。

未修改工资算法 `src/salary/calc.ts`，工资校验、午休/下班规则共用原实现。没有添加前端框架、路由库或依赖。窗口仍主窗260×276/设置400×600。

## 主题结构与素材

SkinTheme包含id/name/description/cover、四种characters、CSS变量colors、decorations、characterFilter和内部测试标记internal。公开列表只列正式主题。

默认主题：`blue-whale-girl` / 蓝色大肥鱼 / 温柔、慵懒、治愈的蓝色鲸鱼少女。

| 状态 | 原有素材 |
| --- | --- |
| working | src/assets/chibi-girl-top.png |
| lunch | src/assets/chibi-girl-sleeping.png |
| finished | src/assets/chibi-girl-after-work.png |
| settings | src/assets/chibi-girl-calculator.png |

封面复用working素材，上班前/周末继续用working图。图片没有复制/重新生成，Vite导入保证正式包内嵌图片地址有效。原分层盒子、呼吸、睡眠Zzz和下班提示动画保留。主题变化在人物容器上增加250ms轻淡入，金额和工作状态组件不会因此重新挂载；兼容减少动态效果。

颜色抽取范围包括主/辅助/文字、卡片和设置背景/边框/阴影、金额/进度/主按钮、标签和装饰。默认值与原CSS一致，几何参数不随主题变化。开发测试主题采用紫色/暖粉、四张不同资源URL及现有图片色相变化、提示条星形装饰，检验完整视觉绑定，未制作第二套正式角色。

## 入口、导航与同步

设置卡片左上角小调色盘入口，显示皮肤主题、当前名称和箭头，利用原顶部留白，不挤压原190×140人物或表单。工资设置组件保持挂载，内部page状态切换子页，所以返回保留未提交输入。

主题选择页面提供封面卡片、名称/描述/当前使用、上班/午休/下班真实角色缩略图，以及设置角色示意。点击卡片只改变预览；点击使用此主题才调用独立保存。当前主题按钮禁用，保存失败提供错误提示。

ThemeProvider在App上层统一管理主题，在主界面/设置页间共享。Rust save_theme仅修改selectedThemeId并广播theme-updated，不改工资、不调用窗口调整和页面导航。监听器正确清理，可复用广播支持未来多WebView；当前实际只有一个WebView。

## 持久化与回退

与工资和位置同存于Rust现有config.json，独立字段selectedThemeId。保存工资保留主题；保存主题保留工资和位置，成功写盘后才提交主题到Rust内存。

老配置没有主题字段默认沿用蓝色大肥鱼；新增可选字段容忍null/数字/对象，避免异常主题破坏有效工资数据。主题ID不存在、必要配置缺失或启动资源加载失败回退默认；已展示图片加载异常也回退。应用前预加载封面及四角色，防止新主题只加载一部分。预览或应用失败会提示，控件仍可用。

## 已执行验证

- `npm test`：31项工资、午休、状态和校验测试通过。
- `npm exec tsc -- --noEmit`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`：4项主题配置测试通过，覆盖旧配置、异常字段、工资/主题/位置独立序列化、ID验证。
- `node tools/verify-widget.cjs <Playwright模块目录> 2`：默认主题原卡片/人物/金额几何、工作/午休/下班边界和收入、设置往返、跨日/周末、按钮、减少动态效果通过。
- `node tools/verify-settings.cjs <Playwright模块目录>`：六字段、预览、校验、保存、100/125/150/200% DPI、原400×600表单布局通过。
- `node tools/verify-themes.cjs <Playwright模块目录>`：四状态资源、工作/午休/下班视觉切换金额不变、预览/应用分离、保存失败、草稿保留、独立保存、加载恢复/未知ID/缺图/配置缺失回退、监听器清理、公开列表排除测试主题通过。

`npm run build:exe` 成功，已更新根目录EarnToday.exe及src-tauri/target/release/earn-today.exe。

`node tools/verify-desktop.cjs <Playwright模块目录>` 通过：离线加载生产前端；真实Rust主题写盘及完整进程重启恢复；主题保存前后原生窗口位置和尺寸不变，Widget没有重建；主题页只有一个正式主题、三状态预览完整且400×600无滚动；进入/返回保留工资草稿；主题保存与工资保存互不覆盖；原工资和位置在验收前后相同；五次设置往返稳定；原生工作/午休/下班素材可用，置顶及隐藏功能正常。

正式JS包检查确认不包含内部测试主题文案及测试资源URL。测试主题由Vite DEV分支启用，正式列表和生产资源都不包含该测试配置。

修复收尾发现的开发预览问题：Vite忽略C#启动器编译期间的CSC*.TMP锁定文件，避免开发服务与EXE构建同时运行时触发EBUSY。仅修改开发服务器watch规则，不影响已构建的正式前端。

视觉审查未发现人物裁切、金额移动、表单挤压或按钮遮挡。拖动和托盘代码保留原实现，本次自动化检查置顶/隐藏，未逐项操作系统托盘菜单或原生拖动。除此没有未解决的问题或素材缺口。

## 截图

原生正式EXE：`themes-picker-desktop.png`、`themes-settings-desktop.png`、`widget-working-desktop.png`等。测试只调整测试子进程的WebView时钟，不改Windows时间。

开发真实React换肤对比：`themes-blue-working.png`与`themes-test-working.png`；另有`themes-test-lunch.png`、`themes-test-after.png`、`themes-test-settings.png`。图片来自真实运行页面，不是设计稿；紫色仅为内部验证。

## 新增正式皮肤

准备四角色和封面，用SkinTheme配置资源、颜色/装饰，注册到catalog的themes（不标internal）即可进入公开列表；不需要复制工资组件或计算代码。后端保存任意合法格式的内部ID，前端注册表负责存在性验证。
