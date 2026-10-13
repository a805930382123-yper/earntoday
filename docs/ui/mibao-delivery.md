# 咪宝完整主题交付

## 使用

打开设置 → 皮肤主题 → 咪宝 → 使用此主题。可随时切回蓝色大肥鱼。原默认主题和用户选择保留，咪宝没有被设为强制默认。

## 文件与接入

- `src/assets/mibao/working.png`、`lunch.png`、`finished.png`、`settings.png`：四套独立高清透明角色。
- `src/assets/mibao/paw.svg`：单独的低对比猫爪装饰图标，仅用于装饰。
- `src/themes/mibao.ts`：正式 ID `mibao`、名称、简介、四状态映射、奶油/焦糖/绿色变量和猫爪配置。
- `src/themes/catalog.ts`：在现有注册表中新增咪宝，支持可选状态文案、独立装饰预加载；默认蓝主题不变。
- `src/components/Widget.tsx`：读取可选主题状态文案、装饰，午休显示「午休中」；沙漏描边随主题配色。
- `src/components/ThemePicker.tsx`、`src/themes.css`：两张正式主题卡片并排，四状态预览沿用现有机制；压缩留白使 400×600 窗口内应用按钮完整可见。
- `src/styles.css`、`src/widget.css`：少量阴影、焦点、描边与透明遮罩变量，蓝主题仍使用原值；猫爪底边不使用女孩的渐隐遮罩。
- `tools/verify-mibao.cjs`、`tools/verify-mibao-desktop.cjs`：新增完整主题 UI/正式 EXE 验收；更新原主题测试的正式列表数量为 2。
- `README.md`、本文件、`mibao-design.md`、`mibao-image-prompts.md`：使用、设计、素材及验证记录。

沿用原 ThemeProvider、主题事件与 Rust save_theme，本次未修改工资计算、工作状态判定、午休规则、Rust 持久化或托盘代码。工资计算文件 SHA256 与既有主题系统基线一致。

主窗口仍为 260×276，卡片仍为 x10/y97/240×140；设置窗口仍为 400×600，角色容器仍为 190×140。没有复制咪宝业务页面，也没有新增依赖。

## 素材来源和处理

参考资料位于 `docs/mibao/`，包括真实狸花猫照片及四张 UI 稿。使用内置 imagegen 以照片和上班稿制作 working，再以 working、照片和对应状态稿约束另三张图，保持棕色狸花纹、白胸/白爪、黄绿色眼睛、粉鼻子和环纹尾巴。

生成图直接拷贝为生产 PNG，保留原始生成文件；未把整张 UI 稿当背景，未以 SVG 替代角色。金额、状态、时间、进度、输入和按钮均由 React/CSS 实际渲染。四图 ARGB 透明通道和透明边角已检查，角色边缘在实际窗口截图中无明显白底残留，耳朵、尾巴、前爪和计算器完整。

完整生成提示词见 [mibao-image-prompts.md](mibao-image-prompts.md)，布局取舍见 [mibao-design.md](mibao-design.md)。

## 已执行验证

- `npm test`：31 项工资计算/校验/状态边界测试通过。
- TypeScript 检查及 Vite 生产构建通过。
- `verify-mibao.cjs`：100%/125%/150%/200% DPI 下，三状态真实主题选择、预览与应用、双向切换、工资/进度/几何不变、午休暂停、下班定格、设置草稿保留、配置字段独立保存、恢复咪宝、六输入与完整按钮均通过。
- `verify-themes.cjs`：默认与内部测试主题、坏资源/无效 ID 回退、模拟磁盘失败、草稿保护、监听清理通过；内部主题不显示在正式列表。
- `verify-widget.cjs`、`verify-settings.cjs`：蓝主题原布局、工作边界、设置往返、保存/校验/预览、减少动态效果回归通过。
- `npm run build:exe`：Tauri release 与根目录 EarnToday.exe 成功重建，四张咪宝 PNG 已嵌入；主程序 19,805,696 字节，启动器 11,264 字节。
- 关闭 Vite，并确认 5178 无监听后，`verify-mibao-desktop.cjs` 在真正打包 EXE 的 `http://tauri.localhost/` WebView 中通过两正式主题、四姿态加载、真实主题按钮/保存、三状态双向切换、工资与布局保留、设置完整性及进程重启恢复咪宝。结束恢复用户原主题，工资和保存位置保持原值。仅控制测试 WebView 时间，不改电脑时间。

## 实际 EXE 截图

以下为运行打包程序的 WebView 截图，按测试时钟展示对应状态；使用已有真实工资设置，并非参考设计稿。

- [上班](mibao-working-desktop.png)
- [午休](mibao-lunch-desktop.png)
- [下班](mibao-after-desktop.png)
- [设置窗口](mibao-settings-desktop.png)
- [主题列表](mibao-picker-desktop.png)

## 当前视觉限制

四种正式素材均已接入，没有占位或待补素材。动画采用已有轻微呼吸、午休 Zzz 和下班提示入场，尊重减少动态效果。角色没有尾巴/眼睛分层，首版没有摆尾、眨眼或伸爪动画；未扭曲整张猫图模拟这些动作。
