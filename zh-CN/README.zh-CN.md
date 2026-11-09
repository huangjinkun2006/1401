# 1401 中文汉化版（1401 Chinese Localization）

> 基于 [NullMoth 官方 1401](https://github.com/nullmoth/1401) v2.8.1 的非官方中文界面汉化包。
>
> Required Notice: Copyright NullMoth Systems

## 这是什么

官方 1401 安装器目前只有英文界面。这个汉化包把 macOS 版应用的全部界面文字翻译成了简体中文，功能逻辑与官方原版**完全一致**，没有任何行为改动。

汉化内容覆盖：

- 五个标签页：本机（Home）/ 问题检查（Issues）/ 工具（Tools）/ USB 端口（USB Ports）/ 发送报告（Send Report）
- 安装四步流程与全部按钮、状态提示、错误说明
- Tahoe 准备、更新检查提示等

未汉化部分：「检查我的 EFI」功能里每条规则的详细说明来自数据文件 `efi_rules.json`（保持原文，避免误译影响判断准确性）。

## 使用方法（两种任选）

### 方式一：直接下载打包好的 app（推荐）

到本仓库的 **Releases** 页面下载 `1401-汉化版-2.8.1.zip`，解压后把 `1401.app` 拖进「应用程序」文件夹即可打开。

> 首次打开如果提示"无法验证开发者"，右键点 app → 打开，或到 系统设置 → 隐私与安全性 里点"仍要打开"。app 是 adhoc 自签名（与官方分发方式相同），驱动本体由 app 运行时从官方源下载并校验哈希，汉化不触碰任何驱动文件。

### 方式二：自己动手汉化官方原版

1. 从官方渠道获取 1401 Mac 版（官网或 GitHub Release，注意核对 SHA-256）
2. 把本目录的 `index.html` 和 `app.js` 替换掉 `1401.app/Contents/Resources/` 下的同名文件
3. （可选）把 `Info.plist` 中的 `CFBundleName` 改为你喜欢的名字，让 Dock 显示更直观
4. 重新签名：`codesign -f -s - --deep 1401.app`

## 与官方版本的差异清单

| 文件 | 改动 |
|---|---|
| `Contents/Resources/index.html` | 全部界面文本译为简体中文 |
| `Contents/Resources/app.js` | 全部状态/提示文本译为简体中文 |
| `Contents/Info.plist` | `CFBundleName` / `CFBundleDisplayName` 改为「1401汉化」 |
| `Contents/Resources/efi_rules.json` | **未改动** |
| 其余全部文件 | **未改动** |

## 许可证

原项目采用 [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)，本汉化包遵循同一许可证，仅用于非商业目的免费分发。完整许可证文本见 `LICENSE`。

原项目与作者：**NullMoth**（https://github.com/nullmoth/1401）
汉化：社区贡献，与 NullMoth 官方无隶属关系。

## 免责声明

本汉化包不包含任何驱动本体文件；驱动由 app 从官方源下载。使用本工具修改黑苹果 EFI / 安装驱动有一定风险，请务必备份 EFI 后再操作，一切后果自行承担。
