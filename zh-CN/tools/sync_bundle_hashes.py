#!/usr/bin/env python3
"""同步 1401 可执行文件内嵌的 BundleHashes 完整性清单（汉化版专用）。

背景
----
1401 在执行任何需要管理员权限的操作前（发送日志、安装驱动、挂载 EFI、
扫描诊断等），会把 Contents/Resources 里的文件复制到私有临时目录，并用
主可执行文件内嵌的 SHA-256 清单跑 `shasum -a 256 --status -c -` 校验。
汉化改动网页资源后，若清单仍是官方原值，校验失败并 `exit 97`，
osascript 就会报「该命令退出时状态为非零。(97)」。

本脚本按「清单中第 N 个哈希」定位并等长替换，可重复运行（幂等）。
清单第 0 项是官方驱动包 nullmoth-nvidia-*.tar.gz 的哈希，不在 app 内，
脚本会自动跳过。

用法
----
  python3 sync_bundle_hashes.py <汉化版.app> [官方原版.app]

默认：汉化版 /Applications/1401汉化.app，官方原版 /Applications/1401.app。
原版必须与汉化版是同一个 1401 版本（本表来自 2.9 / build 144）。

执行完务必重新签名，否则 app 无法通过 Gatekeeper / 签名校验：
  codesign --force --deep --sign - <汉化版.app>
  codesign --verify --deep --strict <汉化版.app>
"""

import hashlib
import os
import re
import shutil
import sys
import tempfile

HEX = re.compile(rb"(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])")
EXPECTED = 33  # 2.9 / build 144 的清单项数


def sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def resources(app):
    d = os.path.join(app, "Contents", "Resources")
    if not os.path.isdir(d):
        sys.exit("找不到 Resources 目录：" + d)
    return {
        n: sha(os.path.join(d, n))
        for n in os.listdir(d)
        if os.path.isfile(os.path.join(d, n))
    }


def load_binary(app):
    p = os.path.join(app, "Contents", "MacOS", "1401")
    if not os.path.isfile(p):
        sys.exit("找不到可执行文件：" + p)
    with open(p, "rb") as f:
        return p, bytearray(f.read())


def main():
    loc = sys.argv[1] if len(sys.argv) > 1 else "/Applications/1401汉化.app"
    orig = sys.argv[2] if len(sys.argv) > 2 else "/Applications/1401.app"

    lp, lb = load_binary(loc)
    _, ob = load_binary(orig)
    om = list(HEX.finditer(ob))
    lm = list(HEX.finditer(lb))
    if len(om) != EXPECTED or len(lm) != EXPECTED:
        sys.exit(
            "清单项数异常：原版 %d、汉化版 %d（预期 %d）。"
            "请确认两个 app 是同一个 1401 版本。" % (len(om), len(lm), EXPECTED)
        )

    of = resources(orig)
    lf = resources(loc)
    by_hash = {h: n for n, h in of.items()}
    mapping = {}
    for i, m in enumerate(om):
        h = m.group().decode()
        if h in by_hash:
            mapping[i] = by_hash[h]
    print("官方清单 %d 项，其中 %d 项对应 Resources 文件；第 0 项为驱动包哈希，跳过。"
          % (len(om), len(mapping)))

    # 先把位置与旧值固化下来，避免修改 bytearray 后 match 对象语义不清
    slots = [(m.start(), m.end(), m.group().decode()) for m in lm]
    changed = []
    for i, name in sorted(mapping.items()):
        if name not in lf:
            print("  ! 汉化版缺少 %s，跳过" % name)
            continue
        start, end, old = slots[i]
        new = lf[name]
        if old == new:
            continue
        lb[start:end] = new.encode("ascii")
        changed.append((i, name, old[:12], new[:12]))
    if not changed:
        print("清单已经与当前资源一致，无需改动。")
    else:
        for i, name, old, new in changed:
            print("  [%2d] %-28s %s… -> %s…" % (i, name, old, new))

    # 写回前先校验：所有映射项都应等于汉化版当前文件哈希
    check = list(HEX.finditer(lb))
    if len(check) != EXPECTED:
        sys.exit("替换后清单项数异常，已放弃写入。")
    bad = []
    for i, name in mapping.items():
        if name in lf and check[i].group().decode() != lf[name]:
            bad.append(name)
    if bad:
        sys.exit("校验失败，已放弃写入：" + ", ".join(bad))

    if changed:
        backup = os.path.join(
            tempfile.gettempdir(), "1401-MacOS-before-bundlehash.bak"
        )
        shutil.copy2(lp, backup)
        print("原可执行文件已备份到：" + backup)
        with open(lp, "wb") as f:
            f.write(lb)
        print("清单已写入：" + lp)
    print("完成。接下来请重新签名：codesign --force --deep --sign - \"%s\"" % loc)


if __name__ == "__main__":
    main()
