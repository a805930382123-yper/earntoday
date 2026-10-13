# 下班模块交付记录

## 修改清单

- `src/components/Widget.tsx`：复用现有 after 状态，添加勾选完成标签、100%文字、已下班与提示条。等待配置加载后再展示对应状态，避免启动短暂误显示。
- `src/components/ChibiGirl.tsx`：独立开心素材接入 happy 分支，三种姿态预加载在固定盒子里。
- `src/widget.css`：下班专用金额深蓝、柔金钱袋、完成胶囊与静态高光进度；底部白色猫咪提示条，360ms入场，每个本地日期在应用会话仅一次，支持减少动态效果。
- `src/assets/chibi-girl-after-work.png`：新增透明角色，没有替换原工作/午休/设置素材。
- `src-tauri/src/lib.rs`：只修改主窗口启动/恢复高度240→276，宽260不变。原卡片x10/y97/240×140及人物位置不变；设置页仍400×600。统一尺寸避免切换时跳动。
- `tools/verify-widget.cjs`：扩展下班边界、封顶、冷启动、时间修改、跨日/周末、一次入场及布局检查。
- `tools/verify-settings.cjs`、`tools/verify-desktop.cjs`：同步主窗口尺寸并扩展正式EXE验收。
- `docs/ui/after-work-reference.png`、`after-work-design.md`、本文、验收截图及保护文件哈希记录；README加入本记录链接。

## 状态与计算

直接复用 workState 本地时间的 after 分支。合法配置下达到下班时间时有效进度也恰好100%，两者无需独立触发器。earnedAmount / effectiveWorkedMinutes 已有下班封顶，重启重新从时间计算最终日薪，没有新增计时累加器。周末仍休息；跨日恢复原有before/working规则。设置、计算公式、午休判断和Rust存储代码均未修改，保护文件SHA-256校验通过。托盘代码和原控制按钮保留。

## 人物素材

使用内置 imagegen，参考现有 `chibi-girl-top.png` 锁定蓝发女仆身份，并参考用户下班图的笑容与姿态。输出独立透明PNG，保留生成alpha，无整页截图背景。源图保存于Codex generated_images，复制最终素材入src/assets。角色眼睛闭起微笑、双手搭边、小白猫陪伴；共用原比例盒子object-fit contain，避免拉伸。未修改其他角色图片。

### 最终生成提示词

Use case: identity-preserve. Create a production transparent PNG sprite for an existing tiny Windows anime desktop salary pet. Image 1 is the exact existing character and pose-box reference; image 2 is the after-work mood and visual reference, NOT an output UI. Preserve the identical deep blue long-haired chibi maid, white ruffled lace headband, blue bows, navy/white maid sleeves, blush, polished delicate anime illustration and big head. Change expression to eyes gently CLOSED in smiling arcs, small happy open mouth, relieved and satisfied after work, awake and cheerful rather than asleep. Both small hands resting naturally side by side along the BOTTOM horizontal ledge, with the white cat plush beside her at viewer left. Hair spreads to both sides. Composition: landscape ratio approx 2.2:1 matching image 1's 1235x561 pose; top ahoge fully visible, complete head and two hands, character fills frame; hand contact baseline at bottom. No actual ledge/card/background, only the upper-body character, hair, hands and cat cutout with true clean alpha. No calculator, no words, no UI, no numbers, no z symbols, no extra celebration decorations, no watermarks, no opaque white remnants. Keep character at same scale and center as image 1 so replacing the sprite in a fixed pose-box anchors hands without moving UI.

## 验证

- npm test：现有31项工资/午休/校验测试全部通过。
- TypeScript无错误，Vite正式前端构建通过。
- React浏览器验收：工作→午休→工作→17:59:59→18:00下班；正确最终400元/8h/100%；下班后不再增长；冷启动、修改下班时间、跨日、周末正确。
- 设置往返五次原卡片/人物/金额几何不变；返回不重播提示动画；控件可点击；提示条完整在窗口内；减少动态效果正常。
- 设置页六字段、实时预览、错误校验、保存/关闭、100/125/150/200% DPI回归通过。
- 下班布局在125%及200%模拟DPI通过。

正式构建 `npm run build:exe` 成功，已更新根目录EarnToday.exe与release/earn-today.exe。

实际EXE验收通过：离线加载内嵌前端；用户日薪正确封顶、100%与提示条完整显示；真实Rust关闭/保存后返回五次均恢复260×276；返回不重播入场；置顶属性为true、隐藏命令使窗口不可见；load_data在验收前后完全相同。实际工作/午休/下班截图均已生成。原生拖动与托盘菜单保留原实现，本轮没有通过自动化逐项操作托盘菜单或拖动桌面窗口。

视觉审查：角色未裁切/拉伸，按钮没有被覆盖，主卡片与时间信息均保留，提示条与卡片有间距且完整在透明窗口内；无已知素材缺口。人物沿用原呼吸动画，未添加反复庆祝或声音。

## 截图

浏览器截图：`widget-working.png`、`widget-lunch.png`、`widget-after-work.png`。数值来自可控测试时间和8800/22的真实公式，没有加入产品代码。

原生EXE截图：`widget-working-desktop.png`、`widget-lunch-desktop.png`、`widget-after-work-desktop.png`。只调整测试子进程WebView时间，不改变Windows时间或用户配置。
