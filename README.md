# 今天又赚了多少

一款 Windows 桌面陪伴小组件：蓝发女孩或狸花猫「咪宝」趴在工资卡片上，陪你上班并实时显示今天已经赚到的钱。

## 下载与安装（Windows 64 位）

**[下载最新版 Windows 安装包](https://github.com/a805930382123-yper/earntoday/releases/latest)**

在发布页面下载 `EarnToday_版本号_x64-setup.exe`，双击并按提示安装，然后从开始菜单打开「今天又赚了多少」。无需安装 Node.js、Rust 或开发工具，也不需要保留项目文件夹。

安装器会检查 Microsoft Edge WebView2；如果电脑尚未安装该运行环境，需要联网下载。已有 WebView2 的电脑可直接安装，程序启动后无需开发服务器。

GitHub 的「Code → Download ZIP」下载的是源码，适合开发使用。源码中的 `EarnToday.exe` 是本地开发启动器，必须先完成下文的构建步骤才能使用。

## 功能

- 无边框、透明、置顶、可拖动的桌面悬浮窗
- 根据月薪、每月工作天数、上下班与午休时间实时计算今日收入（每秒刷新，基于系统时间重新计算，睡眠/隐藏/重启后依然准确）
- 工作状态判断：上班前 / 努力赚钱中 / 午休充电中 / 今日打工完成 / 今天休息啦
- 工作进度条、已工作时长、距离下班倒计时
- 午休自动切换为独立闭眼趴睡素材；收入、有效工时、进度暂停，距离下班继续倒计时
- 蓝发女孩伴随轻柔呼吸动画；两种姿态柔和淡入淡出，睡眠 Zzz 缓慢明暗变化，尊重系统减少动态效果设置
- 系统托盘：显示小组件 / 设置 / 退出程序；隐藏后驻留托盘
- 设置窗口：参数校验、日薪时薪实时预览，首次使用自动引导
- 皮肤主题：默认「蓝色大肥鱼」与奶油焦糖绿色的「咪宝」，上班/午休/下班/设置四角色预览，主题与工资独立保存，重启恢复上次选择
- 迷你模式：260×108 横向桌宠，保留角色、收入和状态；展开按钮恢复完整卡片，设置返回及重启保持模式
- 隐私隐藏：眼睛按钮一键遮盖收入，两种窗口模式与两套主题均支持；后台继续计薪，恢复显示最新金额，重启保持隐藏
- 桌宠轻互动：点击角色，按工作/午休/下班状态显示短暂反应与气泡；约 1～1.2 秒恢复、1.5 秒冷却。完整/迷你/隐私模式均支持，拖动角色仍可移动窗口，状态切换立即结束互动
- 本地 JSON 持久化：工资设置 + 悬浮窗位置（逻辑坐标，多显示器/HiDPI 下可恢复）

## 开发

```bash
npm install
npm run dev        # 启动前端（纯浏览器调试）
npm run tauri dev  # 启动完整桌面应用
npm test           # 核心工资计算测试（node:test，无需额外依赖）
```

## 源码构建与本地双击启动

日常使用项目根目录下的 `EarnToday.exe`：

1. 双击 `EarnToday.exe` 即可启动；若程序已在托盘运行，会显示并切换到窗口。
2. 该启动器会调用 `src-tauri/target/release/earn-today.exe`，请保留此文件和目录结构。正式版已内置页面与图片，不需要启动开发服务器。
3. 首次构建或修改代码后，执行以下命令，自动构建正式版应用和启动器：

```powershell
npm run build:exe
```

仅重新编译启动器（不更新主程序）时，可运行 `powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-launcher.ps1 -LauncherOnly`。

不要将未启用 `custom-protocol` 的 Cargo 构建产物用于日常启动；这类 EXE 仍会连接 `devUrl`，开发服务器关闭后会出现“无法访问此页面”。本项目默认启用此功能；`npm run build:exe` / `npm run tauri build` 还会先更新前端资源，避免打包旧页面。

## 构建 Windows 安装包

```bash
npm run tauri build
```

产物位于 `src-tauri/target/release/bundle/nsis/`。

仓库的 `.github/workflows/release.yml` 会构建、验证 Windows 安装包并发布到 GitHub Releases。发布新版本前，同步修改 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 的版本号和锁文件，再推送对应的 `v版本号` 标签；也可以从 Actions 页面手动运行发布流程。

环境要求：Node.js ≥ 22.6、Rust（MSVC）、Visual Studio Build Tools（C++ 工作负载）、WebView2。

## 技术栈

Tauri 2 · React 18 · TypeScript · Vite · 原生 CSS

## 开源参考与致谢

本项目未直接复制任何第三方代码；以下项目作为功能与技术模式参考：

- [QimoBar](https://github.com/Picrew/QimoBar)（MIT）— 参考：悬浮窗逻辑坐标位置保存与显示器边界校验思路、托盘菜单组织、JSON 配置持久化模式。
- [salary-timer](https://github.com/xiaou61/salary-timer)（无许可证，未复用代码）— 仅作产品形态参考；其增量计时代价高且与本产品“按系统时间重算”的需求不符。
- [PayDance](https://github.com/MrBaoboer/PayDance)（AGPL-3.0-only，未复用任何代码）— 仅作计算规则与功能设计参考：双工作区段、午休剔除、工作进度。
- [desktop-pet](https://github.com/YijiaDuan/desktop-pet)（MIT，未复用代码）— 仅参考轻量 SVG 角色动画思路。

主界面、设置界面与工资计算模块均为本项目原创实现。

午休视觉施工记录、素材来源与模拟时间验收说明见 `docs/ui/implementation-report.md`。

设置界面「拿计算器托腮思考」方案 A 的修改、素材来源和验收记录见 `docs/ui/settings-a-delivery.md`。

下班完成状态、开心角色与提示条的修改、素材来源和验收记录见 `docs/ui/after-work-delivery.md`。

皮肤主题V1配置、换肤机制、内部测试与验收记录见 `docs/ui/themes-delivery.md`。

咪宝主题：打开设置 → 皮肤主题 → 咪宝 → 使用此主题。新增素材、配色、双向切换及真实 EXE 截图见 `docs/ui/mibao-delivery.md`。

V1.1：完整卡片左上缩小按钮进入迷你模式；迷你卡片右上展开按钮恢复。眼睛按钮隐藏/显示收入，横线按钮仍为隐藏到托盘。窗口位置、隐私启动保护与验收记录见 `docs/ui/mini-privacy-delivery.md`。
