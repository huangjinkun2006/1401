"use strict";
/* 1401 简体中文汉化版 · AI 日志解析
   纯前端、零二进制改动：
   1) 本地规则诊断完全离线，不联网、不上传任何内容；
   2) AI 深度分析只有用户自己填好接口并点按钮时才会发起请求；
   3) 复制提示词 / 打开 AI 网页是任何环境下都可用的兜底路径。 */
const AIL = { text: "", lines: [], hits: [], summary: "", scan: null, busy: false };
const ai$ = (id) => document.getElementById(id);
const aiEsc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const aiPost = (m) => window.webkit.messageHandlers.nm.postMessage(m);
const aiLvName = ["提示", "注意", "严重"];

/* 本机 scan 结果：包装原生消息入口，拿到机型 / 系统版本，写进 AI 提示词。 */
(function () {
  const orig = window.NM;
  window.NM = function (m) {
    try { if (m && m.event === "scan" && m.data) AIL.scan = m.data; } catch (e) { /* 取不到也不影响解析 */ }
    return orig ? orig.apply(this, arguments) : undefined;
  };
})();

/* ---------- 诊断规则库（黑苹果 / OpenCore / NullMoth 常见日志模式） ---------- */
const AI_RULES = [
  { id: "panic", lv: 2, tag: "内核崩溃", title: "出现内核崩溃（Kernel Panic）",
    re: /(kernel panic|panic\(cpu|\*\*\* panic|debugger called|panic-full|panic\()/i,
    why: "系统在内核态遇到无法恢复的错误，通常直接重启或卡在禁止符号。崩溃前最后加载的 kext、Backtrace 里的模块名是定位关键。",
    fix: ["把 panic 前后 20 行完整保留下来，尤其看最后出现的 kext 名称。", "回退最近一次 EFI / kext / boot-args 改动，一次只改一项。", "保留 -v 启动，确认是否每次都停在同一位置。"] },
  { id: "ips", lv: 2, tag: "崩溃报告", title: "检测到 .ips 崩溃报告结构",
    re: /(Exception Type|Termination Reason|Crashed Thread|Triggered by Thread|panicString)/i,
    why: "这是 macOS 生成的崩溃报告，Termination Reason 与 Crashed Thread 的调用栈通常直接指出出问题的进程或驱动。",
    fix: ["重点看 Termination Reason 与 Crashed Thread 最上面的几个模块。", "若栈里出现 Lilu / WhateverGreen / NullMoth 相关模块，先检查版本配套。", "把完整 .ips 交给 AI 深度分析，别只贴最后一行。"] },
  { id: "lilu", lv: 2, tag: "Lilu", title: "Lilu 加载或补丁失败",
    re: /(lilu[^\n]{0,90}(fail|error|unable|could not|not load|unsupported)|failed to load[^\n]{0,60}lilu|kxld[^\n]{0,60}lilu)/i,
    why: "Lilu 是 WhateverGreen、NootedRed 等插件的基础，它没起来时所有依赖它的驱动都会连带失效。常见于 macOS 大版本升级后 Lilu 版本过旧。",
    fix: ["把 Lilu 与所有依赖插件一起升级到支持当前 macOS 的版本。", "检查 EFI/OC/Kexts 顺序：Lilu 必须排在最前面。", "确认 config.plist 的 Kernel → Add 里已启用且路径正确。"] },
  { id: "liluver", lv: 1, tag: "版本配套", title: "kext 与系统/依赖版本不匹配",
    re: /(requires? (lilu|macos|version)|version mismatch|unsupported (os|macos|darwin)|built for[^\n]{0,40}(macos|darwin)|os version[^\n]{0,30}(not supported|mismatch))/i,
    why: "内核扩展按 Darwin 内核版本编译，系统升级后旧版 kext 常被拒绝加载。",
    fix: ["核对每个 kext 的 README 里支持的最高 macOS 版本。", "不要混用不同版本套件，整套一起更新后重建 OpenCore 快照。", "更新后重置 NVRAM 再试一次。"] },
  { id: "kextload", lv: 2, tag: "Kext", title: "内核扩展加载失败",
    re: /(can't load kext|failed to load kext|kxld[^\n]{0,80}|dependency[^\n]{0,60}not found|OSBundleLibraries[^\n]{0,60}|kext[^\n]{0,60}(failed to load|validation fail|invalid))/i,
    why: "kext 的依赖、签名或 Info.plist 有问题，macOS 拒绝把它装进内核，相关硬件就不会工作。",
    fix: ["按报错里的 kext 名检查 EFI/OC/Kexts 是否存在、是否启用。", "确认依赖 kext（如 Lilu）已加载且版本配套。", "检查 Kernel → Add 的 BundlePath / ExecutablePath / PlistPath 是否正确。"] },
  { id: "signature", lv: 2, tag: "签名校验", title: "驱动或更新包签名校验失败",
    re: /(signature (is )?not from NullMoth|update's signature|\.zip\.sig|\.zip\.bsig|hash mismatch|SHA-?256[^\n]{0,40}(mismatch|fail)|code signature[^\n]{0,40}invalid)/i,
    why: "官方驱动与更新包带 NullMoth 签名，程序会先验签再安装。校验失败说明包不完整、被替换过，或来源不对。",
    fix: ["只从 1401 自带的「获取驱动」下载，不要手动替换驱动包。", "删掉下载缓存后重试，确认网络没有被代理篡改。", "汉化版已停用官方 app 自更新，应用更新请走汉化版 Release 页面。"] },
  { id: "amfi", lv: 1, tag: "安全策略", title: "AMFI / 代码签名 / SIP 相关报错",
    re: /(AMFIPass|amfi[:\s]|library validation|code signing|Team ID|csrutil|System Integrity Protection|authenticated-root|seal is broken|root patch)/i,
    why: "第三方 kext 需要放宽 SIP 与 AMFI 校验，设置过严会让驱动加载被拦下；设置过松又会影响系统更新。",
    fix: ["记录当前 csr-active-config 与 SecureBootModel 的值再改。", "按所用驱动文档要求设置 SIP，别照抄别人的配置。", "macOS 15+ 出现 AMFI 报错时检查 AMFIPass.kext 是否与系统版本配套。"] },
  { id: "nulldrv", lv: 2, tag: "NullMoth 驱动", title: "NullMoth / NVIDIA 驱动启动失败",
    re: /((nullmoth|nvidia)[^\n]{0,90}(fail|error|not load|unable|missing|abort|refus)|(fail|error|unable)[^\n]{0,60}(nullmoth|nvidia))/i,
    why: "驱动本体没能正常初始化，通常是版本与当前 macOS 不匹配、实验开关冲突，或显卡被 ACPI / 启动参数屏蔽。",
    fix: ["确认驱动版本支持当前 macOS（大版本升级后需重装驱动）。", "回到「本机」页重新走一遍四步安装流程。", "把「实验性驱动与功能」恢复默认，只保留笔记本必需的「内屏走核显」。"] },
  { id: "hidden", lv: 2, tag: "显卡被屏蔽", title: "日志里出现屏蔽独显的启动参数或属性",
    re: /(-wegnoegpu|-wegnoigpu|-nvoff|nv_disable=1|disable-gpu|disable-external-gpu|gpu-off|SSDT-Disable)/i,
    why: "这些参数会让 macOS 看不到 NVIDIA 卡，驱动自然不会加载。常见于之前为了装系统或排障临时加的屏蔽。",
    fix: ["在 OpenCore config.plist 的 boot-args 里移除 -wegnoegpu / -nvoff 等参数。", "检查 DeviceProperties 里的 disable-gpu 与 ACPI 里的断电 SSDT。", "重启后再打开 1401 看是否识别到显卡。"] },
  { id: "gpuinit", lv: 1, tag: "图形栈", title: "GPU / Metal / 显示输出初始化异常",
    re: /(IOGPU[^\n]{0,60}(fail|error)|IOAccelerator[^\n]{0,60}(fail|error)|Metal[^\n]{0,60}(not supported|fail|error)|AGPM[^\n]{0,40}(fail|error)|NVK[^\n]{0,40}(fail|error)|framebuffer[^\n]{0,40}(fail|error))/i,
    why: "显卡被识别但图形栈没能完成初始化，表现为黑屏、无加速、分辨率异常或驱动装好后没效果。",
    fix: ["确认 WhateverGreen / NootedRed 与当前系统配套，别和 NullMoth 驱动冲突。", "检查 config.plist 的 DeviceProperties 是否注入了不必要的属性。", "保留 -v 观察停在哪个阶段，把前后日志一起分析。"] },
  { id: "igpuproxy", lv: 1, tag: "Optimus", title: "涉及内屏走核显 / igpuproxy 实验开关",
    re: /(igpuproxy|nvfbigpu|Optimus|内屏走核显|hybrid graphics)/i,
    why: "Optimus 笔记本的内屏物理上接在核显上，需要 igpuproxy 把独显渲染结果回传。关掉它会黑屏，台式机上开它则可能多余。",
    fix: ["笔记本（含 FA506IV 这类 Optimus 机型）必须保持「内屏走核显」开启。", "对应机制是 /Library/NullMoth/experimental 里的 ON=igpuproxy 与 boot-args 的 nvfbigpu=1。", "改动实验开关后重启才生效，一次只改一项。"] },
  { id: "blackscreen", lv: 1, tag: "显示输出", title: "出现黑屏 / 无显示输出的典型日志",
    re: /(gIOScreenLockState|IOConsoleUsers|Waiting for DSMOS|no display|black screen| DSMOS |AppleDisplay[^\n]{0,40}(fail|error)|no matching framebuffer)/i,
    why: "这类信息本身不一定是错误（启动过程中常见），但若日志停在这里不再前进，就是显示输出或显卡初始化卡住。",
    fix: ["看这些行之后还有没有后续输出；停住才是问题。", "尝试在 BIOS 里切换显卡模式为 Hybrid / MSHybrid，不要选仅 iGPU。", "有 C 口直连独显的机型可试着把显示器接到 C 口（DP over USB-C）。"] },
  { id: "rootdev", lv: 1, tag: "启动卡住", title: "Still waiting for root device",
    re: /(still waiting for root device|root device[^\n]{0,30}(not found|timeout)|waiting for root)/i,
    why: "内核找不到系统盘，通常是 USB 控制器、NVMe 或 SATA 相关 kext / ACPI 的问题，与显卡驱动关系不大。",
    fix: ["检查 USB 端口映射与 USB 注入是否适配本机。", "换一个 USB 口或启动盘试试，排除硬件接触问题。", "先解决启动问题，再回来处理显卡驱动。"] },
  { id: "acpi", lv: 1, tag: "ACPI", title: "ACPI / SSDT 执行报错",
    re: /(ACPI Error|ACPI Exception|Method parse|Method execution failed|AE_NOT_FOUND|AE_ALREADY_EXISTS|AE_BAD_VALUE|Invalid ACPI)/i,
    why: "DSDT/SSDT 补丁与本机固件不匹配，可能导致设备被错误关闭或系统卡死，显卡断电 SSDT 尤其常见。",
    fix: ["逐个禁用最近新增的 SSDT，定位是哪张表引起的。", "确认补丁是针对同型号固件提取的，别混用他人 EFI。", "用 OpenCore 的日志级别确认报错来自哪张表。"] },
  { id: "ssdt", lv: 0, tag: "ACPI", title: "日志涉及 SSDT / DSDT / _DSM 补丁",
    re: /(SSDT-|DSDT\.aml|_DSM|DropOEM|DeviceProperties)/i,
    why: "说明日志中存在设备属性或 ACPI 补丁相关内容，排障时值得单独看一眼是否误伤了 GPU。",
    fix: ["检查是否有屏蔽独显的 SSDT 或 disable-gpu 属性。", "改动前备份整个 EFI 文件夹。"] },
  { id: "oc", lv: 1, tag: "OpenCore", title: "OpenCore 配置或加载报错",
    re: /(OC:|OCS:|OpenCore[^\n]{0,60}(error|invalid|failed|not found)|config\.plist[^\n]{0,40}(error|invalid|missing)|plist[^\n]{0,30}(parse|validation)[^\n]{0,20}(fail|error))/i,
    why: "引导器的配置有问题，驱动设置写在 config.plist 里，配置本身就出错会导致改动保存不上或引导失败。",
    fix: ["用 OpenCore Configurator / plutil 校验 config.plist 语法。", "对照「问题检查」页的 27 条规则逐条修。", "改之前先备份 EFI 到 U 盘。"] },
  { id: "secureboot", lv: 1, tag: "安全启动", title: "SecureBootModel / SIP 配置相关",
    re: /(SecureBootModel|csr-active-config|ApECID|Secure Boot|AllowNvramReset)/i,
    why: "安全启动模型与 SIP 值会决定第三方 kext 能否加载，设置过严时驱动会被拦下。",
    fix: ["记录现值再修改，改完重置 NVRAM 才生效。", "按驱动文档推荐值设置，别直接照抄别人的 EFI。"] },
  { id: "bar", lv: 1, tag: "PCIe", title: "可变 BAR / Above 4G 相关异常",
    re: /(resizable bar|rebar|above ?4g|above4g|BAR[^\n]{0,30}(fail|error|invalid)|pci[^\n]{0,30}(bar|resource)[^\n]{0,20}(fail|error))/i,
    why: "大显存显卡需要 Above 4G Decoding 与可变 BAR 支持，BIOS 或 config.plist 设置不当会让驱动拿不到显存窗口。",
    fix: ["在 BIOS 打开 Above 4G Decoding / Resizable BAR（若支持）。", "检查 config.plist 的 Booter → Quirks（ResizeAppleGpuBars 等）。", "不要同时开互相冲突的补丁。"] },
  { id: "vram", lv: 0, tag: "显存", title: "日志涉及显存 / framebuffer 信息",
    re: /(VRAM|video memory|显存|framebuffer|4 GB|6 GB|8 GB|BAR1)/i,
    why: "这些行可用于核对驱动是否识别到正确显存，本身不一定是错误。",
    fix: ["与「本机」页检测到的显存对照，明显偏小时检查 Above 4G 设置。"] },
  { id: "sleep", lv: 0, tag: "电源管理", title: "睡眠 / 唤醒 / 电源管理相关",
    re: /(darkwake|sleep[^\n]{0,25}(fail|error)|wake[^\n]{0,25}(fail|error)|RTC[^\n]{0,20}(error|fail)|ASPM|rtd3|power (state|management)[^\n]{0,20}(fail|error))/i,
    why: "睡眠唤醒与 PCIe 电源管理容易和独显驱动冲突，rtd3 / aspm 这类实验开关有掉卡和卡死风险。",
    fix: ["实验开关里的 rtd3 / aspm 默认保持关闭。", "先关闭省电类实验项，确认是否还掉卡或睡死。"] },
  { id: "network", lv: 1, tag: "下载", title: "驱动下载或网络校验失败",
    re: /(download[^\n]{0,40}(fail|error)|could not connect|connection (refused|reset|timed out)|SSL[^\n]{0,30}(error|fail)|certificate[^\n]{0,30}(invalid|error)|timed out|network[^\n]{0,30}(unreachable|error))/i,
    why: "驱动由 1401 运行时从官方源下载并校验哈希，网络不通或被代理拦截会让四步流程停在「获取驱动」。",
    fix: ["确认系统代理 / DNS 设置，必要时临时关闭代理重试。", "换网络再试一次，看是否被运营商或路由器拦截。", "下载失败不会改动 EFI，可安全重试。"] },
  { id: "perm", lv: 1, tag: "权限", title: "管理员权限 / 文件访问被拒",
    re: /(permission denied|operation not permitted|authorization (fail|denied)|administrator privileges|sudo[^\n]{0,30}(fail|error)|TCC[^\n]{0,20}(deny|error)|not authorized)/i,
    why: "写 EFI、安装 kext、改 NVRAM 都需要管理员权限或系统授权，权限不足会让安装中途失败。",
    fix: ["1401 弹窗要求密码时输入本机管理员密码。", "检查 系统设置 → 隐私与安全性 里的完全磁盘访问 / 文件与文件夹权限。", "确认启动用的 EFI 分区已挂载且可写。"] },
  { id: "nvram", lv: 0, tag: "NVRAM", title: "日志涉及 NVRAM / boot-args",
    re: /(NVRAM|nvram[^\n]{0,25}(error|fail)|boot-args|7C436110-AB2A-4BBB-A880-FE41995C9F82)/i,
    why: "启动参数、实验开关都通过 NVRAM 生效，改动后需要重置 NVRAM 才能彻底清掉旧值。",
    fix: ["在 OpenCore 启动菜单选 Reset NVRAM，再重新开机。", "确认 boot-args 里保留 -v，方便下次看报错。"] },
  { id: "app1401", lv: 0, tag: "1401 日志", title: "这是 1401 工具自身的运行日志",
    re: /(1401|nullmoth-(diagnostics|setup|log)|STEP |CHANGE |RESULT |NOTE candidate)/i,
    why: "1401 的操作日志用 STEP / CHANGE / OK / RESULT 等关键字标记每个步骤，RESULT 后面通常就是失败原因。",
    fix: ["从最后一个 STEP 开始看，找到第一个非 OK 的结果。", "把完整日志（含开头硬件检测表）一起贴入，信息越全结论越准。"] }
];

/* ---------- 工具函数 ---------- */
function aiStat(msg, cls) {
  const el = ai$("aiapistat");
  el.className = "small" + (cls ? " " + cls : "");
  el.textContent = msg;
}
function aiInputStat(msg) { ai$("aistat").textContent = msg; }

function aiSetText(t) {
  AIL.text = String(t || "").replace(/\r\n?/g, "\n");
  AIL.lines = AIL.text.split("\n");
  const n = AIL.lines.filter((l) => l.trim()).length;
  aiInputStat(AIL.text.trim() ? "已导入 " + n + " 行 / " + AIL.text.length.toLocaleString() + " 字符" : "尚未导入日志");
  if (AIL.text.trim()) ai$("airesultcard").hidden = false;
}

function aiKind(t) {
  if (/(Exception Type|Termination Reason|panicString|panic\(cpu)/i.test(t)) return "崩溃报告（.ips / panic）";
  if (/(OC:|OCS:|OpenCore|config\.plist)/i.test(t)) return "OpenCore 引导日志";
  if (/(STEP |RESULT |nullmoth-diagnostics|1401\.app)/i.test(t)) return "1401 操作日志";
  if (/(Darwin Kernel Version|kernel\[0\]|IOKit|AppleIntel|IOGPU)/i.test(t)) return "系统内核日志（-v / log show）";
  if (/(Lilu|WhateverGreen|NullMoth|kext)/i.test(t)) return "kext / 驱动日志";
  return "通用日志";
}

function aiEvidence(lines, re) {
  const out = [];
  for (let i = 0; i < lines.length && out.length < 3; i++) {
    if (re.test(lines[i])) {
      const from = Math.max(0, i - 1);
      const to = Math.min(lines.length, i + 2);
      out.push({ n: i + 1, text: lines.slice(from, to).join("\n").slice(0, 360) });
      i += 2;
    }
  }
  return out;
}

function aiClues(t, lines) {
  const out = [];
  const put = (k, m) => { if (m) out.push(k + "：" + String(m).trim().slice(0, 220)); };
  put("macOS / 内核", (t.match(/macOS\s+\d{1,2}(?:\.\d+){0,2}|Darwin Kernel Version\s+[\d.]+/i) || [])[0]);
  put("OpenCore 版本", (t.match(/OpenCore\s+(?:version\s+)?([\d.]+(?:-[a-z0-9]+)?)/i) || [])[1]);
  put("boot-args", (t.match(/boot-args[^\n]{0,24}?[:=]\s*["']?([^"'\n<>]{1,300})/i) || [])[1]);
  put("Lilu 版本", (t.match(/Lilu[^\n]{0,40}?(\d+\.\d+(?:\.\d+)?)/i) || [])[1]);
  put("WhateverGreen 版本", (t.match(/WhateverGreen[^\n]{0,40}?(\d+\.\d+(?:\.\d+)?)/i) || [])[1]);
  put("NullMoth 驱动版本", (t.match(/(?:NullMoth|nvidia-macos-driver)[^\n]{0,50}?(\d+\.\d+(?:\.\d+)?)/i) || [])[1]);
  const gpu = (t.match(/(?:NVIDIA|GeForce|RTX|GTX|AMD Radeon|Intel[^\n]{0,12}Graphics)[^\n]{0,70}/gi) || []).slice(0, 3);
  if (gpu.length) out.push("显卡相关行：" + gpu.join(" ｜ ").slice(0, 260));
  const kexts = Array.from(new Set(t.match(/[A-Za-z0-9_.]+\.kext/g) || [])).slice(0, 12);
  if (kexts.length) out.push("出现的 kext：" + kexts.join(", "));
  const errLines = lines.filter((l) => /(error|fail|panic|denied|invalid|unable|refused)/i.test(l)).length;
  out.push("含错误关键字的行：" + errLines + " 行");
  if (AIL.scan) {
    const s = AIL.scan;
    const bits = [];
    if (s.hwModel) bits.push("机型 " + s.hwModel);
    if (s.major) bits.push("macOS " + s.major);
    if (s.card) bits.push("显卡 " + (typeof s.card === "string" ? s.card : JSON.stringify(s.card).slice(0, 80)));
    if (s.opencore) bits.push("OpenCore " + s.opencore);
    if (bits.length) out.push("本机检测：" + bits.join(" · "));
  }
  return out;
}

/* ---------- 本地诊断 ---------- */
function aiAnalyzeLocal() {
  if (!AIL.text.trim()) { aiStat("请先粘贴、拖入或选择日志文件。", "warn"); return; }
  const t = AIL.text;
  const hits = [];
  AI_RULES.forEach((r) => {
    const ev = aiEvidence(AIL.lines, r.re);
    if (ev.length) hits.push({ r: r, ev: ev });
  });
  hits.sort((a, b) => b.r.lv - a.r.lv);
  AIL.hits = hits;
  AIL.summary = hits.length
    ? hits.map((h) => "- [" + aiLvName[h.r.lv] + "] " + h.r.title + "：" + h.r.why).join("\n")
    : "- 本地规则库没有命中已知错误模式。";

  const top = hits.length ? hits[0].r.lv : -1;
  let html = '<p class="sh">解析概览</p><div class="ai-sum">';
  html += '<span class="ai-chip">日志类型：' + aiEsc(aiKind(t)) + "</span>";
  html += '<span class="ai-chip">有效行数：' + AIL.lines.filter((l) => l.trim()).length + "</span>";
  html += '<span class="ai-chip">命中规则：' + hits.length + " 条</span>";
  html += '<span class="ai-chip">' + (top >= 2 ? "🔴 发现严重问题" : top === 1 ? "🟡 有需要留意的项目" : "🟢 未发现明确错误") + "</span>";
  html += "</div>";

  if (!hits.length) {
    html += '<p>没有匹配到已知的错误模式。这不代表日志一定正常：可能是贴入的片段太短、屏蔽了关键字，或者问题不在规则库覆盖范围。</p>';
    html += '<p class="small">建议贴入更完整的日志（含开头硬件检测表和结尾的报错），或点「AI 深度分析」/「复制 AI 提示词」交给大模型通读。</p>';
  } else {
    html += '<p class="small">下面按严重程度排序。每条都附上日志原文证据，改 EFI 前请先备份。</p>';
    hits.forEach((h) => {
      html += '<div class="ai-hit l' + h.r.lv + '"><h3>' + aiEsc(h.r.title) + '<span class="tag">' + aiLvName[h.r.lv] + " · " + aiEsc(h.r.tag) + "</span></h3>";
      html += "<p>" + aiEsc(h.r.why) + "</p>";
      h.ev.forEach((e) => { html += '<pre class="ai-pre">第 ' + e.n + " 行附近：\n" + aiEsc(e.text) + "</pre>"; });
      html += "<p class=\"small\"><b>建议操作</b></p><ol>";
      h.r.fix.forEach((f) => { html += "<li>" + aiEsc(f) + "</li>"; });
      html += "</ol></div>";
    });
  }

  html += '<p class="sh">关键线索</p><pre class="ai-pre">' + aiEsc(aiClues(t, AIL.lines).join("\n")) + "</pre>";
  html += '<p class="sh">通用提醒</p><p class="small">改 EFI 前先备份整个 EFI 到 U 盘；重启时保留 -v 方便看报错；实验性开关一次只改一项；出问题可用启动菜单里的 <code>1401: Remove NVIDIA driver</code> 一键回退。本地解析完全离线，日志不会离开这台电脑。</p>';
  ai$("ailocal").innerHTML = html;
  ai$("airesultcard").hidden = false;
  aiStat("本地解析完成：命中 " + hits.length + " 条规则。可以继续做 AI 深度分析。", "good");
}

/* ---------- AI 提示词 ---------- */
function aiPromptBody() {
  const max = 14000;
  if (AIL.text.length <= max) return AIL.text;
  const L = AIL.lines;
  const mark = new Set();
  for (let i = 0; i < 60 && i < L.length; i++) mark.add(i);
  for (let i = Math.max(0, L.length - 60); i < L.length; i++) mark.add(i);
  AIL.hits.forEach((h) => h.ev.forEach((e) => {
    for (let i = Math.max(0, e.n - 6); i < Math.min(L.length, e.n + 6); i++) mark.add(i);
  }));
  const idx = Array.from(mark).sort((a, b) => a - b);
  let body = "", last = -2;
  idx.forEach((i) => {
    if (i !== last + 1) body += "\n……（省略中间未命中片段）……\n";
    body += L[i] + "\n";
    last = i;
  });
  return ("【日志开头 / 错误附近 / 日志结尾，已裁剪】\n" + body).slice(0, max);
}

function aiPrompt() {
  if (!AIL.text.trim()) return "";
  if (!AIL.hits.length && !AIL.summary) AIL.summary = "- 尚未运行本地解析。";
  const s = AIL.scan;
  const machine = s ? [
    s.hwModel ? "机型标识：" + s.hwModel : "",
    s.major ? "系统主版本：" + s.major : "",
    s.opencore ? "OpenCore：" + s.opencore : "",
    s.card ? "检测到的显卡：" + (typeof s.card === "string" ? s.card : JSON.stringify(s.card).slice(0, 120)) : ""
  ].filter(Boolean).join("\n") : "（本机检测信息暂不可用）";
  return [
    "你是一位精通 OpenCore 黑苹果与 NVIDIA / NullMoth 驱动（1401 工具）的排障专家。请只用简体中文回答，严格按下面五部分输出，不要写客套话：",
    "1. 结论：最可能的 1-3 个原因，按可能性排序，并标明把握程度（高/中/低）。",
    "2. 证据：逐条引用日志中的原文片段；日志里没有的内容绝对不要编造。",
    "3. 修复步骤：按优先级给可操作步骤，写清具体要改的 boot-args、config.plist 键、kext、SSDT 或 BIOS 选项，每步注明风险。",
    "4. 风险提示：涉及 EFI / 驱动改动时，提醒先备份 EFI、保留 -v、一次只改一项，必要时用启动菜单 1401: Remove NVIDIA driver 回退。",
    "5. 还需要什么：信息不足时明确列出应补充的日志、硬件或系统信息。",
    "注意：不确定就写「不确定」；不要把正常启动信息当成错误；不要建议关闭 SIP 之外的危险操作而不说明后果。",
    "",
    "【本机信息】", machine,
    "",
    "【日志类型】", aiKind(AIL.text),
    "",
    "【本地规则诊断摘要】", AIL.summary,
    "",
    "【日志内容】", aiPromptBody()
  ].join("\n");
}

/* ---------- AI 回答渲染 ---------- */
function aiMd(s) {
  let h = aiEsc(s);
  h = h.replace(/```([\s\S]*?)```/g, (m, c) => '<pre class="ai-pre">' + c.replace(/^\n/, "") + "</pre>");
  h = h.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  h = h.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  h = h.replace(/^#{1,4}\s*(.+)$/gm, '<p class="sh">$1</p>');
  h = h.replace(/^\s*(\d+)[.)]\s+(.+)$/gm, '<p class="ai-li">$1. $2</p>');
  h = h.replace(/^\s*[-*]\s+(.+)$/gm, '<p class="ai-li">· $1</p>');
  return h.replace(/\n/g, "<br>");
}
function aiShowAnswer(txt, title) {
  ai$("aianswer").innerHTML = '<p class="sh">' + aiEsc(title || "AI 深度分析") + '</p><div class="ai-answer">' + aiMd(txt) + "</div>";
  ai$("airesultcard").hidden = false;
}

/* ---------- 接口配置 ---------- */
const AI_PRESETS = {
  deepseek: { base: "https://api.deepseek.com/v1", model: "deepseek-chat", site: "https://chat.deepseek.com/" },
  qwen: { base: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", site: "https://tongyi.aliyun.com/" },
  moonshot: { base: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k", site: "https://kimi.moonshot.cn/" },
  openai: { base: "https://api.openai.com/v1", model: "gpt-4o-mini", site: "https://chatgpt.com/" },
  ollama: { base: "http://127.0.0.1:11434/v1", model: "qwen2.5:7b", site: "" },
  custom: { base: "", model: "", site: "https://chat.deepseek.com/" }
};
const AI_CFG_KEY = "nm1401_ai_log_cfg";

function aiCfgRead() {
  return {
    preset: ai$("aipreset").value,
    base: ai$("aibase").value.trim(),
    key: ai$("aikey").value.trim(),
    model: ai$("aimodel").value.trim(),
    site: ai$("aisite").value.trim()
  };
}
function aiCfgWrite(c) {
  ai$("aipreset").value = c.preset || "deepseek";
  ai$("aibase").value = c.base || "";
  ai$("aikey").value = c.key || "";
  ai$("aimodel").value = c.model || "";
  ai$("aisite").value = c.site || "";
}
function aiCfgSave() {
  try { localStorage.setItem(AI_CFG_KEY, JSON.stringify(aiCfgRead())); aiStat("接口设置已保存在本机。密钥只存在这台 Mac 的 localStorage 里。", "good"); }
  catch (e) { aiStat("本机不允许持久化存储，设置仅本次会话有效（功能不受影响）。", "warn"); }
}
function aiCfgClear() {
  try { localStorage.removeItem(AI_CFG_KEY); } catch (e) { /* ignore */ }
  aiCfgWrite(AI_PRESETS.deepseek);
  aiStat("已清除本机保存的接口设置。", "good");
}

/* ---------- AI 请求 ---------- */
async function aiCall() {
  if (AIL.busy) return;
  if (!AIL.text.trim()) { aiStat("请先导入日志再做 AI 分析。", "warn"); return; }
  const cfg = aiCfgRead();
  if (!cfg.base) { ai$("aicfg").open = true; aiStat("请先填写接口地址，或直接用「复制 AI 提示词」。", "warn"); return; }
  const url = cfg.base.replace(/\/+$/, "") + "/chat/completions";
  const headers = { "Content-Type": "application/json" };
  if (cfg.key) headers.Authorization = "Bearer " + cfg.key;
  const payload = {
    model: cfg.model || "deepseek-chat",
    messages: [
      { role: "system", content: "你是 OpenCore 黑苹果与 NVIDIA NullMoth 驱动排障专家，只输出简体中文，回答必须基于给出的日志证据。" },
      { role: "user", content: aiPrompt() }
    ],
    temperature: 0.2, stream: false
  };
  AIL.busy = true;
  ai$("aiai").disabled = true;
  aiStat("正在请求 " + (cfg.model || "模型") + "，日志较长时最多等 2 分钟…");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const resp = await fetch(url, { method: "POST", headers: headers, body: JSON.stringify(payload), signal: ctrl.signal });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new Error("HTTP " + resp.status + " " + detail.slice(0, 180));
    }
    const d = await resp.json();
    const txt = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
    if (!txt) throw new Error("接口返回里没有文本内容：" + JSON.stringify(d).slice(0, 180));
    aiShowAnswer(txt, "AI 深度分析 · " + (cfg.model || "自定义模型"));
    aiStat("AI 分析完成。结论请对照日志证据判断，改动 EFI 前记得备份。", "good");
  } catch (e) {
    const m = String((e && e.message) || e);
    let hint;
    if (/Abort/i.test(m)) hint = "请求超时：日志可能太长或网络较慢。可以先缩短日志，或改用「复制 AI 提示词」。";
    else if (/401|403|invalid.*key|unauthorized/i.test(m)) hint = "密钥无效或没有权限（HTTP 401/403），请检查 API Key。";
    else if (/404/i.test(m)) hint = "接口地址或模型名不对（HTTP 404），检查接口地址是否以 /v1 结尾、模型是否存在。";
    else if (/429/i.test(m)) hint = "调用额度或频率受限（HTTP 429），稍后再试。";
    else if (/TypeError|Failed to fetch|Load failed|CORS|NetworkError|network|SSL|ATS/i.test(m)) hint = "直连被拦截：多数大模型接口不允许从本地页面跨域调用（CORS），也可能是网络 / 系统代理问题。请点「复制 AI 提示词」粘贴到 AI 网页；本机 Ollama 可设置 OLLAMA_ORIGINS=* 后重试。";
    else hint = "请求失败：" + m;
    aiStat(hint, "warn");
  } finally {
    clearTimeout(timer);
    AIL.busy = false;
    ai$("aiai").disabled = false;
  }
}

/* ---------- 复制提示词 ---------- */
async function aiCopy() {
  const t = aiPrompt();
  if (!t) { aiStat("请先导入日志。", "warn"); return; }
  let ok = false;
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(t); ok = true; } } catch (e) { /* 走兜底 */ }
  if (!ok) {
    const ta = document.createElement("textarea");
    ta.value = t; ta.className = "ai-clip";
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
  }
  if (ok) aiStat("已复制 AI 提示词（" + t.length + " 字符），粘贴到任意 AI 对话即可。", "good");
  else {
    aiShowAnswer(t, "请手动全选复制下面的提示词");
    aiStat("自动复制被系统拦截，提示词已显示在结果区，请手动全选复制。", "warn");
  }
}

/* ---------- 文件导入 ---------- */
function aiReadFile(f) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ""));
    r.onerror = () => rej(r.error);
    r.readAsText(f);
  });
}
async function aiFiles(files) {
  if (!files || !files.length) return;
  const parts = [];
  for (const f of Array.from(files)) {
    if (f.size > 6 * 1024 * 1024) { parts.push("===== " + f.name + " =====\n[文件超过 6 MB，已跳过]"); continue; }
    try { parts.push("===== " + f.name + " =====\n" + (await aiReadFile(f))); }
    catch (e) { parts.push("===== " + f.name + " =====\n[读取失败：" + String(e) + "]"); }
  }
  const t = parts.join("\n\n");
  ai$("aiinput").value = t;
  aiSetText(t);
  aiStat("已导入 " + files.length + " 个文件，点「本地智能解析」开始。", "good");
}

const AI_SAMPLE = [
  "===== 示例：-v 启动日志（仅用于演示解析效果）=====",
  "OC: OpenCore 1.0.4, build N/A",
  "boot-args = -v keepsyms=1 debug=0x100 alcid=11",
  "OC: Loading kext Lilu.kext ...",
  "Kext com.example.Lilu failed to load: (libkern/kext) dependency not found",
  "Lilu: patcher failed to solve symbols for __ZN8IOPCIDevice...",
  "WhateverGreen: [GFX0] failed to locate framebuffer, disabling",
  "Kernel panic occurred at ...",
  "panic(cpu 2 caller 0xffffff80123abcde): Kernel trap at 0xffffff7f9..., type 14=page fault",
  "Backtrace (CPU 2), Frame : Return Address",
  "  com.nullmoth.NvidiaDriver ...",
  "NullMoth: driver init failed: unsupported macOS version (26.3)",
  "OC: config.plist validation error at Kernel->Add[12]: missing BundlePath",
  "IOGPU: failed to initialize AGPM for NVIDIA GeForce RTX 2060",
  "Waiting for DSMOS ...",
  "Still waiting for root device",
  "1401 STEP getDriver — RESULT failed: download failed (connection timed out)",
  "NVDA: -wegnoegpu found in boot-args, skipping external GPU"
].join("\n");

/* ---------- 初始化 ---------- */
(function init() {
  const input = ai$("aiinput");
  input.addEventListener("input", () => aiSetText(input.value));
  ai$("airun").onclick = aiAnalyzeLocal;
  ai$("aiai").onclick = aiCall;
  ai$("aicopy").onclick = aiCopy;
  ai$("aiclear").onclick = () => {
    input.value = ""; aiSetText("");
    ai$("ailocal").innerHTML = ""; ai$("aianswer").innerHTML = "";
    ai$("airesultcard").hidden = true;
    aiStat("已清空。");
  };
  ai$("aiexample").onclick = () => { input.value = AI_SAMPLE; aiSetText(AI_SAMPLE); aiStat("已载入示例日志，点「本地智能解析」看效果。", "good"); };
  ai$("aifilebtn").onclick = () => ai$("aifile").click();
  ai$("aifile").onchange = (e) => { aiFiles(e.target.files); e.target.value = ""; };
  ai$("ailogsfolder").onclick = () => { try { aiPost({ act: "logs" }); } catch (e) { aiStat("当前环境无法打开日志文件夹。", "warn"); } };
  const drop = ai$("aidrop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("ai-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("ai-over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("ai-over"); aiFiles(e.dataTransfer.files); });
  ai$("aipreset").onchange = (e) => {
    const p = AI_PRESETS[e.target.value] || AI_PRESETS.custom;
    const key = ai$("aikey").value;
    aiCfgWrite({ preset: e.target.value, base: p.base, model: p.model, site: p.site, key: key });
    aiStat("已填入 " + e.target.options[e.target.selectedIndex].text + " 的默认参数，可自行修改。");
  };
  ai$("aisavecfg").onclick = aiCfgSave;
  ai$("aiclearcfg").onclick = aiCfgClear;
  ai$("aiopen").onclick = () => {
    const site = ai$("aisite").value.trim() || "https://chat.deepseek.com/";
    try { aiPost({ act: "open", url: site }); aiStat("已打开 AI 网页。先点「复制 AI 提示词」再粘贴进来。", "good"); }
    catch (e) { aiStat("当前环境无法打开网页。", "warn"); }
  };
  try {
    const saved = JSON.parse(localStorage.getItem(AI_CFG_KEY) || "null");
    aiCfgWrite(saved && saved.base ? saved : AI_PRESETS.deepseek);
  } catch (e) { aiCfgWrite(AI_PRESETS.deepseek); }
})();
