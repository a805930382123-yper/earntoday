# 隐私隐藏疑惑表现：历史记录

> 本页记录此前所有状态显示问号的版本，现已替换。当前实现及验收见 [工作中隐私表现](privacy-working-design.md)：仅工作中隐藏收入时显示疑惑素材与问号，午休、下班恢复原图并继续隐藏金额。

## 施工前检查与设计计划

参考 `docs/privacy-hidden/privacy-hidden-concept.png`，仅采纳角色旁的问号、收入遮盖与轻量提示。正式角色继续使用现有 PNG，完整 260×276、迷你 260×108、设置 400×600 不变。现有图片目录没有疑惑脸部图层或专门素材，按提示词第一优先级采用基础图 + 问号 + 小角度歪头，不绘制 CSS 五官，不生成新人物，不声称真正改过面部表情。

配色：雪白 #F7FBFF、浅蓝 #8BD4FF、回应蓝 #4B93F1、深蓝描边 #245CC5；咪宝沿用奶油 #FFF9EE，并用暖橙 #EAA148 和焦糖描边 #A56B35。问号顶部高光 #FFE3A0，来自咪宝的暖色装饰。其余卡片颜色与字体保持现有 Segoe UI / Microsoft YaHei UI。

问号使用共用 SVG 路径和 CSS 变量，完整显示宽约 24px，迷你约 18px，午休略小。完整锚定角色容器右上角；迷你保留头像原来的裁切框，问号在同一角色容器内独立于裁切层，使用头像与顶部按钮之间的空白。SVG 完全不接收鼠标事件，无额外卡片、文案或业务状态。

```
完整        [原角色] ?       迷你   [头像] ?     [原按钮]
          [原工资卡片]                    原标题
           ¥ ••••••                     ¥ ••••••
       工作状态 + 锁提示                状态 + 锁提示
         原进度与时间
```

方案复核：本轮的记忆点只放在角色附近的一枚问号，沿用已有两个主题的色系和人物身份，不照搬参考图的卡片重排、额外星星或其他版本的角色。倾斜幅度完整不超过 0.65°，迷你更小，变换作用于图片层，不改变点击区域；午休不歪头。进入约 260ms 轻放大/淡入，持续静止，退出约 180ms 淡出，减少动态效果时静态显示。既有互动仍拥有独立作用域，反应期间问号保留，反应结束恢复当前隐私视觉。

## 验收记录

2026-10-14 完成。新增 `src/components/PrivacyQuestion.tsx`、`src/privacy-question.css`；修改 `src/components/InteractivePet.tsx`、`src/components/ChibiGirl.tsx`、`src/display.css`、`src/main.tsx`、`src/themes/catalog.ts`、`src/themes/mibao.ts` 和 `README.md`。新增 `tools/verify-privacy-question.cjs`，扩展 `tools/verify-display-desktop.cjs`、`tools/pet-desktop-checks.cjs`、`tools/verify-pet-pointer.ps1` 支持本轮实际验收及独立截图目录。

共用 SVG 由当前 `privacyMode` 决定显隐，配置 `theme.privacy` 提供主色、高光、描边、歪头角度以及完整/迷你位置和宽度，缺少配置时使用默认装饰。没有新增持久化字段、工资公式、时间判断或第二套互动逻辑。问号持续静止且 `pointer-events:none`、`aria-hidden=true`；关闭隐私时淡出，工作状态改变时维持遮盖和问号。

完整模式问号在人物右上空白，咪宝问号避开耳朵和尾巴。迷你模式只把原来的裁切移至内部 `mini-pet-clip`，角色尺寸与原裁切框不变，问号作为同级装饰跟随角色容器，不被裁切；其入场仅轻放大/淡入，省去向上的位移以留出顶边和标题间距。午休问号缩小为 86%，不歪头、不换成工作图。互动反应优先于歪头，问号保留，结束后由当前业务状态恢复原图和隐私表现；下班没有重新播放庆祝。

### 测试与构建

- `npm exec tsc -- --noEmit`：通过。
- `npm test`：31 项工资与时间边界测试全部通过。工资文件 `src/salary/calc.ts` SHA256 保持 `4505A9A232FA9BDF47C9AEDF0CAADCADA18A666A18EC0F066841DF469A375E90`，本轮没有修改 Rust 业务或窗口配置。
- `node tools/verify-privacy-question.cjs <Playwright模块目录>`：两主题、完整/迷你、工作/午休/下班、100/125/150/200% DPI 全通过；检查问号边界与按钮/标题避让、原图及卡片/金额/角色容器几何保持、DOM/工具提示/无障碍金额不泄漏、互动后恢复、隐藏期间工作状态切换、互动期间切换主题、退出隐私、减少动态效果及设置返回。
- `verify-display.cjs`、`verify-interaction.cjs`、`verify-themes.cjs`、`verify-widget.cjs`：现有遮盖/恢复最新收入、启动零未遮盖帧、保存失败安全回退、工资/午休/下班、主题与原点击/拖动判断全部回归通过。
- `npm run build:exe`：TypeScript、Vite 和 Tauri release 构建成功，更新本地 `EarnToday.exe` 及 `src-tauri/target/release/earn-today.exe`。没有发布 GitHub release 或更新已安装版本。
- 关闭 Vite 后执行 `$env:EARN_TODAY_SCREENSHOT_DIR = 'docs/ui/privacy-question-desktop'; node tools/verify-display-desktop.cjs <Playwright模块目录>`：最终严格模式通过，没有使用 `--skip-physical-pointer`。验证两主题/三状态/两模式的问号及既有反应，隐私状态下的真实 Windows 鼠标点击（含 2px 抖动）、连续拖动、原生位置持久化、模式尺寸与锚点恢复、托盘/置顶/设置/主题兼容及迷你+隐藏+咪宝进程重启；重载仍无未遮盖收入帧。

早期实际测试遇到 Windows 前台焦点保护、旧截图占用和短拖动序列未等到原生移动循环启动；仅调整测试辅助程序的消息队列初始化、连续指针移动及截图输出目录，未改应用焦点权限或窗口拖动逻辑。最终截图与运行均使用实际内嵌资源，不依赖开发服务器。测试只控制 WebView 时间，系统时钟和工资设置没有修改，临时切换的主题/模式/隐私/位置已还原，更新后的本地程序已重新打开。

### 实际截图

位于 `docs/ui/privacy-question-desktop/`：

- `privacy-question-blue-whale-girl-full-working-desktop.png`
- `privacy-question-blue-whale-girl-mini-working-desktop.png`
- `privacy-question-mibao-full-working-desktop.png`
- `privacy-question-mibao-mini-working-desktop.png`

同目录包含两主题午休、下班以及互动期间的实际截图。已查看四种主要界面及午休代表图，问号、五官、遮盖、锁提示和按钮无明显裁切或遮挡。

### 素材与测试限制

本轮采用“原角色 + 问号 + 轻微歪头”，没有新绘面部表情。若要真正改变眼睛和嘴型，仍需蓝色大肥鱼及咪宝与现有比例/趴姿一致的独立疑惑 PNG/WebP 或眼睛、嘴部源图层；午休和下班目前继续复用正式状态素材。没有用参考图人物替换现有角色，也没有用 CSS 五官或整张 UI 图冒充素材。

没有发现尚待修复的功能或布局问题。多档缩放在浏览器渲染中验证，实际 Windows 输入在本机当前缩放下验证，没有逐档调整系统 DPI 或验证所有多显示器组合。
