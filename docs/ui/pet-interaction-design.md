# V1.2 桌宠轻互动设计与素材检查

施工前已核对六张 `docs/react/*_react.png`。均为 1254×1254 RGBA，透明通道范围 0–255；蓝色三状态有效区（alpha>20）分别为 working (23,152,1245,1096)、lunch (19,291,1251,1028)、finished (13,229,1241,1070)；咪宝分别为 (63,130,1206,1149)、(64,323,1250,1003)、(53,84,1235,1158)。现有基础图约为 2.2:1，反应图不能直接 object-fit 到同一盒子。

配色继续使用现有主题：雪白 #F7FBFF、浅蓝 #E8F3FF、蓝描边 #A9D8FF、深蓝 #163D82；咪宝采用奶油 #FFF9EE、暖米 #ECD1AB、焦糖 #56351F。气泡继承主题，不新增第三套配色。

字体沿用 Segoe UI / Microsoft YaHei UI，完整气泡逻辑字号约 9px，迷你约 8–9px；固定短句，至多两行，不含收入数字。动效只作用于角色图层：工作轻抬、午休轻晃、下班轻缩放。咪宝反馈略活泼，蓝色女孩较轻柔。

布局保持完整 260×276、迷你 260×108。完整气泡放在顶部留白，迷你气泡暂时代替状态行文案，隐私锁提示保留。角色反应图按姿态配置宽度、水平偏移、底部偏移，对齐头部和手爪；不修改基础图定位。

```
完整： [短气泡]              迷你： [角色] [原有按钮]
            角色反应                     原有金额 / 遮盖
       原有工资卡片                      [短句] [隐私锁]
```

方案复核：记忆点来自正式状态反应图与两套角色性格，不改主卡片、不加互动面板或业务奖励。临时互动以主题+工作状态+窗口模式为作用域；状态变化立即失效，计时器不能恢复旧图。约 1/1.2 秒自动恢复，1.5 秒冷却，无队列、无持久化。反应素材预解码后才展示，缺图或失败时保留基础图并给出轻动画/气泡。

点击区域与现有 data-tauri-drag-region 分离；鼠标按住后移动超过 5 个逻辑像素才调用现有 Tauri startDragging，拖动不触发互动。按钮区与角色点击区不重叠。支持键盘 Enter/Space 和可见焦点，减少动态效果时关闭角色位移与气泡动效。

## 最终素材与映射

通过 `SkinTheme.reactions` 可选映射，工作状态 working/lunch/after 对应 working/lunch/finished。各项包含 src、完整/迷你短句、持续时间、轻柔/活泼动效以及透明边距适配参数。缺少某项则该状态不启用互动；图片加载或解码失败仅降级该次图片，保留基础图、气泡与轻动画，不影响主题。

| 主题 | 状态 | 实际打包资源 |
| --- | --- | --- |
| 蓝色大肥鱼 | 工作 | `src/assets/reactions/blue-whale-girl/bluewhale_working_react.png` |
| 蓝色大肥鱼 | 午休 | `src/assets/reactions/blue-whale-girl/bluewhale_lunch_react.png` |
| 蓝色大肥鱼 | 下班 | `src/assets/reactions/blue-whale-girl/bluewhale_finished_react.png` |
| 咪宝 | 工作 | `src/assets/mibao/reactions/mibao_working_react.png` |
| 咪宝 | 午休 | `src/assets/mibao/reactions/mibao_lunch_react.png` |
| 咪宝 | 下班 | `src/assets/mibao/reactions/mibao_finished_react-prone.png` |

五张素材从 `docs/react` 原样复制。咪宝下班原图偏竖直，存在切换后突然坐起的观感；使用 imagegen 将该图与现有 `src/assets/mibao/finished.png` 作为参考，生成 1859×846 RGBA 透明趴姿版本，保留抬爪、笑脸与原角色花纹，使用基础图相同宽高比和定位。原始文件仍在 `docs/react/mibao_finished_react.png` 以及未引用的 `src/assets/mibao/reactions/mibao_finished_react.png`，没有覆盖用户提供的图片。全套图均未拉伸或用几何图替代。

完整模式保持 260×276，迷你保持 260×108，没有修改窗口配置。按有效透明区分别对齐头部、手爪与卡片接触位置；完整午休反应上移以避开设置按钮，迷你工作图略缩小避免呆毛裁切。迷你仅保留角色近景，与原有迷你裁切构图一致；脸、手爪、气泡与金额均可见，长发/尾部边缘按近景框裁切。

## 实现文件

- `src/interaction/types.ts`：类型与姿态配置。
- `src/interaction/usePetInteraction.ts`：独立图片预解码、瞬时反应、单调时钟冷却、作用域与计时器清理。
- `src/components/InteractivePet.tsx`：角色点击区域、5px 拖动门槛、键盘操作、固定气泡。
- `src/components/ChibiGirl.tsx`：现有角色图层接入可选反应图；失败保留当前基础图。
- `src/components/Widget.tsx`、`MiniWidget.tsx`：同一互动控制器用于两种模式，主卡片/金额不移动。
- `src/themes/catalog.ts`、`mibao.ts`：两套主题的三状态映射与素材锚点。
- `src/interaction.css`、`src/main.tsx`：轻动画、气泡、焦点与减少动态效果支持。
- `README.md`：使用说明。
- `tools/verify-interaction.cjs`、`verify-themes.cjs`：浏览器验收与模拟原生拖动桥接。
- `tools/pet-desktop-checks.cjs`、`verify-pet-pointer.ps1`、`verify-display-desktop.cjs`：打包应用验收；真实鼠标输入仅在此工作区 exe 前台且坐标位于窗口内时执行，随后恢复鼠标位置。

工作状态、主题、窗口模式、配置读取状态任一变化都会使旧反应同步失效，并清理计时器。恢复时只移除反应层，由实时业务状态选择基础图，不保存或恢复旧姿态。冷却使用 performance.now()，避免系统时间改变引起等待异常。未配置工资、上班前、周末和设置页面不启用互动。没有新增持久化字段、工资公式、数据源或 Rust 业务变更。

## 已完成的检查

- `npm exec tsc -- --noEmit`：通过。
- `npm test`：31 项工资/午休/时间边界测试通过。`src/salary/calc.ts` SHA256 保持 `4505A9A232FA9BDF47C9AEDF0CAADCADA18A666A18EC0F066841DF469A375E90`。
- `node tools/verify-interaction.cjs <Playwright模块目录>`：两主题 × 三状态 × 两窗口模式 × 显示/隐私 × 100/125/150/200% DPI 全通过；检查素材解码、自动恢复、冷却与无排队、气泡不盖收入、隐私无泄漏、工资/卡片稳定、模拟原生拖动调用、键盘/取消/减少动态效果、状态/主题/模式/设置卸载优先级、周末/未上班禁用、缺图降级及监听清理。
- `verify-display.cjs`、`verify-themes.cjs`、`verify-widget.cjs`、`verify-settings.cjs`：现有模式/隐私/主题/工资/午休/下班/设置全部回归通过，主卡片尺寸及设置 400×600 保持原样。
- 浏览器实际渲染截图：`docs/ui/interaction-{blue-whale-girl|mibao}-{full|mini}-{working|lunch|after}-browser.png`。已逐一查看，两个角色均在原有卡片/近景布局中回应，无不透明背景、拉伸或金额遮挡。

## Windows 最终验收

2026-10-13 已完成 `npm run build:exe`，TypeScript、Vite 与 Tauri release 构建均成功，更新根目录 `EarnToday.exe` 及 `src-tauri/target/release/earn-today.exe`。实际应用验收前关闭 Vite，确认使用内嵌页面与资源，不依赖开发服务器。

`node tools/verify-display-desktop.cjs <Playwright模块目录>` 最终通过：两主题 × 三状态 × 完整/迷你 × 显示/隐私的 24 组真实 WebView 反应图均解码显示并恢复；金额和几何保持稳定；完整与迷你均使用真实 Windows 鼠标点击（含 2px 抖动）和按住拖动，确认点击不移窗、拖动不产生互动、实际窗口移动且位置持久化。另验证原生窗口尺寸、全窗口锚点恢复、工作区约束、置顶、托盘隐藏/恢复、主题与设置返回、工资配置兼容、进程重启恢复迷你+隐藏+咪宝，以及启动过程零未遮盖金额帧。

测试只控制 WebView 时间，没有修改系统时钟或工资设置；主题、模式、隐私与位置临时切换后已由 finally 恢复原配置。早期测试曾因前台窗口保护中止，以及接管已运行的计时器导致不稳定；最终使用独立调试端口、在统一测试时钟下重载页面，并在鼠标操作前聚焦与确认当前工作区 exe。这些诊断改动仅在测试工具中，应用没有新增焦点权限或测试接口。

最终实际截图为 `docs/ui/interaction-{blue-whale-girl|mibao}-{full|mini}-{working|lunch|after}[-private]-desktop.png`，已查看完整/午休/咪宝下班和隐私迷你代表图。未发现待修复的功能或素材加载问题。100/125/150/200% 缩放覆盖来自浏览器渲染测试；真实输入与原生窗口验收使用本机当前显示设置，没有逐一切换 Windows 系统缩放或验证所有多显示器组合。迷你模式按既有近景裁切长发和尾部；六种反应均为静态插画配合轻动画，没有眼睛分层或新增眨眼系统。
