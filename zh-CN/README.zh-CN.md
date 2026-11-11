# 1401 中文汉化版（1401 Chinese Localization）

> 基于 [NullMoth 官方 1401](https://github.com/nullmoth/1401) v2.9 的非官方中文界面汉化包。
>
> Required Notice: Copyright NullMoth Systems

## 这是什么

官方 1401 安装器目前只有英文界面。这个汉化包把 macOS 版应用的全部界面文字翻译成了简体中文，驱动安装、检查、报告等原有逻辑与官方原版一致；另新增「使用说明」和「AI 日志解析」两个汉化版专属页面（不改动驱动本体与 EFI 行为）。

汉化内容覆盖（v2.9 全量）：

- 五个标签页：本机（Home）/ 问题检查（Issues）/ 工具（Tools）/ USB 端口（USB Ports）/ 发送报告（Send Report）
- 安装四步流程与全部按钮、状态提示、错误说明
- 驱动设置窗口（`settings.html` + `settings_catalog.json`）：GPU 信息、19 项设置的标题与说明、分组名、下拉选项（默认 / 开启 / 关闭 / RGB / YCbCr 等）、窗口标题
- 「检查我的 EFI」全部 27 条检查规则：标题、说明、修复步骤（`efi_rules.json`）
- 动态提示文本：硬件检测表（显存窗口/可变 BAR/ASPM）、诊断结论、下载进度、USB 端口映射等
- v2.9 新增内容：键盘背光、HDMI 音量、亮度控制等实验性功能说明
- 汉化版新增「AI 日志解析」标签页：日志离线中文诊断、可选 AI 深度分析、一键复制 AI 提示词

**完整中文说明书**：见 [使用说明.md](使用说明.md)（安装前备份 EFI、五个页面功能、驱动设置 19 项说明、**「实验性驱动与功能」14 个开关的逐项作用与开启后果**、常见问题、汉化版注意事项等）。打包好的 app 里也内置了「使用说明」标签页，打开即可查看；DMG 与 zip 包内另附一份同名 Markdown。说明书第十节专门讲「AI 日志解析」的用法与隐私边界。

## 使用方法（两种任选）

### 方式一：直接下载打包好的 app（推荐）

到本仓库的 **Releases** 页面下载 `1401-zh-CN-2.9.dmg`，双击打开安装窗口，把 `1401汉化.app` 拖到右侧「应用程序」文件夹即可。DMG 内附 `使用说明.md` 和中文安装引导。

如果习惯用 zip，也可以下载 `1401-zh-CN-2.9.zip`，用访达解压后同样把 `1401汉化.app` 拖进「应用程序」。

> 首次打开如果提示"无法验证开发者"，右键点 app → 打开，或到 系统设置 → 隐私与安全性 里点"仍要打开"。app 是 adhoc 自签名（与官方分发方式相同），驱动本体由 app 运行时从官方源下载并校验哈希，汉化不触碰任何驱动文件。

### 方式二：自己动手汉化官方原版

1. 从官方渠道获取 1401 Mac 版 2.9（官网或 GitHub Release，注意核对 SHA-256）
2. 把本目录 `mac-resources/` 下的 `index.html`、`settings.html`、`app.js`、`app.css`、`ai_log.js`、`efi_rules.json`、`settings_catalog.json` 复制到 `1401.app/Contents/Resources/` 覆盖同名文件（`app.css`、`ai_log.js` 是汉化版新增文件）
3. （可选）用 `Info.plist` 替换 `1401.app/Contents/Info.plist`，让 Dock 显示「1401汉化」
4. 重新签名：`codesign -f -s - --deep 1401.app`

> 注：设置窗口的**标题栏**「驱动设置」是在打包 app 的可执行文件里改的，手动替换资源文件无法改到它（会仍显示英文 `Driver settings`，不影响功能）。需要完整汉化请直接下载 Release 里打包好的 app。

## 与官方版本的差异清单

| 文件 | 改动 |
|---|---|
| `Contents/Resources/index.html` | 全部界面文本译为简体中文；新增「使用说明」与「AI 日志解析」两个标签页；CSP 增加 `connect-src` 以允许 AI 接口请求 |
| `Contents/Resources/settings.html` | 驱动设置窗口全部文本译为简体中文 |
| `Contents/Resources/app.js` | 全部状态/提示文本译为简体中文（日志协议关键字保留英文）；导航数组新增 `help`、`ailog`；**停用官方应用自更新**，改由「查看汉化版更新」打开维护者 Release |
| `Contents/Resources/app.css`（新增） | AI 日志解析页所需的输入区、诊断卡片、代码块等样式 |
| `Contents/Resources/ai_log.js`（新增） | AI 日志解析：20 多条离线诊断规则、证据提取、提示词生成、OpenAI 兼容接口调用 |
| `Contents/Resources/efi_rules.json` | 27 条 EFI 检查规则的标题/说明/步骤译为简体中文 |
| `Contents/Resources/settings_catalog.json` | 19 项驱动设置及分组名译为简体中文 |
| `Contents/Info.plist` | 增加 `NSAppTransportSecurity` → `NSAllowsLocalNetworking`，允许直连本机 Ollama |
| `Contents/MacOS/1401`（仅打包 app） | 窗口标题 `Driver settings` → 「驱动设置」；**同步内嵌 `BundleHashes` 清单中 6 个网页资源的 SHA-256**（见下方说明） |
| `zh-CN/tools/sync_bundle_hashes.py`（新增） | 同步内嵌哈希清单的工具，自行替换资源文件后必须运行并重新签名 |
| 其余全部文件 | **未改动**（驱动、kext、官方安装脚本、校验逻辑均保持原样） |

> **关于 `(97)` 报错与完整性校验**：1401 在执行需要管理员权限的操作前，会把 `Contents/Resources` 里的文件复制到私有临时目录，用主程序内嵌的 SHA-256 清单跑 `shasum -a 256 --status -c -`。汉化改动了 `index.html`、`app.js`、`app.css`、`efi_rules.json`、`settings.html`、`settings_catalog.json`，若清单仍是官方原值，校验失败并 `exit 97`，`osascript` 就会报「该命令退出时状态为非零。(97)」，导致发送日志 / 安装驱动 / 挂载 EFI 等全部失效。发布版已同步这 6 项哈希，校验照常生效（其余 26 项官方文件仍是原值）。若你按 `mac-resources/` 自行汉化，请在改完资源后执行：
>
> ```bash
> python3 zh-CN/tools/sync_bundle_hashes.py /path/to/1401汉化.app /path/to/1401.app
> codesign --force --deep --sign - /path/to/1401汉化.app
> ```
>
> 该脚本按清单位置等长替换、可重复运行，不修改校验逻辑。官方原版不受影响。

> **关于更新**：官方 app 更新包带 NullMoth 签名，程序会校验签名后才安装，因此无法让官方自动更新拉取第三方汉化包。本汉化版改为在「本机」页提供「查看汉化版更新」按钮，跳转到 https://github.com/huangjinkun2006/1401/releases/latest 手动下载；驱动更新不受影响，仍由官方渠道提供。

## 许可证

原项目采用 [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)，本汉化包遵循同一许可证，仅用于非商业目的免费分发。完整许可证文本见 `LICENSE`。

原项目与作者：**NullMoth**（https://github.com/nullmoth/1401）
汉化：社区贡献，与 NullMoth 官方无隶属关系。

## 免责声明

本汉化包不包含任何驱动本体文件；驱动由 app 从官方源下载。使用本工具修改黑苹果 EFI / 安装驱动有一定风险，请务必备份 EFI 后再操作，一切后果自行承担。
