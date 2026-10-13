# 午休睡觉状态交付记录

后续设置返回与布局修正以用户图二为准，见 [settings-return-fix.md](settings-return-fix.md)。该修正已恢复原先的人物/卡片比例，并补充真实打包 EXE 的设置返回验收；下面的初次施工记录保留作参考。

## 修改范围

- `src/components/ChibiGirl.tsx`：工作和睡眠素材常驻同一固定容器，直接使用现有午休 mood；删除原来只在午休短暂调暗的两个定时器。
- `src/components/Widget.tsx`：复用 `workState` 的 lunch 分支，更新文案、咖啡杯、Zzz 与进度无障碍名称；金额不再每次整数变化触发跳动；较大金额缩小字号。
- `src/widget.css`、`src/styles.css`、`src/main.tsx`：主组件样式独立整理，保持 260×240 透明窗口；角色居中、双手接触卡片，按钮避开侧发，设置页结构不变。
- `src/App.tsx`：异步监听若在卸载后才返回，立即解除；清理首次加载重试定时器，避免开发 StrictMode 遗留事件监听。
- `src/salary/calc.ts`：保留原有按系统时间重新计算的算法，只修正秒数换算：秒 / 60，原代码误写为 / 1000。
- `src/salary/calc.test.ts`：补充六个午休时间边界、冷启动、修改时段、秒和毫秒连续性测试。
- `index.html`：使用项目原有图标，修复浏览器验证时的 favicon 404。
- `src/assets/chibi-girl-sleeping.png`：新增透明闭眼睡觉素材，原工作素材保留。
- `tools/verify-widget.cjs`：真实前端模拟时钟验收；Tauri 替身只存在于测试脚本，不进入发布程序。

## 状态与收入衔接

仍由每秒更新的系统时间和用户已保存设置计算状态、收入、有效工时及进度。午休开始含边界，午休结束不含边界。角色随同一个 lunch 状态切换；午休不计收入，不重启或暂停累计计时器，因此午休冷启动及重启仍能得到正确金额。距离下班沿用自然时间倒计时。

## 素材和动画

素材来源、完整提示词、输出路径见 [sleeping-asset.md](sleeping-asset.md)。内置 imagegen 以现有角色图为编辑目标生成透明 PNG；复用已有侧发，不把参考图作为背景。没有未接入素材或占位人物。

两种姿态透明度过渡 300ms；人物以底边为锚点约 4.4–4.8 秒轻微呼吸，最大纵向变化 0.4%，双手位置不平移；午休 Zzz 缓慢改变透明度。减少动态效果时关闭呼吸、Zzz 动画及切换过渡。卡片、金额和窗口尺寸保持固定。

## 已执行验收

- `npm test`：31 项全部通过，覆盖午休开始前一秒、开始时、进行中、结束前一秒、结束时、结束后一秒。
- TypeScript 类型检查通过。
- 本机 Edge 无头浏览器运行真实 React 页面，替换 Tauri 桥接并控制浏览器时钟：午休暂停收入/工时/进度、倒计时更新、午休恢复、午休冷启动、修改午休时段、卡片/金额位置稳定、设置/隐藏按钮实际命中、监听释放、减少动态效果及 260×240 窗口边界均通过。
- 测试不修改电脑系统时间或真实工资配置。工作/午休截图为真实前端在模拟时间下的渲染，不是设计稿。

截图：[工作状态](widget-working.png)、[午休状态](widget-lunch.png)。

复现浏览器验收：先启动 `npm run dev -- --host 127.0.0.1 --port 5178 --strictPort`，再执行 `node tools/verify-widget.cjs <包含 playwright 的 node_modules 目录>`；需要本机 Microsoft Edge。

## 正式版构建与原生验证

`npm run build:exe` 成功，Tauri release 优化构建完成，主程序为 `src-tauri/target/release/earn-today.exe`（8,852,992 字节），根目录启动器 `EarnToday.exe` 已重新生成。工作与睡觉人物 PNG、前端 JS/CSS 均已嵌入 EXE。

关闭 Vite 后，确认 5178 端口关闭，再启动正式版主程序。Windows 无障碍树显示页面地址 `http://tauri.localhost/`，能够读取真实设置对应的收入、工作状态、进度、工时与倒计时，并显示设置/隐藏按钮。正式版离线启动通过。

原生桌面窗口代码与权限未更改，原有置顶、透明、托盘及拖动实现保留。此轮原生截图捕获返回 `FrameArrived timed out`，自动点击返回 `coordinate input geometry is unavailable`，所以没有宣称完成原生拖动/托盘菜单/设置按钮操作的自动验收。按钮实际命中、视图切换及命令调用已在浏览器测试中通过；最终对比截图来自模拟时间下运行的真实前端。
