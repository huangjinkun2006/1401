#!/bin/bash
# 1401 汉化版发布脚本：构建 → 升版本号 → 打包 → 用维护者私钥签名 → 输出上传清单。
# 用法: bash release.sh [版本号] [build号]
#   不带参数: 基于 build/1401.app 当前版本自动 +1（2.9 -> 2.9.1，2.9.1 -> 2.9.2）
# 依赖: OpenSSL 3.x（系统自带）、/usr/libexec/PlistBuddy、/usr/bin/ditto
set -euo pipefail
cd "$(dirname "$0")"

KEY="$HOME/.config/1401-release/ed25519-priv.pem"
APP="build/1401.app"
ZIP_BASE="1401-Mac"

if [ ! -f "$KEY" ]; then
  echo "缺少签名私钥：$KEY" >&2
  echo "请先生成 Ed25519 私钥并放到该路径（见 ReleaseSignature.ourPublicKeyBase64 对应的公钥已编译进 app）。" >&2
  exit 1
fi

# 读取当前版本（build 之前；若没有则用 2.9 作为基线）
CUR=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$APP/Contents/Info.plist" 2>/dev/null || echo "2.9")
if [ -n "${1:-}" ]; then
  NEW="$1"
else
  # 注意：OFS 必须在改写字段前设好，否则 $NF=$NF+1 会用默认空格重建整串（"2.9.1" -> "2 9 2"）
  NEW=$(echo "$CUR" | awk -F. 'BEGIN{OFS="."} { if (NF==2) { $3=1; print } else { $NF=$NF+1; print } }')
fi
BUILD="${2:-$NEW}"
echo "版本: $CUR -> $NEW  (build $BUILD)"

# 用目标版本构建（build.sh 通过环境变量把版本写进 Info.plist）
APP_VERSION="$NEW" APP_BUILD="$BUILD" bash build.sh build

ZIP="$ZIP_BASE-$NEW.zip"
rm -f "$ZIP" "$ZIP.bsig" SHA256SUMS.txt
/usr/bin/ditto -c -k --keepParent "$APP" "$ZIP"

SHA=$(shasum -a 256 "$ZIP" | awk '{print $1}')
printf '%s  %s\n' "$SHA" "$ZIP" > SHA256SUMS.txt

# 构造 boundMessage（与 ReleaseSignature.boundMessage 完全一致）并用私钥签名
printf 'nullmoth-release-v1\n1401-mac\n%s\n%s\n' "$NEW" "$SHA" > /tmp/boundmsg.txt
openssl pkeyutl -sign -inkey "$KEY" -in /tmp/boundmsg.txt -rawin -out /tmp/app.sig
base64 -i /tmp/app.sig > "$ZIP.bsig"

echo
echo "=== 已生成发布文件 ==="
ls -l "$ZIP" "$ZIP.bsig" SHA256SUMS.txt
echo
echo "=== 上传到 GitHub Release ==="
echo "  仓库 : huangjinkun2006/1401   标签: v${NEW}"
echo "  文件 : $ZIP   $ZIP.bsig   SHA256SUMS.txt"
echo "  步骤 : 打开 https://github.com/huangjinkun2006/1401/releases/new"
echo "        创建 tag v${NEW}，把上面三个文件上传为 release assets，发布即可。"
echo
echo "  校验 : 下载后执行  shasum -a 256 $ZIP  应等于  $SHA"
echo "  说明 : 应用内「检查驱动更新」会读取此 Release；有新版时「更新应用」按钮出现，"
echo "        下载后 app 会用编译内的维护者公钥校验 .bsig 签名，验证通过才安装。"
