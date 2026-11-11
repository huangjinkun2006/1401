"use strict";
const $ = (id) => document.getElementById(id);
const post = (m) => window.webkit.messageHandlers.nm.postMessage(m);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const S = { mac: null, pkg: "", previewed: false, installed: false, driverUpdate: false };

function row(k, v) { return `<tr><th>${esc(k)}</th><td>${v}</td></tr>`; }
function step(n, state) { const li = $("s" + n); li.classList.toggle("done", state === "done"); li.classList.toggle("now", state === "now"); }

// 「ARM 应用（自愿开启）」卡片：状态（开/关、检查、列表）、忙碌文本、转译进度与全部错误信息。
// A.last: 上一次操作的结果（错误或完成的转译）。多数操作后都会刷新状态，
// 否则刷新会覆盖它，所以刷新会把上一次结果显示在状态上方一次。
const A = { on: false, ok: false, running: false, last: "" };
function armButtons() {
  $("armon").hidden = A.on; $("armoff").hidden = !A.on; $("armchk").hidden = !A.on;
  $("armon").disabled = false;
  $("armtr").hidden = !A.on; $("armtr").disabled = !(A.on && A.ok) || A.running;
  $("armprog").hidden = !A.running;
  $("armbrew").hidden = !A.on; $("armbrewgo").disabled = !A.on || A.running;
}
// nm-arm brew status: {"arm": {"installed", "ruby", "programs"}, "intel": {"installed"}} 或 {"why"}
function armBrewText(b) {
  if (!b) return "";
  if (b.why) return `<span class="warn">${esc(b.why)}</span>`;
  const side = (s, name, cmd) => s && s.installed ? `<span class="good">${name}已就绪</span> (${cmd})` : `${name}未安装`;
  let t = side(b.arm, "ARM Homebrew", "abrew") + " &middot; " + side(b.intel, "Intel Homebrew", "ibrew");
  const p = b.arm && b.arm.programs;
  if (p) t += `<br>已转译的程序：${esc(p.translated || 0)} 个；等待首次运行：${esc(p.stub || 0)} 个。`;
  if (b.arm && b.arm.installed && b.arm.ruby && !b.arm.ruby.launcher) t += `<br><span class="warn">ARM Homebrew 的 Ruby 尚未就绪：请在终端运行一次 abrew。</span>`;
  return t;
}
function gmEvent(d) {
  $("gmon").hidden = !!d.installed; $("gmoff").hidden = !d.installed;
  $("gmon").disabled = false; $("gmoff").disabled = false;
  $("gmr").innerHTML = d.why ? `<span class="warn">${esc(d.why)}</span>`
    : d.installed ? (d.running ? "已开启：游戏全屏时自动生效。" : "已安装但未运行：请重启 Mac，或将此功能关掉再开。") : "";
}
function armEvent(d) {
  if (d.kind === "status") {
    A.on = !!d.installed; A.running = !!d.translating;
    const c = d.check || {};
    A.ok = A.on && c.ok === true;
    let t = (A.last ? A.last + "<br>" : "") + (d.note ? `<span class="good">${esc(d.note)}</span><br>` : "");
    A.last = "";
    if (!A.on) t += "已关闭。未安装任何内容。";
    else if (c.ok === true) t += `<span class="good">本机可以运行转译应用</span>` + (c.target ? ` (${esc(c.target)})` : "") + "。";
    else t += `<span class="warn">${esc(c.why || "本机未通过检查。")}</span>`;
    // nm-arm check 的 "note"：当系统似乎隐藏了 CPU 特性（例如虚拟机）时给用户的一句话
    if (A.on && c.note) t += `<br><span class="small">${esc(c.note)}</span>`;
    if (d.listWhy) t += `<br><span class="warn">${esc(d.listWhy)}</span>`;
    $("armr").innerHTML = t;
    $("armclt").hidden = !(A.on && c.prerequisites && c.prerequisites.clt === false);
    $("armbrewr").innerHTML = A.on ? armBrewText(d.brew) : "";
    const apps = d.apps || [];
    $("armapps").innerHTML = !A.on ? "" : apps.length
      ? "<table>" + apps.map((a) => `<tr><th>${esc(a.name)}</th><td><button type="button" class="b" data-op="open" data-path="${esc(a.path)}">打开</button> <button type="button" class="b" data-op="remove" data-name="${esc(a.name)}">移除</button></td></tr>`).join("") + "</table>"
      : '<p class="small">还没有已转译的应用。</p>';
    armButtons();
    return;
  }
  if (d.kind === "request") {
    // 1401 for Windows 请求开启 ARM 应用：打开「工具」页并把此卡片置顶，横幅放在卡片上方
    $("armreqt").textContent = d.text;
    $("armreqon").hidden = !d.canRun;
    $("armreq").hidden = false;
    const tab = document.querySelector('.tab[data-t="tools"]');
    if (tab) tab.click();
    const sec = $("t-tools"), card = $("armcard"), first = sec.querySelector(".card");
    if (first && first !== card) sec.insertBefore(card, first);
    card.scrollIntoView({ block: "start" });
    return;
  }
  if (d.kind === "busy") { A.last = ""; $("armr").textContent = d.text; return; }
  if (d.kind === "error") { A.last = `<span class="warn">${esc(d.why)}</span>`; $("armr").innerHTML = A.last; armButtons(); return; }
  if (d.kind === "progress") {
    A.running = true; armButtons(); $("armcancel").disabled = false;
    if (typeof d.pct === "number") $("armbar").value = d.pct; else $("armbar").removeAttribute("value");
    $("armmsg").textContent = `${d.app}: ${d.msg || d.stage || ""}`;
    return;
  }
  if (d.kind === "done") {
    A.running = false; armButtons();
    if (d.what === "brew")
      A.last = d.ok ? `<span class="good">${esc(d.msg || "Homebrew 已设置完成。请打开一个新的终端窗口。")}</span>`
                    : `<span class="warn">Homebrew：${esc(d.why || "设置未完成")}</span>`;
    else
      A.last = d.ok ? `<span class="good">${esc(d.app)} 已转译：它位于「应用程序 &gt; NullMoth ARM」。</span>`
                    : `<span class="warn">${esc(d.app)}：${esc(d.why || "转译未完成")}</span>`;
    $("armr").innerHTML = A.last;
  }
}

function render(m) {
  S.mac = m;
  $("ver").textContent = m.version;
  const card = m.gpus.find((g) => g.supported) || m.gpus.find((g) => g.vendor === "10DE");
  const on = m.kexts >= 4 && m.metal.some((n) => /NVIDIA|GeForce|RTX/i.test(n));
  // kext 在卡上发布的信息：它拿到的 BAR 窗口、卡支持什么、Above 4G 与链路电源状态
  function nvrmFactRows(m) {
    const g = m.gpus.find((x) => x.nvrm && Object.keys(x.nvrm).length); if (!g) return "";
    const f = g.nvrm, mb = (v) => (v === undefined || v === null ? "未知" : Number(v) >= 1024 ? (Number(v) / 1024) + " GB" : Number(v) + " MB");
    const rb = f["nvrm-rebar"] === "on" ? "已开启" : f["nvrm-rebar"] === "off" ? "支持，未开启" : f["nvrm-rebar"] === "none" ? "显卡不提供" : "未知";
    return row("显存窗口 (BAR1)", esc(mb(f["nvrm-bar1-mb"])) + "（当前），固件提供 " + esc(mb(f["nvrm-bar1-firmware-mb"]))) +
      row("可变 BAR (Resizable BAR)", esc(rb) + (Number(f["nvrm-rebar-max-mb"]) ? "，最高 " + esc(mb(f["nvrm-rebar-max-mb"])) : "") + "；Above 4G 解码：" + esc(String(f["nvrm-above-4g"] || "未知"))) +
      row("PCIe 链路电源 (ASPM)", esc(String(f["nvrm-aspm"] || "未知")));
  }
  $("mac").innerHTML =
    row("macOS", esc(m.macos) + ([15, 26].includes(m.major) ? "" : ' <span class="bad">（驱动仅支持 macOS 15 和 26）</span>')) +
    row("处理器", m.arch === "x86_64" && !m.translated ? "x86_64" : '<span class="bad">Apple 芯片 —— 本驱动只适用于 Intel 架构的黑苹果/PC</span>') +
    row("显卡", m.gpus.length ? m.gpus.map((g) => esc(g.name) + (g.supported ? (g.tested ? ' <span class="good">在支持列表中，已实测该型号</span>' : ' <span class="warn">NVIDIA 列出，该型号尚未实测</span>') : g.vendor === "10DE" ? ' <span class="bad">不支持（需要 RTX 20 系列或更新）</span>' : "")).join("<br>") : "未找到") +
    nvrmFactRows(m) +
    row("OpenCore", m.opencore ? esc(m.opencore) : m.nativeMacPro ? '不需要：Mac Pro (2019) 使用苹果原厂固件 <span class="warn">（实验性，需关闭 SIP）</span>' : '<span class="warn">未检测到</span>') +
    row("已安装的驱动包", m.installedDriverVersion ? esc(m.installedDriverVersion) : "无版本记录") +
    row("NullMoth 驱动", on ? '<span class="good">运行中</span> (' + esc(m.metal.join(", ")) + ")" : m.kexts >= 4 ? '<span class="warn">已加载，尚无 NVIDIA Metal 设备</span>' : m.files ? '<span class="warn">已安装，尚未运行</span>' : "未安装");

  let why = "";
  if (m.arch !== "x86_64" || m.translated) why = "本机是 Apple 芯片 Mac，它自带的显卡就是苹果的。";
  else if (![15, 26].includes(m.major)) why = `驱动只支持 macOS 15 Sequoia 和 macOS 26 Tahoe；本机运行的是 ${esc(m.macos)}。`;
  else if (!card && (m.gpuHiding || []).some((a) => a !== "-wegnoigpu")) why = `看不到 NVIDIA 卡，因为本机带着 ${esc(m.gpuHiding.filter((a) => a !== "-wegnoigpu").join(" "))} 启动，它会屏蔽独立显卡。请在 OpenCore 的 config.plist 中从 boot-args 移除它，重启后再打开 1401。`;
  else if (!card && (m.hiddenNvidia || []).length) why = `NVIDIA 卡 (${esc(m.hiddenNvidia.join(", "))}) 在总线上，但被针对 macOS 关闭了，通常由 OpenCore DeviceProperties 里的 disable-gpu 属性造成。请移除它，重启后再打开 1401。`;
  else if (!card && /^MacBook/.test(m.hwModel || "")) why = "未找到 NVIDIA 卡。笔记本上的显卡常在 macOS 启动前就被关闭：可能是 BIOS 显卡模式（请选 Hybrid/MSHybrid 或 Discrete，不要选仅 iGPU），也可能是 OpenCore ACPI 目录里的 dGPU 断电 SSDT。修好后重启，再打开 1401。";
  else if (!card || !card.supported) why = "未找到受支持的 NVIDIA 卡。驱动需要 GeForce RTX 20 系列或更新的显卡。";
  else if (!m.opencore && !m.nativeMacPro) why = "本机没有报告 OpenCore。驱动的设置保存在 OpenCore 的配置里，没有它 1401 无法安装。";

  // 驱动已在运行时保持已校验的驱动包可用。
  const pk = m.packages.find((p) => p.ok === "yes"); if (pk) S.pkg = pk.path;
  // Tahoe：仅支持 macOS 15、驱动可安装的机器、且已有已校验的驱动包（包里同时含两版驱动）
  // （用本次扫描的包，而不是 S.pkg：已弹出的磁盘映像不能让按钮指向一个已消失的路径）
  $("upd").disabled = !pk || m.major !== 15 || !!why || !!m.nativeMacPro;   // Mac Pro (2019) 本身就能跑 macOS 26
  $("updt").innerHTML = m.major === 26 ? "本机已在运行 macOS 26。" : why ? "" : pk ? "" :
    '需要驱动包：<button type="button" class="b" id="dl3">下载驱动包</button>';
  const d3 = $("dl3"); if (d3) d3.onclick = () => post({ act: "download" });
  if (on) {
    $("verdict").innerHTML = `<p class="good">NullMoth 组件已加载，NVIDIA Metal 设备已可见。</p><p>要更新驱动，请使用「检查更新」。要卸载驱动，请使用下方的「卸载驱动」。${m.major === 15 ? "要升级到 macOS 26 Tahoe，请使用下方的<b>为本机准备 Tahoe</b>。" : ""}</p>`;
    $("steps").hidden = true; return;
  }
  // 没有 NVIDIA 卡但有 AMD 或 Intel GPU：NVIDIA 流程不适用，下面的 AMD/Intel 测试驱动适用。它需要
  // 驱动包（测试驱动随包发布），所以保留下载入口。
  const other = !card && m.arch === "x86_64" && !m.translated && [15, 26].includes(m.major) && m.gpus.some((g) => g.vendor === "1002" || g.vendor === "8086");
  // Intel 架构 Mac 上完全没有 GPU：OpenCore 把它关掉了（disable-gpu 或 -wegnoigpu），Lilu 随之把它从
  // macOS 的 PCI 列表里整个移除，所以表格显示「未找到」（2.0.3，一台 Core Ultra 笔记本，10-16 聊天截图）。
  // 测试驱动的安装会把常规地址上的 Intel GPU 重新打开，所以这里提供它而不是 NVIDIA 的建议。
  const hiddenOwn = !card && m.arch === "x86_64" && !m.translated && [15, 26].includes(m.major) && !m.gpus.length && !(m.hiddenNvidia || []).length
    && !(m.gpuHiding || []).some((a) => a !== "-wegnoigpu");   // -wegnoegpu 等屏蔽的是 NVIDIA 卡：保留它们的建议
  if (hiddenOwn) {
    const pk3 = m.packages.find((p) => p.ok === "yes"); if (pk3) S.pkg = pk3.path;
    $("verdict").innerHTML = `<p class="warn">macOS 完全看不到本机的 GPU。</p><p>多半是 OpenCore 把它关掉了（disable-gpu 属性${(m.gpuHiding || []).includes("-wegnoigpu") ? "，以及 boot-args 里的 -wegnoigpu" : ""}）。对于处理器自带的 Intel 或 AMD GPU，下方的 <b>AMD / Intel GPU 与 NPU 驱动（测试版）</b>会用测试驱动把它重新打开，<b>关闭</b>则再次停用。开启时会下载 AMD / Intel 驱动自己的组件包并校验。</p>`;
    $("steps").hidden = true; return;
  }
  if (why && other) {
    const pk2 = m.packages.find((p) => p.ok === "yes"); if (pk2) S.pkg = pk2.path;
    $("verdict").innerHTML = `<p class="warn">没有 NVIDIA 卡，NVIDIA 驱动不适用于本机。</p><p>本机的 ${esc(m.gpus.filter((g) => g.vendor !== "10DE").map((g) => g.name).join(", "))} 可以试试实验性的 AMD / Intel GPU 驱动：见下方 <b>AMD / Intel GPU 与 NPU 驱动（测试版）</b>。开启时会下载该驱动自己的组件包并校验。</p>`;
    $("steps").hidden = true; return;
  }
  if (why) { $("verdict").innerHTML = `<p class="bad">无法在本机安装。</p><p>${why}</p>`; $("steps").hidden = true; return; }
  // 四个 kext 都加载了但没有 NVIDIA Metal 设备，与「未运行」是不同的状态（#98：一台 kext 已加载的
  // Optimus 笔记本被告知重启并允许一个从未被阻止的扩展）。
  if (m.files && !S.installed && m.kexts >= 4) {
    $("verdict").innerHTML = '<p class="warn">驱动已加载，但 macOS 尚未出现 NVIDIA Metal 设备。</p><p>如果这是内屏接在 Intel 或 AMD 显卡上的笔记本（无 MUX 切换），NVIDIA 卡只会驱动插在它自己 HDMI 或 DisplayPort 上的显示器：接一台显示器上去再重启。否则请再重启一次；若仍然如此，请使用「发送日志」。</p>';
  } else if (m.files && !S.installed && m.driverOsMajor && m.driverOsMajor !== m.major) {
    // 驱动安装后 macOS 被升级了（1401 #484）：新系统把旧内核集合挂起（park）了
    $("verdict").innerHTML = `<p class="warn">驱动安装后 macOS 从 ${esc(String(m.driverOsMajor))} 升级到了 ${esc(String(m.major))}，因此驱动没有运行。</p><p>需要针对当前 macOS 重新安装：用下面四步，并使用支持 macOS ${esc(String(m.major))} 的驱动包。你的 OpenCore 设置保持不变。</p>`;
  } else if (m.files && !S.installed) {
    $("verdict").innerHTML = '<p class="warn">驱动已安装但未运行。</p><p>请重启。如果 macOS 阻止了系统扩展，请在「隐私与安全性」中允许，然后再重启一次。</p>';
  } else {
    $("verdict").innerHTML = `<p>你的 <b>${esc(card.name)}</b> 有可用的驱动配置。本机还需要完成引导、显示和应用检查。共四步，请按顺序进行。</p>`;
  }
  $("steps").hidden = false;
  const good = m.packages.find((p) => p.ok === "yes");
  if (good) { S.pkg = good.path; $("s1t").innerHTML = `已在${esc(good.where)}找到，校验通过。`; $("dl").hidden = true; step(1, "done"); }
  else { $("s1t").textContent = m.packages.length ? "找到了一份副本，但校验失败。请重新下载。" : "本机还没有驱动包。"; $("dl").hidden = false; step(1, "now"); }
  $("dry").disabled = !S.pkg;
  goState();
  if (S.pkg && !S.previewed) step(2, "now");
}

// 之前一个灰掉的按钮没有任何提示就把用户引去 Discord（10-13：「Install Driver 灰着，怎么办」）：
// 现在按钮文字直接说明先要做哪一步。
function goState() {
  $("go").disabled = !S.pkg || !S.previewed;
  $("go").textContent = !S.pkg ? "安装驱动（先获取驱动）" : !S.previewed ? "安装驱动（先点「预览改动清单」）" : "安装驱动";
  $("go").title = !S.pkg ? "第 1 步尚未找到驱动。" : !S.previewed ? "第 2 步会先列出每处改动；之后此按钮才会可用。" : "";
}

function logLine(l) {
  const kind = l.split(" ")[0], rest = esc(l.slice(kind.length + 1));
  const cls = { STEP: "s", CHANGE: "c", OK: "k", STOP: "x", RESULT: "s" }[kind];
  const txt = kind === "STEP" ? "== " + rest : kind === "CHANGE" ? "将改动: " + rest : kind === "OK" ? "完成  " + rest : kind === "STOP" ? "已停止: " + rest : kind === "NOTE" ? "    " + rest : kind === "RESULT" ? (rest === "ok" ? "完成。" : "已停止 —— 红线之后的内容没有做任何改动。") : esc(l);
  $("log").insertAdjacentHTML("beforeend", (cls ? `<span class="${cls}">${txt}</span>` : txt) + "\n");
  $("log").scrollTop = $("log").scrollHeight;
  const m = l.match(/^NOTE candidate (\S+)/);
  if (m) { $("efirow").hidden = false; if (![...$("efi").options].some((o) => o.value === m[1])) $("efi").insertAdjacentHTML("beforeend", `<option value="${esc(m[1])}">${esc(m[1])}</option>`); }
}

const NM = {
  on({ event, data }) {
    if (event === "scan") render(data);
    if (event === "lines") data.forEach(logLine);
    if (event === "dl") {
      if (data.state === "progress") {
        // 「更新驱动」显示自己的进度行；不处理的话进度会跑到第 1 步，看起来像卡住了。
        const mb = (n) => (n / 1048576).toFixed(1);
        const t = data.total > 0 ? `${Math.floor((100 * data.done) / data.total)}%（${mb(data.done)} / ${mb(data.total)} MB）` : `${mb(data.done)} MB`;
        $("dlp").textContent = t;
        if (S.driverUpdate) $("updr").textContent = `正在下载最新驱动：${t}`;
      }
      if (data.state === "start") ["dl", "updchk", "upddrv"].forEach((b) => ($(b).disabled = true));
      if (data.state === "error" || data.state === "done") ["dl", "updchk", "upddrv"].forEach((b) => ($(b).disabled = false));
      if (data.state === "error") {
        $("dlp").innerHTML = `<span class="bad">${esc(data.why)}</span>`;
        if (S.driverUpdate) { S.driverUpdate = false; $("updr").innerHTML = `<span class="bad">${esc(data.why)}</span>`; }
      }
      if (data.state === "done") {
        $("dlp").textContent = "下载完成，校验通过";
        if (S.driverUpdate) { $("updr").textContent = "下载已校验。正在安装驱动..."; $("upddrv").disabled = true; }
        post({ act: "scan" });
      }
    }
    if (event === "upd") {
      if (data.state === "error") { $("updr").innerHTML = `<span class="bad">${esc(data.why)}</span>`; $("upddrv").hidden = true; }
      if (data.state === "checked") {
        const have = data.installed ? `已安装 ${esc(data.installed)}，` : "";
        const kind = data.prerelease ? "抢先版 " : "";
        $("updr").innerHTML = !data.installed
          ? `1401 无法判断已安装的驱动版本。最新${kind}版本是 ${esc(data.latest)}；无论哪种情况，更新到它都是安全的。`
          : data.newer ? `${have}最新${kind}${esc(data.latest)} —— 可以更新。` : `${have}你的驱动已是最新（${esc(data.latest)}）。`;
        $("upddrv").hidden = !data.newer;
        $("upddrv").disabled = !data.newer;
        // 汉化版：应用更新改由维护者的 Release 提供，绝不触发官方 app 自更新（会把界面覆盖回英文）
        $("updapp").hidden = true;
        $("updapp").disabled = true;
        $("zhupd").hidden = false;
        $("updr").innerHTML += ' <span class="good">应用更新请点「查看汉化版更新」，由本汉化版维护者发布。</span>';
      }
    }
    if (event === "appupd") {
      if (data.state === "error") { $("updapp").disabled = false; $("updr").innerHTML = `<span class="bad">${esc(data.why)}</span>`; }
      if (data.state === "start") $("updr").textContent = `正在下载 1401 ${data.version}...`;
      if (data.state === "restarting") $("updr").textContent = `1401 ${data.version} 已校验 —— 正在重启进入新版本...`;
    }
    if (event === "run") {
      const busy = data.state === "start";
      ["dry", "go", "rm", "dl", "updchk", "upddrv", "upd", "updc"].forEach((b) => ($(b).disabled = busy));
      if (busy) { $("logwrap").hidden = false; $("log").textContent = ""; return; }
      if (data.why) { $("logwrap").hidden = false; logLine(data.why); }
      if (data.state === "cancelled") {
        if (S.driverUpdate) { S.driverUpdate = false; $("updr").textContent = "驱动更新已取消。"; }
        logLine("NOTE 已取消 —— 未做任何改动"); post({ act: "scan" }); return;
      }
      if (S.driverUpdate && data.mode === "install") {
        S.driverUpdate = false;
        if (data.ok) {
          $("updr").textContent = "驱动已安装。重启后加载。";
          $("upddrv").hidden = true;
          $("upddrv").disabled = true;
        } else { $("updr").textContent = "驱动更新已停止。请查看下方的安装日志。"; }
      }
      if (data.mode === "dry" && data.ok) { S.previewed = true; step(2, "done"); step(3, "now"); }
      if (data.mode === "install" && data.ok) { S.installed = true; step(3, "done"); step(4, "now"); $("rs").disabled = false; }
      if (data.mode === "tahoe") {
        if (data.ok) { $("swu").hidden = false; $("updt").textContent = "Tahoe 准备就绪。请打开「软件更新」安装 macOS 26。"; logLine("OK Tahoe 准备就绪 —— 点「打开软件更新」并安装 macOS 26"); }
        else $("updt").textContent = "Tahoe 准备已停止。请查看上方的安装日志。";
      }
      if (data.mode === "tahoecancel") { $("swu").hidden = true; $("updt").textContent = data.ok ? "完成：驱动已设为开机启动。重启 Mac 即可加载。" : "已停止。请查看上方的安装日志。"; }
      post({ act: "scan" });
    }
  },
};
window.NM = NM;

$("cfgpick").onclick = () => post({ act: "pickconfig" });
const efi = () => ($("efirow").hidden ? "auto" : $("efi").value);
$("efi").onchange = () => {
  S.previewed = false;
  goState();
  step(2, "now"); step(3, "waiting");
};
$("dl").onclick = () => post({ act: "download" });
$("upd").onclick = () => post({ act: "osupdate", cancel: false, pkg: S.pkg, efi: efi() });
$("swu").onclick = () => post({ act: "swupdate" });
$("updc").onclick = () => post({ act: "osupdate", cancel: true, efi: efi() });
$("updchk").onclick = () => { $("updr").textContent = "检查中..."; post({ act: "checkUpdate" }); };
const ZH_RELEASES = "https://github.com/huangjinkun2006/1401/releases/latest";
$("zhupd").onclick = () => post({ act: "open", url: ZH_RELEASES });
$("updapp").onclick = () => post({ act: "open", url: ZH_RELEASES });
$("upddrv").onclick = () => { S.driverUpdate = true; $("upddrv").disabled = true; $("updr").textContent = "正在下载最新驱动..."; post({ act: "updateDriver", efi: efi() }); };
$("ocg").onclick = (e) => { e.preventDefault(); post({ act: "open", url: "https://dortania.github.io/OpenCore-Install-Guide/" }); };
$("dry").onclick = () => post({ act: "run", mode: "dry", pkg: S.pkg, efi: efi() });
$("go").onclick = () => post({ act: "run", mode: "install", pkg: S.pkg, efi: efi() });
$("rm").onclick = () => { if (confirm("卸载 NullMoth 驱动，并把 OpenCore 配置恢复原样？")) post({ act: "run", mode: "remove", pkg: "", efi: efi() }); };
$("rs").onclick = () => post({ act: "restart" });
$("vbon").onclick = () => post({ act: "verbose", on: true, efi: efi() });
$("vboff").onclick = () => post({ act: "verbose", on: false, efi: efi() });
$("blon").onclick = () => post({ act: "backlight", on: true, efi: efi() });
$("bloff").onclick = () => post({ act: "backlight", on: false, efi: efi() });
$("hdon").onclick = () => post({ act: "hidpi", on: true, efi: efi() });
$("hdoff").onclick = () => post({ act: "hidpi", on: false, efi: efi() });
$("gpuon").onclick = () => post({ act: "gputest", on: true, efi: efi() });
$("gpuoff").onclick = () => post({ act: "gputest", on: false, efi: efi() });
$("hybcopy").onclick = () => post({ act: "hybrid", level: "copy", pkg: S.pkg || "", efi: efi() });
$("hybimport").onclick = () => post({ act: "hybrid", level: "import", pkg: S.pkg || "", efi: efi() });
$("hyboff").onclick = () => post({ act: "hybrid", level: "off", efi: efi() });
// 全选/全不选只做勾选和取消勾选；点「应用」前不会有任何变化
for (const [id, on] of [["expall", true], ["expnone", false]]) $(id).onclick = () => { for (const c of document.querySelectorAll(".expitem")) c.checked = on; };
$("expapply").onclick = () => post({ act: "experimental", items: Array.from(document.querySelectorAll(".expitem")).filter((c) => c.checked).map((c) => c.dataset.id), efi: efi() });
$("boston").onclick = () => post({ act: "gpuboost", op: "on", pkg: S.pkg || "", efi: efi() });
$("bostoff").onclick = () => post({ act: "gpuboost", op: "off", efi: efi() });
$("bostrm").onclick = () => post({ act: "gpuboost", op: "remove", efi: efi() });
$("bostat").onclick = () => post({ act: "gpuboost", op: "status" });
const ryNum = (id) => Number($(id).value);
$("ryzon").onclick = () => post({ act: "ryzenpower", on: true, stapm: ryNum("ryst"), slow: ryNum("rysl"), fast: ryNum("ryfa"), temp: ryNum("rytm"), pkg: S.pkg || "", efi: efi() });
$("ryzstat").onclick = () => post({ act: "ryzenpower", status: true, efi: efi() });
$("ryzoff").onclick = () => post({ act: "ryzenpower", on: false, efi: efi() });
$("xeon").onclick = () => post({ act: "xe", on: true, efi: efi() });
$("xeoff").onclick = () => post({ act: "xe", on: false, efi: efi() });
$("armon").onclick = () => { $("armon").disabled = true; post({ act: "arm", op: "on" }); };
$("armoff").onclick = () => post({ act: "arm", op: "off" });
$("armreqon").onclick = () => { $("armreq").hidden = true; $("armon").disabled = true; post({ act: "arm", op: "on", from: "windows" }); };
$("armreqno").onclick = (e) => { e.preventDefault(); $("armreq").hidden = true; post({ act: "arm", op: "notNow" }); };
$("gmon").onclick = () => { $("gmon").disabled = true; $("gmr").textContent = "等待输入 Mac 密码..."; post({ act: "gm", op: "on" }); };
$("gmoff").onclick = () => { $("gmoff").disabled = true; $("gmr").textContent = "等待输入 Mac 密码..."; post({ act: "gm", op: "off" }); };
$("armchk").onclick = () => post({ act: "arm", op: "check" });
$("armclt").onclick = () => post({ act: "arm", op: "clt" });
$("armtr").onclick = () => { $("armtr").disabled = true; post({ act: "arm", op: "translate" }); };
$("armbrewgo").onclick = () => { $("armbrewgo").disabled = true; post({ act: "arm", op: "brew", pick: $("armbrewpick").value, primary: $("armbrewprim").value }); };
$("armcancel").onclick = () => { $("armcancel").disabled = true; $("armmsg").textContent = "正在取消..."; post({ act: "arm", op: "cancel" }); };
$("armapps").onclick = (e) => {
  const b = e.target.closest("button[data-op]");
  if (b) post({ act: "arm", op: b.dataset.op, name: b.dataset.name, path: b.dataset.path });
};
post({ act: "arm", op: "status" });
post({ act: "gm", op: "status" });
$("teston").onclick = () => post({ act: "tester", on: true });
$("testoff").onclick = () => post({ act: "tester", on: false });
$("earlyon").onclick = () => post({ act: "early", on: true });
$("earlyoff").onclick = () => post({ act: "early", on: false });
post({ act: "early" });
$("efichk").onclick = () => { $("efichk").disabled = true; $("efichkr").textContent = "正在读取 EFI..."; $("efiout").textContent = ""; post({ act: "checkEfi" }); };
$("tccg").onclick = () => { $("tccr").textContent = "请选择应用..."; post({ act: "tccGrant" }); };
$("settings").onclick = () => post({ act: "settings" });
$("gpumap").onclick = () => { $("gpumap").disabled = true; $("gpumapr").textContent = "启动中..."; post({ act: "gpumap" }); };
$("priv").onclick = (e) => { e.preventDefault(); post({ act: "privacy" }); };
$("logs").onclick = (e) => { e.preventDefault(); post({ act: "logs" }); };
$("src").onclick = (e) => { e.preventDefault(); post({ act: "open", url: "https://github.com/nullmoth/nvidia-macos-driver" }); };
post({ act: "scan" });

document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === b));
  ["drv", "efi", "tools", "usb", "crash", "ailog", "help"].forEach((t) => ($("t-" + t).hidden = t !== b.dataset.t));
  $("ttl").textContent = "1401 — " + b.dataset.title;
  if (b.dataset.t !== "usb") post({ act: "usbStop" });
}));
// 浅色或深色：标题栏里的开关，会记住选择；使用之前以系统设置为准。
// 存储可能不可用；开关在本次会话中仍然有效。
function setTheme(light) {
  $("desk").classList.toggle("light", light);
  try { localStorage.setItem("theme", light ? "light" : "dark"); } catch (e) { /* 本次会话开关仍可用 */ }
}
(() => {
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) { /* 无已存选择 */ }
  const prefersLight = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches;
  $("desk").classList.toggle("light", saved ? saved === "light" : prefersLight);
})();
$("theme").onclick = () => setTheme(!$("desk").classList.contains("light"));
$("efimount").onclick = () => { $("efimount").disabled = true; $("efimountr").textContent = "正在寻找 EFI..."; post({ act: "mountEfi" }); };
const CONN = [[0, "USB 2 Type-A"], [3, "USB 3 Type-A"], [9, "USB-C（正反通用）"], [10, "USB-C（单向）"], [255, "机箱内部"]];
function usbConnectorDefault(port) {
  if (port.connectorKnown === true && CONN.some(([value]) => value === port.connector)) return port.connector;
  return port.usb3 ? 3 : 0;
}
const U = { ctrls: [], seen: {}, pick: {}, off: new Set(), last: "" };
function usbRender() {
  let h = "";
  for (const c of U.ctrls) {
    const name = c.key || c.controller, seen = new Set(U.seen[name] || []);
    const n = Object.keys(U.pick[name] || {}).length;
    h += `<table class="pc ports" border="1" cellspacing="2" cellpadding="3"><caption>控制器 ${esc(c.controller)} (${esc(c.vendor)}:${esc(c.device)}) &mdash; 已选 ${n}/15</caption><tr><th>使用</th><th>端口</th><th>已看到</th><th>插头类型</th><th>当前设备</th></tr>`;
    for (const p of c.ports) {
      const on = seen.has(p.name), pk = (U.pick[name] || {})[p.name];
      const def = usbConnectorDefault(p);
      h += `<tr><td><input type="checkbox" data-c="${esc(name)}" data-p="${esc(p.name)}" ${pk !== undefined ? "checked" : ""}></td><td>${esc(p.name)}${p.usb3 ? " (USB 3)" : ""}</td><td class="${on ? "on" : "off"}">${on ? "是" : "否"}</td>` +
        `<td><select data-c="${esc(name)}" data-p="${esc(p.name)}">${CONN.map(([v, t]) => `<option value="${v}" ${(pk ?? def) === v ? "selected" : ""}>${t}</option>`).join("")}</select></td><td>${esc((p.devices || []).join(", "))}</td></tr>`;
    }
    h += "</table>";
  }
  $("ports").innerHTML = h;
  $("ports").querySelectorAll("input").forEach((i) => (i.onchange = () => {
    const c = i.dataset.c, p = i.dataset.p; U.pick[c] = U.pick[c] || {};
    if (i.checked) { U.off.delete(c + "/" + p); U.pick[c][p] = +i.closest("tr").querySelector("select").value; } else { U.off.add(c + "/" + p); delete U.pick[c][p]; }
    usbRender();
  }));
  $("ports").querySelectorAll("select").forEach((s) => (s.onchange = () => {
    const c = s.dataset.c, p = s.dataset.p; U.pick[c] = U.pick[c] || {};
    // 选择插头类型即选择该端口：未勾选的行会被勾选并采用该类型，而不是在重绘时被重置
    U.off.delete(c + "/" + p); U.pick[c][p] = +s.value; usbRender();
  }));
}
$("uw").onclick = () => { U.pick = {}; U.off = new Set(); U.last = ""; post({ act: "usbStart" }); $("uw").textContent = "观察中..."; $("uw").disabled = true; };
$("uwr").onclick = () => { $("uerr").textContent = ""; post({ act: "usbStop" }); post({ act: "usbWrite", sel: U.pick, efi: efi() }); };
$("mk").onclick = () => post({ act: "crashReport" });
$("cf").onclick = () => post({ act: "open", url: "https://buymeacoffee.com/nullmoth" });
// 1401 构建或下载依赖的所有项目，及其作者与许可证
$("cr").onclick = () => post({ act: "open", url: "https://github.com/nullmoth/1401/blob/main/NOTICE.md" });
$("sl").onclick = () => { $("sl").disabled = true; $("slr").textContent = "正在收集并发送..."; post({ act: "sendLogs" }); };
$("fl").onclick = () => { $("sl").disabled = true; $("fl").disabled = true; $("slr").textContent = "正在录制显示输出 20 秒，随后发送..."; post({ act: "sendLogs", sample: "flicker" }); };
$("od").onclick = () => post({ act: "optionalDiagnostics" });
$("dr").onclick = () => post({ act: "importDiagnosticReceipt" });
$("up").onclick = () => post({ act: "open", url: "https://nullmothsystems.com/#send" });
const prevOn = NM.on;
NM.on = (m) => {
  if (m.event === "diagnosticsStatus") { $("odr").textContent = m.data.text; return; }
  if (m.event === "diagnosticReceipt") { $("drr").textContent = m.data.text; return; }
  if (m.event === "usb") {
    // 扫描每秒上报一次。每次都重建表格会在插头类型列表展开时把它关掉，并把未勾选行的插头类型
    // 重置为默认值，看起来就像选项自己变了（10-23 聊天记录）。
    // 只有当控制器、设备或已见端口发生变化时才重建表格。
    const snap = JSON.stringify([m.data.controllers, m.data.seen]);
    if (snap === U.last) return;
    U.last = snap;
    U.ctrls = m.data.controllers; U.seen = m.data.seen;
    for (const c of U.ctrls) {   // 已看到的端口自动勾选，并采用默认插头类型
      const key = c.key || c.controller;
      U.pick[key] = U.pick[key] || {};
      for (const p of c.ports) if ((U.seen[key] || []).includes(p.name) && !(p.name in U.pick[key]) && !U.off.has(key + "/" + p.name)) U.pick[key][p.name] = usbConnectorDefault(p);
    }
    usbRender(); return;
  }
  if (m.event === "usbErr") { $("uerr").textContent = m.data; return; }
  if (m.event === "early") {
    $("earlyr").textContent = m.data.on ? "已开启：新驱动会最先推送到本机，早于向所有人开放。" : "已关闭：本机只会在版本经过先行用户验证后再收到更新。";
    $("earlyon").hidden = m.data.on; $("earlyoff").hidden = !m.data.on;
    return;
  }
  if (m.event === "arm") { armEvent(m.data); return; }
  if (m.event === "gm") { gmEvent(m.data); return; }
  if (m.event === "tester") {
    $("testr").innerHTML = m.data.ok ? `<span class="good">${m.data.on ? "已加入：每次重启后会发送一份报告。" : "已退出：不再运行任何内容。"}</span>`
                                     : `<span class="warn">${esc(m.data.why)}</span>`;
    return;
  }
  if (m.event === "logsStatus") { $("slr").textContent = m.data.text; return; }
  if (m.event === "efiCheck") {
    const d = m.data;
    $("efichk").disabled = false;
    $("efiout").textContent = "";
    if (d.cancelled) { $("efichkr").textContent = ""; return; }
    if (!d.ok) { $("efichkr").innerHTML = `<span class="warn">${esc(d.why || "检查未完成。")}</span>`; return; }
    const n = d.issues.length;
    $("efin").hidden = !n; $("efin").textContent = n;
    $("efichkr").innerHTML = n ? `<span class="warn">${esc(d.partition)} 中有 ${n} 处需要修改</span>`
                               : `<span class="good">${esc(d.partition)} 中未发现问题</span>`;
    // 用文本节点构建：标题和步骤来自规则文件，绝不会被当作 HTML 解析
    for (const i of d.issues) {
      const box = document.createElement("details"), sum = document.createElement("summary"), b = document.createElement("b");
      b.textContent = i.title; sum.appendChild(b); box.appendChild(sum);
      const what = document.createElement("p"); what.textContent = i.what + (i.restart ? " 下次重启后生效。" : ""); box.appendChild(what);
      // 本机配置中的确切值，以及每个值应改成什么
      if ((i.now || []).length) {
        const now = document.createElement("div"); now.className = "now";
        const lab = document.createElement("b"); lab.textContent = "本机当前："; now.appendChild(lab);
        now.appendChild(document.createTextNode(i.now.join(" ")));
        box.appendChild(now);
      }
      const ol = document.createElement("ol");
      for (const s of i.steps) { const li = document.createElement("li"); li.textContent = s; ol.appendChild(li); }
      box.appendChild(ol);
      $("efiout").appendChild(box);
    }
    if (n) {
      const note = document.createElement("p");
      note.textContent = "编辑 config.plist 前请先备份一份。如果某个改动导致本机无法启动，可从 1401 U 盘启动，把备份放回去。";
      $("efiout").appendChild(note);
    }
    return;
  }
  if (m.event === "efiMount") {
    $("efimount").disabled = false;
    $("efimountr").innerHTML = m.data.cancelled ? "" : m.data.ok ? `<span class="good">已挂载 ${esc(m.data.partition)} 到 ${esc(m.data.where)}</span>`
                                                              : `<span class="warn">${esc(m.data.why || "无法挂载 EFI。")}</span>`;
    return;
  }
  if (m.event === "configPicked") {
    const o = document.createElement("option"); o.value = "config:" + m.data.path; o.textContent = "配置文件：" + m.data.path;
    $("efi").appendChild(o); $("efi").value = o.value; return;
  }
  if (m.event === "scan" && Array.isArray(m.data.experimentalOn)) for (const c of document.querySelectorAll(".expitem")) c.checked = m.data.experimentalOn.includes(c.dataset.id);
  if (m.event === "scan" && $("vmdpane")) $("vmdpane").hidden = !m.data.vmdOrRaid;
  if (m.event === "boostStatus") { $("bostr").textContent = m.data.text; return; }
  if (m.event === "tccStatus") { $("tccr").innerHTML = m.data.text ? `<span class="${m.data.ok ? "good" : "warn"}">${esc(m.data.text)}</span>` : ""; return; }
  if (m.event === "gpumapStatus") { $("gpumapr").textContent = m.data.text; if (m.data.done) $("gpumap").disabled = false; return; }
  if (m.event === "logsDone") {
    const d = m.data;
    $("sl").disabled = false; $("fl").disabled = false;
    $("slr").innerHTML = d.ok ? `<span class="good">已发送。报告 ID：${esc(d.ids.join(", "))}</span> —— 求助时请引用它。` + (d.errors.length ? `<br><span class="warn">未发送：${esc(d.errors.join("；"))}</span>` : "")
                              : `<span class="warn">${esc(d.why || ("什么都没发出去：" + (d.errors || []).join("；")))}</span>`;
    if (d.localPath) $("slr").innerHTML += "<br>报告文件已保存在本地。打开「日志文件夹」可找到它们，或重试发送。";
    return;
  }
  if (m.event === "crashDone") { $("cr").innerHTML = m.data.ok ? `<span class="good">已保存到桌面：</span> ${esc(m.data.path.split("/").pop())}` : `<span class="warn">${esc(m.data.why)}</span>`; return; }
  if (m.event === "scan" && m.data.crashes) $("cr").textContent = m.data.crashes.length ? `本机有 ${m.data.crashes.length} 个崩溃文件提到了驱动。` : "本机没有提到驱动的崩溃记录。";
  if (m.event === "scan" && m.data.itlwmNeedsHeliPort) {
    setTimeout(() => $("verdict").insertAdjacentHTML("beforeend", '<p class="warn">Wi-Fi：本机的 Intel 网卡由 itlwm 驱动，它通过自己的应用 HeliPort 连接网络，而不是 Wi-Fi 菜单。请从 github.com/OpenIntelWireless/HeliPort/releases 下载 HeliPort，移到「应用程序」并打开，在那里选择你的网络。要随 Mac 自动启动，请在它的菜单里开启 Launch at Login。</p>'), 0);
  }
  // 2.7.1：对每台以 -nvoff 启动的 Mac 都显示，而不只是有安装记录的。2.7 的 34 份「驱动没有起来」报告中有 10 份
  // 属于这种挂起状态且屏幕上无路可退；安装程序会自己找到启动所用的 OpenCore 分区。
  if (m.event === "scan" && m.data.autologinByApp && $("autologin")) {
    $("autologin").hidden = false;
    $("autologinoff").onclick = () => post({ act: "autologinoff" });
  }
  if (m.event === "scan" && m.data.safemode) {
    setTimeout(() => {
      $("verdict").insertAdjacentHTML("afterbegin", '<p class="warn">本机是在 NVIDIA 驱动被关闭的状态下启动的：boot-args 里有 -nvoff。macOS 更新期间 1401 会自动加上它；有些人在黑屏后也会手动加。如果你做过 macOS 26 升级准备，请现在从系统设置更新 macOS，更新完成后驱动会自动恢复。要在不更新的情况下重新打开驱动，或者驱动在更新后仍处于关闭状态，请点「开启驱动」然后重启。如果开启驱动后屏幕黑了，请先发送日志（下方「向 NullMoth 发送日志」）。要彻底移除驱动，请点下方「卸载驱动」。</p><p class="row"><button type="button" class="b go" id="nvon">开启驱动</button></p>');
      $("nvon").onclick = () => { $("nvon").disabled = true; post({ act: "osupdate", cancel: true, efi: efi() }); };
    }, 0);
  }
  prevOn(m);
};
window.NM = NM;
