# 设置界面方案 A 交付

## 修改文件与范围

- `src/components/Settings.tsx`：顶部换为设置页专用人物 PNG；标题保留；副标题修正为保存后按新设置重新计算。表单字段、计算函数、校验、invoke 保存和关闭逻辑未修改。
- `src/styles.css`：移除设置页探头图遮罩与 64px 留白，新增 190×140 人物展示区域和轻微接触阴影；标题 20px；压缩表单与标题间距。正常内容完整显示，校验错误增多时允许设置区域滚动。
- `src/assets/chibi-girl-calculator.png`：新增 1459×1078 透明 PNG，只由设置页引用。主窗口角色资源不替换。
- `tools/verify-settings.cjs`：真实前端的设置布局、字段、预览、校验、保存与 DPI 模拟验收。
- `tools/verify-desktop.cjs`：补充正式版设置截图、字段/保存可见性和保存现有值后返回检查。

设置窗口保持 **400×600 逻辑像素**，Tauri 窗口代码和配置未修改。主组件和午休状态相关文件、工资计算与存储文件均通过施工前后 SHA-256 校验，校验记录为 `settings-a-baseline-hashes.json`。

## 人物素材

来源：内置 imagegen。参考用户方案 A UI 图的姿态及现有 `chibi-girl-top.png` 的人物身份，生成独立完整上半身图：一手拿浅蓝计算器、一手托腮，保留深蓝长发、半睁蓝眼、蕾丝头饰、蝴蝶结和白猫。只复制生成的透明图，不用程序压扁、裁头或画几何替代人物，也不把整张 UI 参考图设为背景。

绘制质量优先，未强行实现眨眼。人物整体做 3.8 秒、0.6px 幅度的轻微呼吸；手和计算器不单独变形；系统减少动态效果时关闭。

完整生成提示词：

Use case: stylized-concept. Asset type: standalone transparent PNG upper-body character illustration for the settings header of a small Windows desktop app. Reference image 1 is the approved settings UI concept; use only its girl pose and appearance, never reproduce its UI, card, lettering or numbers. Reference image 2 is the existing desktop character sprite; preserve this same girl identity, refined anime linework, navy/blue long hair, half-open round blue eyes, white lace maid headdress, blue ribbon bows, blue-white maid outfit, soft pink blush and chibi big-head small-body proportions. Create the pose in reference 1: seated upper body leaning gently forward, one hand holding a small light-blue calculator with clearly visible keypad facing the viewer, the other hand softly propping her chin while thoughtfully looking down. Calm, languid, cute thoughtful expression. Show the entire headdress and hair tuft, head, shoulders, both arms, both hands and calculator, with long hair draping naturally to the sides. A small white cat plush may rest by her elbow like reference 1, quietly secondary. Elbows rest naturally on an implied invisible desktop at the bottom. Composition: centered compact landscape sprite, approximately 1.35:1 width-to-height; subject fills most of the frame with only a small transparent safety margin. Must remain readable when fitted without distortion in a 190 by 145 pixel header box. Background fully transparent alpha; no white or black backdrop, no checkerboard, no visible table, no UI card, no text, no salary numbers, no floating stars, no paw prints, no paper clutter, no watermark. Clean alpha edges with no white halo. Do not alter the existing working/sleeping sprites.

## 已执行验证

- 31 项工资/午休计算测试通过；TypeScript 检查通过。
- 真实 React 页面通过测试替身提供设置数据：六个字段完整可用，工时/日薪/时薪实时更新，非法输入被校验阻止，保存参数准确，重新打开读取已保存值，关闭按钮无遮挡，减少动态效果生效。
- 在 100%、125%、150%、200% 模拟 DPI 下，400×600 的正常设置页面均无需滚动；人物、关闭按钮、收益预览及保存按钮均完整显示。
- 主组件回归通过：午休暂停/恢复、冷启动、设置变更、反复从设置返回、窗口尺寸和主组件布局均保持原先行为。

前端高清截图：[settings-a-browser.png](settings-a-browser.png)。人物、输入框、按钮及金额均为真实组件；截图中的数值来自测试数据，不是写死到页面的参考数字。

没有待补充的人物素材或已知裁切问题。参考图仅用于设计对照，保存为 `settings-reference-a.png`。

## 正式版与原生验收

`npm run build:exe` 成功，主程序和根目录启动器已更新。关闭 Vite 服务后，直接运行新 EXE：真实设置窗口为 400×600，人物、六个输入和保存按钮完整可见，正常页面无滚动。实际关闭/保存后返回主组件共五次，窗口恢复为 260×240，主组件卡片、人物和金额区域边界不变。保存测试仅重存原有字段值，调用 Rust `load_data` 比较确认存储数据与测试前完全相同。

原生实际运行截图：[settings-a-desktop.png](settings-a-desktop.png)。临时本机 WebView 调试只对测试进程启用，测试结束后关闭，日常启动器不携带调试设置。
