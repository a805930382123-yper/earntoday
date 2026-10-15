# 工作中隐私表现：设计与验收

## 设计计划

保留现有办公陪伴卡片，只让工作中的角色表达“收入去哪里了？”的轻微疑惑。正常与迷你模式使用同一张角色透明素材，避免人物身份漂移。全部四张参考图已读取，整张设计图不进入 UI。

色彩沿用主题：瓷白 #f7fbff、浅蓝 #a9d8ff、问号蓝 #4b93f1、奶白 #fff9ee、暖橙 #eaa148、棕色描边 #a56b35。字体、金额字号、按钮、卡片尺寸完全保留。

布局（原有对齐不变）：

```text
正常：    原角色趴姿   ?
         [原工资卡片 / 遮盖金额 / 状态与时间]
迷你：   [原角色 ? | 原标题、遮盖金额、工作状态]
```

问号位于头部右上方，避开按钮与标题；迷你问号放在图像裁切框外，人物继续使用原裁切方式。只保留 260ms 进入动画，尊重减少动态效果设置。

计划核对：视觉重点是原角色的表情；不增加星星、猫爪、背景、组件或复杂动画，不照搬参考图的大尺寸卡片。午休、下班以及未上班状态立即解除隐私人物与问号，金额遮盖继续由现有 DisplayProvider 控制。互动优先显示原互动图片，结束后恢复对应状态。

## 素材处理

原工作素材没有疑惑版本。使用内置 imagegen 编辑原透明 PNG，参考正常与迷你图的表情，保留原人物身份、趴姿、头饰、毛色与画风；不提取参考图工资卡片。

素材已保存：

- `src/assets/chibi-girl-working-private.png`：1860×845 RGBA，源图 `src/assets/chibi-girl-top.png`，参考 `bluewhale_working_normal.png` 与 `bluewhale_working_mini.png`。保留原小白猫和人物组合。
- `src/assets/mibao/working-private.png`：1859×846 RGBA，源图 `src/assets/mibao/working.png`，参考 `mibao_working_normal.png` 与 `mibao_working_mini.png`。保留写实插画毛发、虎斑、眼睛颜色、白爪及橙色鱼玩具。

均为内置 imagegen 编辑结果，透明 alpha 范围 0–255；以新文件保存，未覆盖任何原素材。正常、迷你复用同一资源，沿用原固定盒与比例，不拉伸。图片先 decode，加载失败回退原工作图与问号，不重置主题或隐私。图片自身不含问号或工资 UI。

## 代码范围

修改 `ChibiGirl.tsx`（可选疑惑图片与互动优先级）、`InteractivePet.tsx`（仅 working 渲染问号）、`PrivacyQuestion.tsx`（移除午休专用装饰）、`privacy-question.css`（疑惑图显隐，删除午休问号样式）、`themes/catalog.ts` 与 `themes/mibao.ts`（可选资源配置）。更新 README、隐私测试、实际窗口验收脚本及本文档。

主卡片、工资和时间规则、DisplayProvider、本地配置、互动 Hook、设置页、托盘和 Rust 窗口实现没有修改。完整 260×276、迷你 260×108、设置 400×600 不变。

当前 mood 不是 working 时，问号立即卸载、疑惑图不显示，原 sleeping / finished PNG 保持原动画和绘制路径。金额仍由现有 privacyMode 控制。工作中互动开始时暂时解除疑惑图显示，原反应图与气泡优先；结束后恢复当前状态，避免残留工作疑惑图。

## 最终生成提示

内置工具、透明背景开启；输入顺序均为“原角色图、正常参考图、迷你参考图”，未使用 CLI 或 Python 图片编辑。

### 蓝色大肥鱼

```text
Use case: precise-object-edit. Edit target is image 1 ONLY, the existing transparent wide blue-haired chibi maid desktop pet sprite. Images 2 and 3 are expression references only; DO NOT recreate their UI. Create one production transparent PNG sprite, same wide canvas aspect ratio 1235:561 and near-identical full character silhouette placement as image 1, paws bottom edge, head and long hair completely visible, no clipped ahoge. Change ONLY the girl's facial expression: slightly widen the same rounded blue eyes from sleepy half-open to puzzled curious, tiny round partly open mouth, faint blush. Preserve exact same girl identity, original navy-blue long hair and highlights, white lace maid headdress, blue bows, blue-white maid outfit, prone resting pose and both hands, SAME small white sleeping cat beside her from image 1 (do not replace it with a whale), all original illustration quality. All sprite details stay within wide original layout. Clean real alpha transparency around character, no UI, no card, no floor, no shadows on a background, no white matte or checkers, no question mark, no floating Z letters/stars/exclamation/symbols, no text. The question mark is rendered separately in code. Do not redesign the character, do not make it excited or reacting. Output just the standalone edited character sprite.
```

### 咪宝

```text
Use case: precise-object-edit. Edit target image 1, existing Mibao transparent desktop pet sprite, preserve THIS exact brown tabby kitten identity and semi-realistic painted detailed fur (do not adopt reference 3 cartoon style). Images 2 and 3 only guide puzzled expression. Produce standalone character transparent PNG, same very wide canvas aspect 1859:846 and nearly exact positioning/silhouette/scale as image 1: empty left margin approx 16%, left ear at x19%, right high ear x40%, head in left middle, entire prone body to right and raised curled striped tail at far right, front white paws and orange striped toy fish at bottom. Change only facial expression to gently confused and curious: slightly rounder yellow-green eyes, softly tilted head (same original mild tilt), a tiny slightly parted questioning mouth instead of the large delighted smiling mouth. Keep exact fur markings, brown tiger stripes, pink nose, white muzzle/chest/forepaws, original ears, toy fish, prone body and fluffy tail, fine painterly fur quality. Preserve paw contact baseline and all anatomy; no sitting/upstanding posture, no extra paws. Real clean alpha transparent background, no UI, no card, no floor, no text, no question mark, no sparks, no other decoration, no white matte or checkered pixels. Maintain wide composition compatible with original fixed sprite box, no clipped ears/tail/paws, a few pixels safe transparent margin at top. Output ONLY the edited character sprite.
```

## 浏览器验收

2026-10-14：类型检查通过，31 项工资测试通过，工资文件 SHA256 与施工前一致。`verify-privacy-question.cjs` 两主题、两模式、工作/午休/下班/未上班时间边界、100/125/150/200% DPI 全通过；问号避开标题/按钮/金额，原几何保持，隐私切换、互动恢复、主题切换、减少动态效果、设置返回与可选图片失败回退正常。`verify-display.cjs` 和 `verify-interaction.cjs` 现有回归通过。

已查看四张工作隐私截图：疑惑五官清晰、原人物画风和趴姿一致，问号无裁切或控件遮挡，未发现白色背景残留。迷你沿用原人物局部展示，不重新设计卡片。截图位于 `docs/ui/privacy-working-browser/`。

## 构建与 Windows 验收

`npm run build:exe` 已通过 TypeScript、Vite、Tauri release 及启动器构建，更新根目录 `EarnToday.exe` 与 `src-tauri/target/release/earn-today.exe`。

关闭开发服务后，严格运行 `verify-display-desktop.cjs`，截图目录 `docs/ui/privacy-working-desktop/`，未使用跳过鼠标输入选项。两主题 × 两模式 × 三状态均通过：工作中疑惑图和问号正常，午休/下班不渲染问号、原图可见且金额仍遮盖；互动结束正确恢复，实际鼠标点击含 2px 抖动、拖动和位置保存正常，原生尺寸、窗口锚点、置顶、托盘、主题、设置及迷你隐私重启正常。WebView 重载未出现未遮盖金额帧。

实际截图：

- `privacy-question-blue-whale-girl-full-working-desktop.png`
- `privacy-question-blue-whale-girl-mini-working-desktop.png`
- `privacy-question-mibao-full-working-desktop.png`
- `privacy-question-mibao-mini-working-desktop.png`

同目录包含两主题、两模式的 lunch / after 无问号截图，以及互动期间截图，均已查看。测试仅控制 WebView 时间，系统时钟与工资设置未改；临时主题、模式、隐私和位置在结束后恢复原值。没有新增依赖或持久化字段。

没有发现未解决的素材或视觉问题。四档 DPI 使用浏览器验证，Windows 实际输入验证使用本机当前缩放，未更改系统 DPI 或覆盖所有多屏组合。
