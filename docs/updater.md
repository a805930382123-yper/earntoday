# 自动更新与旧版配置保护交付记录

状态（2026-10-22）：用户已在本机生成并保存生产签名密钥，GitHub 两项 Secrets 和公钥变量已配置，生产签名候选包与真实旧版覆盖验收通过。应用内升级及异常验收正在隔离 Windows runner 中进行，正式发布仍以这些验收通过为前提。构建与单元测试不能代替真实升级验收。

## 1. 旧版审计

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

新版本候选号为 `0.3.0`，package.json、package-lock.json、Cargo.toml、Cargo.lock、tauri.conf.json 同步。

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

1. 更新三个版本源及 lockfile，补写 `docs/releases/<version>.md`。当前说明为 0.3.0。
2. GitHub Actions 人工运行 **Windows signed updater release**，默认选择 `candidate`，不会发布 Release。
3. 工作流执行原有测试、签名构建、安装包签名/可信版本验证，生成 `.exe`、`.exe.sig`、`.sha256`、`latest.json`，并在干净 Windows runner 上执行真实 v0.2.0 覆盖测试脚本。只有全部成功才上传候选 artifact。
4. 下载候选包，在干净 VM 完成窗口/托盘/交互验收和下面 A/B/C 测试。不要在真实工作配置上试验卸载/清理。
5. 可先选择 `prerelease` 发布测试包；它不会成为 `/releases/latest`，不会触发正式客户端更新。应用内升级测试需使用专用测试 endpoint 构建，见下节。
6. 人工运行 **Publish validated Windows candidate**，输入签名候选构建和成功的应用内升级验收 run ID；默认 `draft`，选择 `stable` 才发布正式 Latest。该工作流不重新构建，也不读取签名私钥。它要求两次验收成功，核对候选之后没有产品代码变化、验收结果完整、签名绑定版本正确、SHA-256 与元数据一致，再创建草稿并逐个回读核对五个上传文件，最后才允许转正式。已有同版 Release 时拒绝覆盖。**不要重建已验收的签名包再冒充同一包。**
7. 检查 Release 的 `latest.json` 返回 200、版本正确、`windows-x86_64.url` 指向同一版本安装包、signature 是 `.sig` 内容而不是签名 URL。推送源码不等于更新已经发布。

`prepare-release.mjs` 会以公钥验证真实包的 Minisign payload 签名及可信注释签名，版本不一致/签名错误直接阻止打包元数据。CLI 最低版本固定到支持版本绑定的 2.12.1 范围；发布依赖使用 lockfile。

## 7. 真实升级验收结果与待执行步骤

### A：v0.2.0 覆盖安装

工作流中的 `verify-upgrade.mjs` **仅允许全新 GitHub Windows runner**，发现现有配置或安装立即停止。它安装已核验的原版 NSIS，调用旧版真实保存命令写入非默认工资/工作日/时段/咪宝/迷你/隐藏数据，保存旧配置快照，再安装新版并核对原字段和新增字段默认值，验证新版创建备份及图片加载。测试文件全部为合成数据。

人工还需确认：原安装目录、注册表安装记录只有一个、开始菜单/桌面入口没有重复、托盘正常、拖拽置顶/透明窗、两个皮肤、完整/迷你、隐私、午休/下班、趣味积累和桌宠点击互动。机器目前无 Windows Sandbox，未为了这项测试修改当前用户的真实安装或配置。另增只读权限的 `validate-upgrade.yml`，推送配置保护代码时用一次性 CI 密钥进行隔离覆盖测试；不使用生产 Secrets、不上传测试安装包、不创建 Release。[隔离验收运行记录](https://github.com/a805930382123-yper/earntoday/actions/runs/39710729349)。

自动化结果（2026-10-22）：工作流全部成功，实际从 **0.2.0 → 0.3.0** 覆盖安装。测试旧月薪 16789.25、每月 21 天、自定义星期 [0,2,4,6]、非默认上下班与午休时段、咪宝、迷你和隐藏收入。旧配置 8 个顶层字段及嵌套内容逐项匹配，新增 displayMode 默认 amount，单用户卸载记录数为 1，新版备份可用，角色图片全部加载。签名 NSIS 构建及 payload / 可信版本签名验证也通过。此验收使用一次性测试密钥，没有上传安装包或创建 Release。

之后使用用户配置的**正式签名密钥**再次执行了相同的完整覆盖验收，全部通过：[生产签名候选运行 39718145269](https://github.com/a805930382123-yper/earntoday/actions/runs/39718145269)。候选 artifact 为 `signed-windows-candidate`，不等于已经对外发布。私钥仅在 GitHub 构建签名步骤使用，没有从本机读取或输出到聊天。

### B：应用内签名更新

需先有密钥及可访问的 HTTPS 测试 Release。准备两个递增版本，如 `0.3.0-test.1` 和 `0.3.1-test.1`，沿用同一签名密钥与安装身份。

在**测试构建专用**的生成配置中，将 `plugins.updater.endpoints` 改为指向高版本测试 Release 的固定 URL：`https://github.com/a805930382123-yper/earntoday/releases/download/v0.3.1-test.1/latest.json`。这允许读取预发布而不把它设成正式 Latest。不要更改源码默认生产 endpoint；测试 endpoint 构建禁止分发给正式用户。

在干净 VM 安装低测试版，保存明显不同的全部设置；发布高测试版的安装包、签名和元数据。应用内检查、选择立即更新，观察进度、退出与重启，核对 EXE 产品版本、全部字段和备份。再以生产 endpoint 构建正式候选，做覆盖和首次启动验收。测试 endpoint 验证覆盖更新流程，不能冒充已经验证了正式 endpoint 的发布访问。

### C：异常与拒绝

| 情形 | 检查方式与预期 |
| --- | --- |
| 断网 / GitHub 不通 | 检查给出短提示，设置不变，组件继续使用 |
| 稍后再说 | 不下载、不退出，下次手动仍可检查 |
| 下载中断 | VM 中断网络；不启动安装器，重试可重新下载 |
| 签名错误 | 测试 Release 中故意换错 `.sig`，安装拒绝，配置不变 |
| 伪造高版本配旧包 | 可信注释版本与元数据不同，拒绝更新 |
| 同版 / 低版 | 无更新，不降级 |
| 旧字段格式 / 新字段缺失 | 原配置字段逐项不变，仅补新字段默认值 |
| 损坏 JSON / 非法字段 | 原文件保持原文，停止写入，不自动恢复空配置 |
| 首次启动 / 恢复 | 无默认配置抢写；有效备份需用户确认恢复 |

## 8. 首次向旧用户过渡的方法

**仅在 A/B/C 验收通过后使用：** 让旧用户从托盘退出旧应用，先把 `%APPDATA%\earn-today` 复制到自己本机的备份目录；记录非默认设置。下载经核验的正式 `EarnToday_0.3.0_x64-setup.exe`，使用同一个 Windows 用户直接覆盖原安装，沿用原安装目录，勿先卸载/清理用户数据。启动后核对工资、时段、主题、显示/迷你/隐私及工作日；确认设置页可以检查更新和创建备份。以后通过应用内更新。出现配置问题时先保留原文件，选择有效备份恢复或联系维护者，不删除 config.json。

## 9. 当前验证边界

- 已核验真实 v0.2.0 安装包哈希、NSIS 格式、发布提交的存储路径和配置身份。
- 已通过 40 项原有前端工资/趣味积累测试、1 项新增发布签名校验测试和 18 项原生配置/窗口/保护与恢复测试；生产前端构建通过。
- 400×600 设置窗口的模拟桥接验收通过：启动仅检查一次、稍后不安装、未保存编辑时禁止安装、下载百分比、无更新/网络错误提示、备份二次确认与无效备份禁用。这里模拟了原生更新后端，不是实际升级测试。
- 真实 A 的自动化覆盖部分：**已通过**，见上方实际运行记录。窗口/托盘创建及图片加载由运行验证；托盘点击、双主题各状态、桌面入口等人工体验检查仍待完成。
- 真实 B：**尚未执行**。一次性 CI 密钥只用于隔离覆盖测试；仍需你控制并备份的生产签名身份、Secrets，以及专用高版本测试 Release，才能完成发布准备和应用内升级验收。
- C 的配置异常与发布侧签名篡改单元测试已覆盖；实际断网/下载中断/错签安装/首次重启仍需 VM 验证。
- 生产签名公钥、Secrets：**已配置并通过正式签名候选构建验证**；签名安装包、`.sig`、SHA-256、latest.json 已生成候选 artifact。公开正式 Release 与 `/releases/latest/download/latest.json` 仍须在实际升级验收通过后发布。

新增主要文件：`src-tauri/src/config_storage.rs`、`src-tauri/src/updater.rs`、`src/update/*`、`tools/prepare-updater.mjs`、`tools/prepare-release.mjs`、`tools/native-test-session.mjs`、`tools/verify-upgrade.mjs`、隔离验收工作流、发布工具测试及本说明；增量修改持久化、命令注册、设置页、版本源、capabilities 说明和已有发布工作流。
