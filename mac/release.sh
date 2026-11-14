#!/bin/bash
# 1401 汉化版发布脚本：构建 → 升版本号 → 打包 zip + dmg → 用维护者私钥签名 → 上传/打印清单。
# 用法: bash release.sh [版本号] [build号] [--publish]
#   不带版本号: 基于 build/1401.app 当前版本自动 +1（2.9.0.N -> 2.9.0.(N+1)）
#   加 --publish: 打包完成后自动用 gh 创建/上传 GitHub Release（否则只打印上传命令）
# 依赖: OpenSSL 3.x（系统自带）、/usr/libexec/PlistBuddy、/usr/bin/ditto、/usr/bin/hdiutil、gh（仅 --publish 时）
set -euo pipefail
cd "$(dirname "$0")"

KEY="$HOME/.config/1401-release/ed25519-priv.pem"
APP="build/1401.app"
ZIP_BASE="1401-Mac"

# 解析参数：抽出 --publish，其余按 [版本号] [build号] 处理
PUBLISH=0
ARGS=()
for a in "$@"; do
  if [ "$a" = "--publish" ]; then PUBLISH=1; else ARGS+=("$a"); fi
done
NEW="${ARGS[0]:-}"
BUILD_ARG="${ARGS[1]:-}"

if [ ! -f "$KEY" ]; then
  echo "缺少签名私钥：$KEY" >&2
  echo "请先生成 Ed25519 私钥并放到该路径（见 ReleaseSignature.ourPublicKeyBase64 对应的公钥已编译进 app）。" >&2
  exit 1
fi

# 读取当前版本（build 之前；若没有则用 3.0 作为基线）
# 版本号规则：官方最后一版是 3.0，所以汉化版用 3.0.0.N（N 从 1 递增），避免出现"官方 3.0.1"这种并不存在的版本号。
#   3.0 -> 3.0.0.1；3.0.0.1 -> 3.0.0.2；3.0.0 -> 3.0.0.1
CUR=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$APP/Contents/Info.plist" 2>/dev/null || echo "3.0")
if [ -n "$NEW" ]; then
  :
else
  NEW=$(echo "$CUR" | awk -F. 'BEGIN{OFS="."} { if (NF==2) { $3=0; $4=1; print } else if (NF==3) { $4=1; print } else { $NF=$NF+1; print } }')
fi
# CFBundleVersion 只需单调递增；用去掉点的数字串，2.9.0.1 -> 2901
BUILD="${BUILD_ARG:-$(echo "$NEW" | tr -d '.')}"
echo "版本: $CUR -> $NEW  (build $BUILD)"

# 用目标版本构建（build.sh 通过环境变量把版本写进 Info.plist）
APP_VERSION="$NEW" APP_BUILD="$BUILD" bash build.sh build

ZIP="$ZIP_BASE-$NEW.zip"
DMG="$ZIP_BASE-$NEW.dmg"
rm -f "$ZIP" "$ZIP.bsig" "$DMG" SHA256SUMS.txt
/usr/bin/ditto -c -k --keepParent "$APP" "$ZIP"

# 可拖拽安装的 dmg：app + 指向 /Applications 的捷径（中文名，方便用户识别）
SRC=$(mktemp -d /tmp/nm-dmgsrc.XXXX)
cp -R "$APP" "$SRC/1401汉化.app"
ln -s /Applications "$SRC/Applications"
/usr/bin/hdiutil create -volname "1401汉化 $NEW" -srcfolder "$SRC" -format UDZO -o "$DMG" >/dev/null
rm -rf "$SRC"

SHA=$(shasum -a 256 "$ZIP" | awk '{print $1}')
DSHA=$(shasum -a 256 "$DMG" | awk '{print $1}')
# SHA256SUMS.txt 只列 zip：它是 app 自动更新验签的对照表（zip + .bsig 一一对应）。
# dmg 含时间戳、每次重建哈希都会变，不参与应用内验签，故只单独打印其 sha 供手动核对。
printf '%s  %s\n' "$SHA" "$ZIP" > SHA256SUMS.txt

# 构造 boundMessage（与 ReleaseSignature.boundMessage 完全一致）并用私钥签名 zip。
# dmg 仅供手动安装（拖拽），不走应用内验签，因此不单独签名。
printf 'nullmoth-release-v1\n1401-mac\n%s\n%s\n' "$NEW" "$SHA" > /tmp/boundmsg.txt
openssl pkeyutl -sign -inkey "$KEY" -in /tmp/boundmsg.txt -rawin -out /tmp/app.sig
base64 -i /tmp/app.sig > "$ZIP.bsig"

echo
echo "=== 已生成发布文件 ==="
ls -l "$ZIP" "$DMG" "$ZIP.bsig" SHA256SUMS.txt

if [ "$PUBLISH" = 1 ]; then
  echo
  echo "=== 发布到 GitHub Release ==="
  # 绕开已失效的 ghproxy insteadOf（git 全局配置），并走本地 Clash 代理
  env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY HTTPS_PROXY=http://127.0.0.1:7890 \
    gh release create "v$NEW" "$ZIP" "$ZIP.bsig" "$DMG" SHA256SUMS.txt \
    --repo huangjinkun2006/1401 --target nullmoth-v30 \
    --title "1401 汉化版 $NEW" \
    --notes "汉化版 $NEW（基于官方 v3.0 / build 149）。

- 应用内「检查汉化版更新」直接检查本 Release，不再跳转网页
- 更新失败原因全部汉化显示
- ARM 转译相关界面全中文
- 支持应用内 HTTP / SOCKS5 代理（设置页底部），不依赖系统代理

校验：下载后对照 SHA256SUMS.txt；app 会用内置公钥校验 .bsig 后安装。

提供两种安装包：.zip 为应用内自动更新所用（带 .bsig 验签）；.dmg 为拖拽安装盘，供手动安装/分发。" \
    || { echo "发布失败（见上）。可手工上传：gh release upload v$NEW $ZIP $ZIP.bsig $DMG SHA256SUMS.txt --repo huangjinkun2006/1401"; exit 1; }
  echo "已发布 v$NEW：https://github.com/huangjinkun2006/1401/releases/tag/v$NEW"
else
  echo
  echo "=== 上传到 GitHub Release ==="
  echo "  仓库 : huangjinkun2006/1401   标签: v${NEW}"
  echo "  文件 : $ZIP   $ZIP.bsig   $DMG   SHA256SUMS.txt"
  echo "  步骤 : 打开 https://github.com/huangjinkun2006/1401/releases/new"
  echo "        创建 tag v${NEW}，把上面四个文件上传为 release assets，发布即可。"
  echo "        或加 --publish 让本脚本自动上传。"
  echo
  echo "  校验 : shasum -a 256 $ZIP  应等于  $SHA"
  echo "         shasum -a 256 $DMG  应等于  $DSHA"
  echo "  说明 : 应用内更新下载 $ZIP 并用编译内公钥校验 .bsig，通过才安装；$DMG 为手动安装盘。"
fi
