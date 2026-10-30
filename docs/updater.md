# 自动更新与旧版配置保护交付记录

状态（2026-10-30）：**[v0.3.3 已正式发布并设为 Latest](https://github.com/a805930382123-yper/earntoday/releases/tag/v0.3.3)**。[正式晋级与公开下载复核 41036393385](https://github.com/a805930382123-yper/earntoday/actions/runs/41036393385) 成功，五个公开资产与签名候选字节一致。已独立回读应用实际使用的 `/releases/latest/download/latest.json`，返回版本 0.3.3 和正确的 Windows x64 下载地址。构建与单元测试不能代替下文的实际升级记录。

**[下载正式 Windows 安装包](https://github.com/a805930382123-yper/earntoday/releases/download/v0.3.3/EarnToday_0.3.3_x64-setup.exe)**。大小 44,376,364 bytes；SHA-256：`ed4ce12886d5d83cd11154b99c34ac87396f84b97463c52397733032f991dc64`。

## 1. 旧版审计

### 0.3.3 开机陪伴与快捷菜单发布（2026-10-30）

固定源码提交为 `908f184fe46fe14b0feb8c2cb5b250dad08a8815`；Release ID `428867224`，标签 `v0.3.3` 指向同一提交，非草稿、非预发布，已设为 Latest。版本同步到 npm、Cargo、两份锁文件与 Tauri 配置；沿用已有公钥、生产签名 Secrets、应用身份、配置目录与当前用户安装范围。未提交本地安装包、安装目录或界面截图。

| 项目 | 结果 |
| --- | --- |
| 生产签名候选 | [41034678688](https://github.com/a805930382123-yper/earntoday/actions/runs/41034678688) success；46 项前端测试、生产构建、21 项 Rust 测试、签名及可信版本检查、干净 Windows runner 上 v0.2.0 → 0.3.3 覆盖安装与配置保留通过；候选 artifact ID `12968356635`，ZIP SHA-256 `38c7ab657df1f79b9cccced581ba9bece3f2878c20257029a0367794590ec19f` |
| 隔离应用内更新 | [41034700827](https://github.com/a805930382123-yper/earntoday/actions/runs/41034700827) success；0.3.3 → `0.3.4-updater-test.41034700827.1` 真实 UI 下载、安装、自动重启、配置及 checkpoint 保留；十项正常与异常场景通过，正式 Latest 未被测试运行改变 |
| 正式晋级 | [41036393385](https://github.com/a805930382123-yper/earntoday/actions/runs/41036393385) success；复用候选原字节，核对签名、版本、五个附件及公开下载路径，发布为 stable Latest；正式安装包 SHA-256 与候选相同 |

第四阶段用户曾对相同功能源码的本地 0.3.2 未签名包完成安装、实际注销重登两种自启动方式和旧版直接覆盖，均反馈正常；该实测不等同于 v0.3.3 签名包的人工登录验收。发布后已独立确认公开 Latest 元数据版本、平台、下载 URL 与签名字段；**尚未在隔离 Windows 环境从现有正式 v0.3.2 客户端通过公开 Latest 实际安装到 v0.3.3**。现有自动化验证了签名升级机制和正式包的覆盖安装，不能把公开元数据可访问表述为这条人工路径已通过。

### 0.3.2 验收与正式发布（2026-10-28）

发布已由用户确认的自主小动作，眨眼/动耳等待 30～45 秒，哈欠/摆尾等待 1～3 分钟；素材和播放时长沿用确认版本。源码版本、两份锁文件与 Tauri 配置同步为 0.3.2。继续使用现有生产公钥和 GitHub Secrets，应用标识、安装范围及本机配置目录不变；本机未读取生产签名私钥，也未对日常用户配置运行安装器。

固定构建来源为 `49f3ba453259aa9c605cfc632a71ab244c0684e7`。正式 Release ID `426221634`，标签 `v0.3.2`，非草稿、非预发布，已设为 Latest。

| 项目 | 结果 |
| --- | --- |
| 生产签名候选 | [40621818623](https://github.com/a805930382123-yper/earntoday/actions/runs/40621818623) success；46 项前端测试、生产构建、Rust 测试、签名及可信版本验证、真实 v0.2.0 → 0.3.2 覆盖安装与设置保留通过，候选阶段 publish skipped |
| 真实应用内更新 | [40621840109](https://github.com/a805930382123-yper/earntoday/actions/runs/40621840109) success；0.3.2 → `0.3.3-updater-test.40621840109.1` 的真实 UI 下载、安装和自动重启通过，工资、主题、模式、隐私、趣味积累、快捷键及 `autonomousMotionEnabled: false` 保留，checkpoint 可恢复 |
| 异常与兼容 | 上述运行的十项验收全部通过：网络不可用、坏更新源、同版/降级、错签、中断、稍后更新、实际安装重启、备份、损坏配置恢复、旧字段缺失；缺少自主开关时独立补默认 true |
| 正式晋级 | [40625174565](https://github.com/a805930382123-yper/earntoday/actions/runs/40625174565) success；原样发布同一候选，验证五个上传资产、固定公开下载路径与 Latest 更新清单 |
| 候选 artifact | `signed-windows-candidate`，ID `12788435336`，ZIP SHA-256 `cc0cb2fb1b22a2d0af19ac72d88f625a97bca6aa4cfb72a577c02739bd9ba400` |

两条验收路径分别记录：真实 v0.2.0 覆盖到正式候选，以及当前代码 0.3.2 升至隔离递增测试版本；未将其表述为已人工执行正式 v0.3.1 → 0.3.2 应用内升级。隔离测试 Release/标签与 runner 证书清理成功，验收过程未改变正式 Latest；正式晋级由用户后续明确授权执行。公开更新清单和发布元数据已留存在本地忽略目录 `artifacts/release-candidate-0.3.2/`。

### 0.3.1 验收与正式发布（2026-10-23）

本轮将源码版本同步为 0.3.1，完成候选与应用内更新验收后，经用户确认发布为正式 Latest。

候选包含设置页布局调整、Ctrl+Shift+H 全局隐藏/恢复、设置草稿无损恢复及隐藏后的动画暂停。用户已对本地 0.3.0 体验构建确认快捷键和草稿保留正常，详见 [隐藏与恢复交付记录](visibility.md)。

本轮沿用现有 `release.yml` 的 candidate 输出与 `validate-update-e2e.yml` 真实更新验收。签名仍只在 GitHub runner 使用已有 Secrets，应用身份、用户配置路径、安装范围、公钥及既有正式 Release 保持原设计。配置保留比较加入 `shortcutEnabled`，并在验收数据中显式关闭快捷键，防止 false 被误当缺失。

固定来源提交：`32255a0216bc6f16b5d091201c442a64fd499e30`。通过 Git Data API 同步时已核对远端内容树与本地候选提交完全一致，未强制覆盖远端分支。截图和本地 EXE 未加入源码提交。

| 项目 | 本轮结果 |
| --- | --- |
| 正式签名候选 | [39917925083](https://github.com/a805930382123-yper/earntoday/actions/runs/39917925083) success；Windows 签名 NSIS 构建、签名/可信版本验证、真实 v0.2.0 → 0.3.1 覆盖安装与配置保留通过，publish 作业 skipped |
| 真实应用内更新回归 | [39917974516](https://github.com/a805930382123-yper/earntoday/actions/runs/39917974516) success；0.3.1 → `0.3.2-updater-test.39917974516.1` 的下载、安装、自动重启、配置/checkpoint 和既有异常用例通过 |
| 既有隔离覆盖作业 | [39917865327](https://github.com/a805930382123-yper/earntoday/actions/runs/39917865327) success |
| 正式晋级与公开复核 | [39923265665](https://github.com/a805930382123-yper/earntoday/actions/runs/39923265665) success；复用同一候选，无重新构建；五个公开文件与 Latest 元数据逐项核对通过 |
| 测试清理 | 临时测试 Release/标签与 runner 证书清理步骤 success；结果记录 `productionLatestChanged: false` |
| 候选文件 | `EarnToday_0.3.1_x64-setup.exe`，33,146,711 bytes；SHA-256：`90b0ed8d2568ba5f7e81cda968f86d475105b174c173cc729d5ab8bcf18599ad` |
| Artifact | `signed-windows-candidate`，ID `12485738560`；ZIP SHA-256：`b89b2c7a2c0db0bd5986152a1e9d380079c48b32dd7389391f2c3afcf113aed6` |

本地已下载并核对 ZIP 与 GitHub artifact 摘要、安装包与 `.sha256`、`latest.json` 的版本/下载地址及签名字段与 `.sig` 一致。CI 使用既有生产公钥完成签名验证；本地未读取生产私钥或运行安装器。文件保存在 `artifacts/release-candidate-0.3.1/files/`，验收 JSON 在同级 `validation/result.json`，本地核对记录为 `verification.json`。

上述两条真实升级路径分别记录，不将隔离测试版本间升级表述为正式 v0.3.0 → 该候选包的应用内升级。正式 Release ID 为 `421595432`，标签 `v0.3.1`，非草稿、非预发布，已设为 Latest。发布提交为 `25dfe50ddef9e6bb065b80605c3c9b129488fc62`，相对固定构建来源仅增加本文的验收记录；晋级流程核对后原样发布。候选阶段的 `verification.json` 保留当时尚未发布的事实，正式发布证据另存本地 `publication.json`。

### v0.2.0 原分发包审计（历史记录）

用户确认实际分发包为仓库 [v0.2.0 Release](https://github.com/a805930382123-yper/earntoday/releases/tag/v0.2.0)。已下载其 `EarnToday_0.2.0_x64-setup.exe`，未在当前真实用户配置上运行安装器。

- 文件大小：27,160,244 bytes。
- SHA-256：`78386390e755b6eac3e878dc4ab5552fe5ffd7067e9809a2b2816769330c640c`，与发布记录一致。
- 产品资源：`今天又赚了多少` / `0.2.0`；二进制含 `NullsoftInst`，确认是 NSIS 安装器，不是独立应用 EXE。
- 对照发布提交 `1f6c5416e3684f9de4f566c471b4c59001dc73b2` 的配置和存储代码：identifier `com.fishearn.today`，productName `今天又赚了多少`，Rust 主程序 `earn-today.exe`。这些身份保持不变。
- 旧配置只指定 NSIS，未指定自定义 NSIS 模板、钩子或安装范围。原生成模板为 `currentUser` / `RequestExecutionLevel user`；默认位置 `%LOCALAPPDATA%\今天又赚了多少`，已有安装路径从注册表恢复。新版本显式固定相同的 `currentUser`，不改为全机安装。
- 相关键：`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\今天又赚了多少` 和 `HKCU\Software\fishearn\今天又赚了多少`。隔离 Windows runner 已验证原默认安装目录可覆盖，升级后该用户卸载记录只有一个；开始菜单/桌面入口的人工视觉验收仍待完成。
- 旧版 WebView2 使用 `%LOCALAPPDATA%\earn-today\webview-sessions\{pid}-{timestamp}` 并启用 incognito，这是已有实现，本轮不改。
- 设置实际采用 **Rust JSON 文件**，不使用 localStorage / Tauri Store。WebView2 缓存不承载工资设置，无需迁移其数据目录。
- 原工作流在 main/工作流文件推送时可能直接发布。已去掉 push 触发，仅允许人工运行，不会因为推送本次代码而向试用用户发新版。

首次自动更新交付的候选号为 `0.3.0`，当时 package.json、package-lock.json、Cargo.toml、Cargo.lock、tauri.conf.json 同步；该节记录形成时的正式版为 `0.3.1`。

## 2. 用户配置位置与完整字段

沿用 `%APPDATA%\earn-today\config.json`。当前机器解析路径为 `C:\Users\David.chen\AppData\Roaming\earn-today\config.json`，不读取或上传其个人字段内容。

| JSON 键 | 含义 | 缺失时处理 |
| --- | --- | --- |
| settings.monthlySalary | 月薪 | 必需工资字段，异常时保护原文件 |
| settings.workdaysPerMonth | 每月工作天数 | 同上 |
| settings.workWeekdays | 每周自定义工作日，0 周日至 6 周六 | 仅缺失时补周一至周五 |
| settings.workStart / workEnd | 上下班时间 | 必需字段 |
| settings.lunchStart / lunchEnd | 午休起止时间 | 必需字段 |
| selectedThemeId | 蓝色大肥鱼 / 咪宝主题标识 | 原有默认主题 |
| windowMode | full / mini | full |
| privacyMode | visible / hidden | visible；配置损坏时运行时隐藏收入 |
| displayMode | amount / collection | amount；这是 v0.2.0 没有的字段 |
| shortcutEnabled | Ctrl+Shift+H 全局快捷键开关 | true；显式 false 保留 |
| position.x / y | 当前窗口逻辑位置 | 原有居中行为 |
| fullPosition.x / y | 正常模式位置锚点 | 原有位置回退 |
| positionScale | 当前坐标所对应的 DPI 缩放 | 原有缩放回退 |
| fullPositionScale | 正常模式位置对应缩放 | 原有缩放回退 |

`settings` 本身可以在首次设置前为空。`configError` 是运行时诊断，不持久化。主题点击动画、今日工资等按当前时间推导，不是新增存储字段。根对象和工资对象中的未知字段用 serde flatten 保留，包含合法的 `0`、`false`、空数组。已有业务不允许“没有任何工作日”，故 `workWeekdays: []` 属于明确非法值，保留原文并阻止覆盖，不把它当成缺失字段写回默认值。

## 3. 数据保护措施

- 不改 identifier、文件路径、已有字段名、NSIS 产品名和安装范围，不引入存储迁移。
- 读取不会写默认配置；新字段仅在内存中补默认，正常用户保存时渐进落盘。
- 每次写入重新检查磁盘原配置。JSON 损坏、工资结构无效、显示模式非法等情况，即使调用方清除了内存错误，也不能覆盖原文件。
- 首次写入一个版本前保存 `config-backups/before-0.3.0.json`，后续保存滚动保留 `last-good.json`；安装更新前/手动备份生成唯一的 `checkpoint-{timestamp}.json`。
- 备份目录为 `%APPDATA%\earn-today\config-backups`。备份封装包含格式号、备份程序版本、时间、原因和 **磁盘原始 JSON 文本**。不上传备份。备份程序版本不等于原配置来源版本，旧配置没有可靠版本标签。
- 配置与备份均在同目录写临时文件、sync_all，再使用 tempfile 的 Windows 原子替换。写入或备份失败则取消保存/更新，不删除原配置。无法承诺硬盘损坏或断电时绝对无损。
- 更新使用官方插件下载并验签，然后持有设置锁，持久化当前生效配置，创建并回读核对备份，再调用官方安装方法。Windows 安装器启动后应用会退出；插件以 NSIS 的重启参数启动新版。
- 恢复只由用户选择备份并再次点击确认触发。验证备份格式、配置及工资字段；空/损坏备份不能恢复。恢复前另存当前原文（包括损坏文件）。不接受任意文件路径。
- 未保存的设置编辑、首次尚未完成设置、读取异常时禁用“立即更新”。先保存，再安装。
- 本轮保护机制不是磁盘加密。备份与原配置受同一 Windows 用户目录权限保护；请勿将该目录发到公开仓库。

## 4. 更新实现与权限

官方 `tauri-plugin-updater` 在 Rust 注册，通过自定义 `check_update` / `install_update` 命令接入；前端不获得插件的直接 install 权限，从而不能绕过配置备份步骤。现有 core 事件能力足够，不增加 shell/process/任意文件权限。

启动延迟后非阻塞检查一次，无定时轮询。检查超时 30 秒，下载超时 10 分钟。错误仅在设置页提示。发现新版本后显示轻量入口，用户可立即更新或稍后再说；不主动安装。

正式更新源：`https://github.com/a805930382123-yper/earntoday/releases/latest/download/latest.json`。元数据与下载地址都要求 HTTPS。默认只接受更高版本，安装包也禁用降级。开启 `requireSignedVersion`，签名的可信注释必须绑定元数据所宣称的版本，防止把旧签名包配上虚假的高版本号。没有关闭签名/TLS 校验的正式配置。

仓库基础配置公钥留空，明确表示未配置。普通本地构建不会假装具备可用更新器。正式构建通过 `tools/prepare-updater.mjs` 注入真实公钥，并启用 `bundle.createUpdaterArtifacts`。生成的配置文件已忽略，不包含私钥。

官方依据：[Updater 插件](https://v2.tauri.app/plugin/updater/)、[Windows 安装器](https://v2.tauri.app/distribute/windows-installer/)、[CLI 签名版本绑定变更](https://v2.tauri.app/release/@tauri-apps/cli/)。

## 5. 你需要完成的密钥与 GitHub 配置

本项目的密钥与下面三项 GitHub 配置已由用户完成；生产候选构建已验证私钥、密码和公钥相互匹配。以下步骤留作维护记录，**不要重复生成并替换现有密钥**。私钥和密码不粘贴到聊天，也不放进项目目录。

```powershell
# 在项目目录运行 CLI；密钥保存在你控制的仓库外目录
$signingDir = Join-Path $env:USERPROFILE 'EarnTodaySigning'
New-Item -ItemType Directory -Path $signingDir -Force | Out-Null
npm.cmd run tauri -- signer generate -w "$signingDir\updater.key"
```

按提示设置密码，输入时没有字符回显属于正常行为。使用 `npm.cmd` 可避免 PowerShell 拦截 `npm.ps1`，无需更改系统执行策略。安全备份 `updater.key` 和密码（分开保存）及 `updater.key.pub`。丢失旧私钥后，已安装客户端不能简单信任新密钥，需要额外过渡版本；不要每次发布重新生成。

在 [仓库 Actions Secrets/Variables](https://github.com/a805930382123-yper/earntoday/settings/secrets/actions) 配置：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Repository Secret | TAURI_SIGNING_PRIVATE_KEY | updater.key 的完整文件内容 |
| Repository Secret | TAURI_SIGNING_PRIVATE_KEY_PASSWORD | 生成时设置的密码 |
| Repository Variable | TAURI_UPDATER_PUBLIC_KEY | updater.key.pub 的完整内容（是 Tauri 编码后的公钥，不是路径） |

也可以使用已登录的 `gh`，通过管道读取私钥而不打印内容：

```powershell
Get-Content "$signingDir\updater.key" -Raw | gh secret set TAURI_SIGNING_PRIVATE_KEY --repo a805930382123-yper/earntoday
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo a805930382123-yper/earntoday
gh variable set TAURI_UPDATER_PUBLIC_KEY --repo a805930382123-yper/earntoday --body (Get-Content "$signingDir\updater.key.pub" -Raw)
```

GitHub 建议另建 `updater-release` Environment，配置发布审批人/受保护分支。工作流不会把私钥写入 Release 或日志。

## 6. 构建与发布流程

1. 更新三个版本源及 lockfile，补写 `docs/releases/<version>.md`。当前说明为 [0.3.1](releases/0.3.1.md)。
2. GitHub Actions 人工运行 **Windows signed updater release**，默认选择 `candidate`，不会发布 Release。
3. 工作流执行原有测试、签名构建、安装包签名/可信版本验证，生成 `.exe`、`.exe.sig`、`.sha256`、`latest.json`，并在干净 Windows runner 上执行真实 v0.2.0 覆盖测试脚本。只有全部成功才上传候选 artifact。
4. 下载候选包，在干净 VM 完成窗口/托盘/交互验收和下面 A/B/C 测试。不要在真实工作配置上试验卸载/清理。
5. 可先选择 `prerelease` 发布测试包；它不会成为 `/releases/latest`，不会触发正式客户端更新。应用内升级测试需使用专用测试 endpoint 构建，见下节。
6. 人工运行 **Publish validated Windows candidate**，输入签名候选构建和成功的应用内升级验收 run ID；默认 `draft`，选择 `stable` 才发布正式 Latest。该工作流不重新构建，也不读取签名私钥。它要求两次验收成功，核对候选之后没有产品代码变化、验收结果完整、签名绑定版本正确、SHA-256 与元数据一致，再创建草稿并逐个回读核对五个上传文件，最后才允许转正式。已有正式同版 Release 时拒绝覆盖；仅允许恢复源码、说明、五个文件均一致的未发布草稿。`verify` 模式对已发布版本只读复核，不改 Release 或资产。**不要重建已验收的签名包再冒充同一包。**
7. 检查 Release 的 `latest.json` 返回 200、版本正确、`windows-x86_64.url` 指向同一版本安装包、signature 是 `.sig` 内容而不是签名 URL。推送源码不等于更新已经发布。

`prepare-release.mjs` 会以公钥验证真实包的 Minisign payload 签名及可信注释签名，版本不一致/签名错误直接阻止打包元数据。CLI 最低版本固定到支持版本绑定的 2.12.1 范围；发布依赖使用 lockfile。

v0.3.0 首次正式发布使用候选运行 **39718145269** 和应用内验收 **39726725158**。Release ID 为 `420414450`，标签 `v0.3.0`，非草稿、非预发布。五个资产为安装包、`.exe.sig`、`.exe.sha256`、`latest.json` 和 `release-notes.md`；**[公开下载复核 39745637267](https://github.com/a805930382123-yper/earntoday/actions/runs/39745637267) 全部成功**，逐个从公开 URL 下载并核对候选字节，同时核对正式 Latest 元数据。草稿发布时出现过查询 404 和自动 `untagged` 标签，已修正同一条 Release、清理本次临时标签，并在工作流增加显式标签绑定及每个公开下载路径的检查；没有重签或替换安装包。

## 7. 真实升级验收结果与待执行步骤

### A：v0.2.0 覆盖安装

工作流中的 `verify-upgrade.mjs` **仅允许全新 GitHub Windows runner**，发现现有配置或安装立即停止。它安装已核验的原版 NSIS，调用旧版真实保存命令写入非默认工资/工作日/时段/咪宝/迷你/隐藏数据，保存旧配置快照，再安装新版并核对原字段和新增字段默认值，验证新版创建备份及图片加载。测试文件全部为合成数据。

自动化核对默认安装目录、注册表单一卸载记录和窗口/图片加载。人工体验还需确认开始菜单/桌面入口、托盘点击、拖拽置顶/透明窗、两个皮肤各状态、完整/迷你、隐私、午休/下班、趣味积累和桌宠点击互动。机器目前无 Windows Sandbox，未为了这项测试修改当前用户的真实安装或配置。另增只读权限的 `validate-upgrade.yml`，推送配置保护代码时用一次性 CI 密钥进行隔离覆盖测试；不使用生产 Secrets、不上传测试安装包、不创建 Release。[隔离验收运行记录](https://github.com/a805930382123-yper/earntoday/actions/runs/39710729349)。

自动化结果（2026-10-22）：工作流全部成功，实际从 **0.2.0 → 0.3.0** 覆盖安装。测试旧月薪 16789.25、每月 21 天、自定义星期 [0,2,4,6]、非默认上下班与午休时段、咪宝、迷你和隐藏收入。旧配置 8 个顶层字段及嵌套内容逐项匹配，新增 displayMode 默认 amount，单用户卸载记录数为 1，新版备份可用，角色图片全部加载。签名 NSIS 构建及 payload / 可信版本签名验证也通过。此验收使用一次性测试密钥，没有上传安装包或创建 Release。

之后使用用户配置的**正式签名密钥**再次执行了相同的完整覆盖验收，全部通过：[生产签名候选运行 39718145269](https://github.com/a805930382123-yper/earntoday/actions/runs/39718145269)。候选 artifact 为 `signed-windows-candidate`，不等于已经对外发布。私钥仅在 GitHub 构建签名步骤使用，没有从本机读取或输出到聊天。

### B：应用内签名更新

已实现人工可运行的 **Real in-app updater validation**。它在全新 Windows runner 使用已配置的生产密钥签名两个递增版本：低版本 `0.3.0` 和本次运行专属的 `0.3.1-updater-test.<run_id>.<attempt>`，沿用同一应用身份。测试包不面向用户分发。

只有测试构建的生成配置使用高版本预发布的固定 HTTPS 元数据 URL。这允许读取预发布而不把它设成正式 Latest。源码默认生产 endpoint 不变，测试 Release 和标签在结束后自动清理。因 GitHub 下载重定向可能缓存被替换的 asset，真实升级使用的测试元数据发布后保持不变。

测试保存月薪 22123.75、每月 19 天、自定义星期 [1,3,4,6]、07:55–18:35、午休 11:45–12:55、咪宝/迷你/隐藏/趣味积累。通过真实 WebView 的“检查更新”“稍后再说”“立即更新”按钮访问 GitHub 元数据并下载签名安装包，核对下载事件、旧进程正常退出、EXE 版本变化、NSIS 自动重启、新版内嵌前端版本、已保存偏好和安装前 checkpoint。当前窗口坐标允许跟随窗口正常移动，其余偏好逐项核对。测试 endpoint 验证不能冒充正式 `/releases/latest` 的发布访问；正式发布工作流还会单独回读该地址。

C 的可控错误使用 `updater-https-fixture.mjs`：仅测试应用的子进程通过临时代理访问隔离 HTTPS 服务，runner 临时信任本次测试证书；不更改系统代理/DNS、不关闭 TLS 校验、不接触开发者机器的证书。错误签名仍针对本次真实构建的 NSIS 字节调用官方验证器；中断测试要求确认已传输 512 KiB 后提前断开。正常升级前关闭代理并重新启动应用，恢复直接访问真实 GitHub。无需反复篡改 GitHub 元数据，也不会误把缓存内容当作错误用例。

实际结果：**已通过**。[运行 39726725158](https://github.com/a805930382123-yper/earntoday/actions/runs/39726725158) 在 2026-10-22 成功从 0.3.0 升到 `0.3.1-updater-test.39726725158.1`。真实 UI 的稍后/立即更新、GitHub HTTPS 元数据与安装包、下载/准备/安装三阶段事件、正常退出、NSIS 自动重启、新版前端版本、偏好逐项保留和安装前备份均通过。测试 Release/标签已由工作流移除，未修改正式 Latest。结果 JSON 保存在该运行的 `updater-e2e-result` artifact。

后续运行会按仓库当前稳定版本自动生成“patch + 1”的隔离测试版本，测试 ID 带 run/attempt，避免混用不同运行的包；无需固定修改 0.3.0/0.3.1 常量。

### C：异常与拒绝

| 情形 | 实际检查结果 |
| --- | --- |
| 断网 / GitHub 不通 | 已通过：真实原生请求使用无法连接的进程专属代理模拟不可用网络，提示连接失败，配置不变；没有断开整台 runner 的网络 |
| 稍后再说 | 已通过：真实 UI 按钮不下载、不退出，下次手动仍可检查 |
| 下载中断 | 已通过：真实 TLS 下载传输 512 KiB 后断开；未安装，版本和配置不变 |
| 签名错误 | 已通过：测试 HTTPS 元数据篡改真实包签名，官方验证器拒绝，版本和配置不变 |
| 伪造高版本配旧包 | 发布侧签名/可信注释版本不匹配测试已通过；未单列原生安装用例 |
| 同版 / 低版 | 已通过：原生检查返回无更新；升级后访问真实 GitHub 同版元数据也返回无更新 |
| 旧字段格式 / 新字段缺失 | 已通过：真实 v0.2.0 配置和缺少 displayMode/workWeekdays 的首次启动兼容，工资保留，新字段独立补默认 |
| 损坏 JSON / 非法字段 | 已通过：原生损坏 JSON 保留原文且拒绝保存；非法字段的单元测试也通过 |
| 首次启动 / 恢复 | 已通过：真实升级自动重启及新版版本检查；损坏文件需显式恢复有效 checkpoint，原文另存。恢复按钮二次确认由 UI 模拟桥接测试覆盖 |

## 8. 首次向旧用户过渡的方法

**本次 A/B/C 数据保护与升级验收已通过，可按以下方法过渡：** 让旧用户从托盘退出旧应用，先把 `%APPDATA%\earn-today` 复制到自己本机的备份目录；记录非默认设置。下载本页上方最新版正式安装包，使用同一个 Windows 用户直接覆盖原安装，沿用原安装目录，勿先卸载/清理用户数据。启动后核对工资、时段、主题、显示/迷你/隐私及工作日；确认设置页可以检查更新和创建备份。以后通过应用内更新。出现配置问题时先保留原文件，在设置 → 本机配置备份 → 查看备份中选择有效备份，再点击“恢复所选备份”“确认恢复所选设置”；不要删除 config.json。

## 9. 当前验证边界

- 已核验真实 v0.2.0 安装包哈希、NSIS 格式、发布提交的存储路径和配置身份。
- 已通过 40 项原有前端工资/趣味积累测试、1 项新增发布签名校验测试和 18 项原生配置/窗口/保护与恢复测试；生产前端构建通过。
- 400×600 设置窗口的模拟桥接验收通过：启动仅检查一次、稍后不安装、未保存编辑时禁止安装、下载百分比、无更新/网络错误提示、备份二次确认与无效备份禁用。这里模拟了原生更新后端，不是实际升级测试。
- 真实 A 的自动化覆盖部分：**已通过**，见上方实际运行记录。窗口/托盘创建及图片加载由运行验证；托盘点击、双主题各状态、桌面入口等人工体验检查仍待完成。
- 真实 B：**已通过**，包括真实 GitHub 下载、官方安装、自动重启及数据和备份核对，见运行 39726725158。
- C 的原生网络不可达、错误更新源、同版/低版、实际错签安装拒绝、HTTPS 中断、损坏配置、旧字段格式及首次重启：**已通过**，具体测试隔离方式见上表。物理断开整机网络和所有用户硬件环境没有逐一验证，不承诺绝对无损。
- 生产签名公钥、Secrets、正式签名安装包、`.sig`、SHA-256、公开 latest.json：**均已配置/发布/回读验证**。公开安装包及全部资产与验收候选一致，正式标签路径与元数据下载地址一致。密钥配置无需用户再次操作；后续仍需保留私钥与密码的独立安全备份，并按版本号人工运行候选构建、真实升级验收及发布。

新增主要文件：`src-tauri/src/config_storage.rs`、`src-tauri/src/updater.rs`、`src/update/*`、`tools/prepare-updater.mjs`、`tools/prepare-release.mjs`、`tools/native-test-session.mjs`、`tools/verify-upgrade.mjs`、`tools/prepare-update-e2e.mjs`、`tools/verify-update-e2e.mjs`、`tools/updater-https-fixture.mjs`、`tools/promote-candidate.mjs`、覆盖/应用内升级验收及候选发布工作流、发布工具测试及本说明；增量修改持久化、命令注册、设置页、版本源、capabilities 说明和已有发布工作流。
