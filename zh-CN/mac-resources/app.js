"use strict";
const $ = (id) => document.getElementById(id);
const post = (m) => window.webkit.messageHandlers.nm.postMessage(m);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const S = { mac: null, pkg: "", previewed: false, installed: false, driverUpdate: false };

function row(k, v) { return `<tr><th>${esc(k)}</th><td>${v}</td></tr>`; }
function step(n, state) { const li = $("s" + n); li.classList.toggle("done", state === "done"); li.classList.toggle("now", state === "now"); }

// ARM 应用卡片：状态、忙碌文本、转译进度与错误信息
const A = { on: false, ok: false, running: false, last: "" };
function armButtons() {
  $("armon").hidden = A.on; $("armoff").hidden = !A.on; $("armchk").hidden = !A.on;
  $("armon").disabled = false;
  $("armtr").hidden = !A.on; $("armtr").disabled = !(A.on && A.ok) || A.running;
  $("armprog").hidden = !A.running;
  $("armbrew").hidden = !A.on; $("armbrewgo").disabled = !A.on || A.running;
}
function armBrewText(b) {
  if (!b) return "";
  if (b.why) return `<span class="warn">${esc(b.why)}</span>`;
  const side = (s, name, cmd) => s && s.installed ? `<span class="good">${name}已就绪</span> (${cmd})` : `${name}未设置`;
  let t = side(b.arm, "ARM 版 Homebrew", "abrew") + " &middot; " + side(b.intel, "Intel 版 Homebrew", "ibrew");
  const p = b.arm && b.arm.programs;
  if (p) t += `<br>已转译的程序：${esc(p.translated || 0)}；等待首次运行：${esc(p.stub || 0)}。`;
  if (b.arm && b.arm.installed && b.arm.ruby && !b.arm.ruby.launcher) t += `<br><span class="warn">ARM 版 Homebrew 的 Ruby 还没准备好：请在终端运行一次 abrew。</span>`;
  return t;
}
function armEvent(d) {
  if (d.kind === "status") {
    A.on = !!d.installed; A.running = !!d.translating;
    const c = d.check || {};
    A.ok = A.on && c.ok === true;
    let t = (A.last ? A.last + "<br>" : "") + (d.note ? `<span class="good">${esc(d.note)}</span><br>` : "");
    A.last = "";
    if (!A.on) t += "未开启，没有安装任何东西。";
    else if (c.ok === true) t += `<span class="good">本机可以运行转译应用</span>` + (c.target ? ` (${esc(c.target)})` : "") + "。";
    else t += `<span class="warn">${esc(c.why || "本机未通过检查。")}</span>`;
    if (A.on && c.note) t += `<br><span class="small">${esc(c.note)}</span>`;
    if (d.listWhy) t += `<br><span class="warn">${esc(d.listWhy)}</span>`;
    $("armr").innerHTML = t;
    $("armclt").hidden = !(A.on && c.prerequisites && c.prerequisites.clt === false);
    $("armbrewr").innerHTML = A.on ? armBrewText(d.brew) : "";
    const apps = d.apps || [];
    $("armapps").innerHTML = !A.on ? "" : apps.length
      ? "<table>" + apps.map((a) => `<tr><th>${esc(a.name)}</th><td><button type="button" class="b" data-op="open" data-path="${esc(a.path)}">打开</button> <button type="button" class="b" data-op="remove" data-name="${esc(a.name)}">移除</button></td></tr>`).join("") + "</table>"
      : '<p class="small">还没有转译好的应用。</p>';
    armButtons();
    return;
  }
  if (d.kind === "request") {
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
      A.last = d.ok ? `<span class="good">${esc(d.app)} 已转译：它位于"应用程序 &gt; NullMoth ARM"。</span>`
                    : `<span class="warn">${esc(d.app)}：${esc(d.why || "转译未完成")}</span>`;
    $("armr").innerHTML = A.last;
  }
}

function render(m) {
  S.mac = m;
  $("ver").textContent = m.version;
  const card = m.gpus.find((g) => g.supported) || m.gpus.find((g) => g.vendor === "10DE");
  const on = m.kexts >= 4 && m.metal.some((n) => /NVIDIA|GeForce|RTX/i.test(n));
  $("mac").innerHTML =
    row("macOS 版本", esc(m.macos) + ([15, 26].includes(m.major) ? "" : ' <span class="bad">（驱动仅支持 macOS 15 和 26）</span>')) +
    row("处理器", m.arch === "x86_64" && !m.translated ? "x86_64" : '<span class="bad">Apple 芯片——本驱动仅支持 Intel Mac 和 PC</span>') +
    row("显卡", m.gpus.length ? m.gpus.map((g) => esc(g.name) + (g.supported ? (g.tested ? ' <span class="good">支持列表内，该型号已实测</span>' : ' <span class="warn">NVIDIA 列表内，该型号尚未实测</span>') : g.vendor === "10DE" ? ' <span class="bad">不支持（需 RTX 20 系或更新）</span>' : "")).join("<br>") : "未发现显卡") +
    row("OpenCore", m.opencore ? esc(m.opencore) : m.nativeMacPro ? '无需：Mac Pro (2019) 使用苹果固件 <span class="warn">（实验性，需关闭 SIP）</span>' : '<span class="warn">未检测到</span>') +
    row("已安装的驱动包", m.installedDriverVersion ? esc(m.installedDriverVersion) : "无版本记录") +
    row("NullMoth 驱动", on ? '<span class="good">运行中</span> (' + esc(m.metal.join(", ")) + ")" : m.kexts >= 4 ? '<span class="warn">已加载，但还没有 NVIDIA Metal 设备</span>' : m.files ? '<span class="warn">已安装，尚未运行</span>' : "未安装");

  let why = "";
  if (m.arch !== "x86_64" || m.translated) why = "本机是 Apple 芯片 Mac，自带苹果自己的显卡。";
  else if (![15, 26].includes(m.major)) why = `驱动是为 macOS 15 Sequoia 和 macOS 26 Tahoe（beta）构建的；本机运行的是 ${esc(m.macos)}。`;
  else if (!card && (m.gpuHiding || []).some((a) => a !== "-wegnoigpu")) why = `看不到 NVIDIA 显卡，因为本机以 ${esc(m.gpuHiding.filter((a) => a !== "-wegnoigpu").join(" "))} 参数启动，它会隐藏独立显卡。请从 OpenCore config.plist 的 boot-args 中移除该参数，重启后再打开 1401。`;
  else if (!card && (m.hiddenNvidia || []).length) why = `NVIDIA 显卡（${esc(m.hiddenNvidia.join(", "))}）在总线上，但被 macOS 关闭了，通常是 OpenCore DeviceProperties 中的 disable-gpu 属性所致。请移除它，重启后再打开 1401。`;
  else if (!card && /^MacBook/.test(m.hwModel || "")) why = "未找到 NVIDIA 显卡。在笔记本上，独显通常在 macOS 启动前就被关闭：可能是 BIOS 显卡模式（请选 Hybrid/MSHybrid 或 Discrete，不要选仅 iGPU），也可能是 OpenCore ACPI 文件夹里的独显断电 SSDT。处理好后重启，再打开 1401。";
  else if (!card || !card.supported) why = "未找到受支持的 NVIDIA 显卡。驱动需要 GeForce RTX 20 系或更新。";
  else if (!m.opencore && !m.nativeMacPro) why = "本机没有报告 OpenCore。驱动的设置存放在 OpenCore 配置里，因此 1401 没有它无法安装。";

  const pk = m.packages.find((p) => p.ok === "yes"); if (pk) S.pkg = pk.path;
  $("upd").disabled = !pk || m.major !== 15 || !!why || !!m.nativeMacPro;
  $("updt").innerHTML = m.major === 26 ? "本机已在运行 macOS 26。" : why ? "" : pk ? "" :
    '需要驱动包： <button type="button" class="b" id="dl3">下载驱动包</button>';
  const d3 = $("dl3"); if (d3) d3.onclick = () => post({ act: "download" });
  if (on) {
    $("verdict").innerHTML = `<p class="good">NullMoth 组件已加载，且可以看到 NVIDIA Metal 设备。</p><p>用"检查更新"来升级驱动；要卸载驱动，请使用下方的"卸载驱动"。${m.major === 15 ? " 要升级到 macOS 26 Tahoe，请使用下方的<b>为本机准备 Tahoe</b>。" : ""}</p>`;
    $("steps").hidden = true; return;
  }
  const other = !card && m.arch === "x86_64" && !m.translated && [15, 26].includes(m.major) && m.gpus.some((g) => g.vendor === "1002" || g.vendor === "8086");
  const hiddenOwn = !card && m.arch === "x86_64" && !m.translated && [15, 26].includes(m.major) && !m.gpus.length && !(m.hiddenNvidia || []).length
    && !(m.gpuHiding || []).some((a) => a !== "-wegnoigpu");
  if (hiddenOwn) {
    const pk3 = m.packages.find((p) => p.ok === "yes"); if (pk3) S.pkg = pk3.path;
    $("verdict").innerHTML = `<p class="warn">macOS 在本机上没有看到任何 GPU。</p><p>OpenCore 很可能把它关掉了（disable-gpu 属性${(m.gpuHiding || []).includes("-wegnoigpu") ? "，以及 boot-args 里的 -wegnoigpu" : ""}）。对处理器自带的 Intel 或 AMD GPU，下方的<b>AMD / Intel GPU 和 NPU 驱动（测试）</b>可以用测试驱动把它重新打开，<b>关闭</b>则再次关掉。开启时会下载该驱动自己的安装包并校验。</p>`;
    $("steps").hidden = true; return;
  }
  if (why && other) {
    const pk2 = m.packages.find((p) => p.ok === "yes"); if (pk2) S.pkg = pk2.path;
    $("verdict").innerHTML = `<p class="warn">未检测到 NVIDIA 显卡，因此这里不适用 NVIDIA 驱动。</p><p>本机的 ${esc(m.gpus.filter((g) => g.vendor !== "10DE").map((g) => g.name).join(", "))} 可以尝试实验性的 AMD / Intel GPU 驱动：见下方<b>AMD / Intel GPU 和 NPU 驱动（测试）</b>。开启它会下载该驱动自己的安装包并校验。</p>`;
    $("steps").hidden = true; return;
  }
  if (why) { $("verdict").innerHTML = `<p class="bad">无法在本机安装。</p><p>${why}</p>`; $("steps").hidden = true; return; }
  if (m.files && !S.installed && m.kexts >= 4) {
    $("verdict").innerHTML = '<p class="warn">驱动已加载，但 macOS 还没有显示 NVIDIA Metal 设备。</p><p>如果这是内置屏幕接 Intel 或 AMD 显卡的笔记本（无 MUX 切换），NVIDIA 显卡只会驱动插在它自己 HDMI 或 DisplayPort 上的显示器：接一个上去再重启。否则请再重启一次；如果还是这样，请用"发送日志"。</p>';
  } else if (m.files && !S.installed) {
    $("verdict").innerHTML = '<p class="warn">驱动已安装但尚未运行。</p><p>请重启。如果 macOS 拦截了系统扩展，请在"隐私与安全性"中允许，然后再重启一次。</p>';
  } else {
    $("verdict").innerHTML = `<p>你的 <b>${esc(card.name)}</b> 有可用的驱动配置。本机还需要进行启动、显示和应用检查。共四步，请按顺序来。</p>`;
  }
  $("steps").hidden = false;
  const good = m.packages.find((p) => p.ok === "yes");
  if (good) { S.pkg = good.path; $("s1t").innerHTML = `在 ${esc(good.where)} 中找到，校验通过。`; $("dl").hidden = true; step(1, "done"); }
  else { $("s1t").textContent = m.packages.length ? "发现了一个副本，但校验不符。请重新下载。" : "本机还没有驱动包。"; $("dl").hidden = false; step(1, "now"); }
  $("dry").disabled = !S.pkg;
  goState();
  if (S.pkg && !S.previewed) step(2, "now");
}

function goState() {
  $("go").disabled = !S.pkg || !S.previewed;
  $("go").textContent = !S.pkg ? "安装驱动（请先获取驱动）" : !S.previewed ? "安装驱动（请先点「预览更改」）" : "安装驱动";
  $("go").title = !S.pkg ? "第 1 步还没有找到驱动。" : !S.previewed ? "第 2 步会先列出每一项更改，之后这个按钮才会亮起。" : "";
}

function logLine(l) {
  const kind = l.split(" ")[0], rest = esc(l.slice(kind.length + 1));
  const cls = { STEP: "s", CHANGE: "c", OK: "k", STOP: "x", RESULT: "s" }[kind];
  const txt = kind === "STEP" ? "== " + rest : kind === "CHANGE" ? "将更改: " + rest : kind === "OK" ? "完成 " + rest : kind === "STOP" ? "已停止: " + rest : kind === "NOTE" ? "    " + rest : kind === "RESULT" ? (rest === "ok" ? "已完成。" : "已停止——红线之后的内容没有被更改。") : esc(l);
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
          ? `1401 无法判断已安装的驱动版本。最新${kind}为 ${esc(data.latest)}；无论如何更新到它都是安全的。`
          : data.newer ? `${have}最新${kind}为 ${esc(data.latest)}——可以更新。` : `${have}你的驱动已是最新（${esc(data.latest)}）。`;
        $("upddrv").hidden = !data.newer;
        $("upddrv").disabled = !data.newer;
        if (data.app) $("updr").innerHTML += data.appNewer ? ` 应用 ${esc(data.appHave)} -> ${esc(data.app)} 可以更新。` : ` 应用（${esc(data.appHave)}）已是最新。`;
        $("updapp").hidden = !data.appNewer;
        $("updapp").disabled = !data.appNewer;
      }
    }
    if (event === "appupd") {
      if (data.state === "error") { $("updapp").disabled = false; $("updr").innerHTML = `<span class="bad">${esc(data.why)}</span>`; }
      if (data.state === "start") $("updr").textContent = `正在下载 1401 ${data.version}...`;
      if (data.state === "restarting") $("updr").textContent = `1401 ${data.version} 校验通过——正在重启进入新版...`;
    }
    if (event === "run") {
      const busy = data.state === "start";
      ["dry", "go", "rm", "dl", "updchk", "upddrv", "upd", "updc"].forEach((b) => ($(b).disabled = busy));
      if (busy) { $("logwrap").hidden = false; $("log").textContent = ""; return; }
      if (data.why) { $("logwrap").hidden = false; logLine(data.why); }
      if (data.state === "cancelled") {
        if (S.driverUpdate) { S.driverUpdate = false; $("updr").textContent = "驱动更新已取消。"; }
        logLine("NOTE cancelled - nothing was changed"); post({ act: "scan" }); return;
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
        if (data.ok) { $("swu").hidden = false; $("updt").textContent = "Tahoe 准备就绪。打开软件更新并安装 macOS 26。"; logLine("OK ready for Tahoe - click Open Software Update and install macOS 26"); }
        else $("updt").textContent = "Tahoe 准备已停止。请查看上方的安装日志。";
      }
      if (data.mode === "tahoecancel") { $("swu").hidden = true; $("updt").textContent = data.ok ? "完成：驱动已设为启动加载。重启 Mac 即可生效。" : "已停止。请查看上方的安装日志。"; }
      post({ act: "scan" });
    }
  },
};
window.NM = NM;

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
$("updapp").onclick = () => { $("updapp").disabled = true; post({ act: "updateApp" }); };
$("upddrv").onclick = () => { S.driverUpdate = true; $("upddrv").disabled = true; $("updr").textContent = "正在下载最新驱动..."; post({ act: "updateDriver", efi: efi() }); };
$("ocg").onclick = (e) => { e.preventDefault(); post({ act: "open", url: "https://dortania.github.io/OpenCore-Install-Guide/" }); };
$("dry").onclick = () => post({ act: "run", mode: "dry", pkg: S.pkg, efi: efi() });
$("go").onclick = () => post({ act: "run", mode: "install", pkg: S.pkg, efi: efi() });
$("rm").onclick = () => { if (confirm("要移除 NullMoth 驱动并把你的 OpenCore 配置恢复原样吗？")) post({ act: "run", mode: "remove", pkg: "", efi: efi() }); };
$("rs").onclick = () => post({ act: "restart" });
$("vbon").onclick = () => post({ act: "verbose", on: true, efi: efi() });
$("vboff").onclick = () => post({ act: "verbose", on: false, efi: efi() });
$("blon").onclick = () => post({ act: "backlight", on: true, efi: efi() });
$("bloff").onclick = () => post({ act: "backlight", on: false, efi: efi() });
$("hdon").onclick = () => post({ act: "hidpi", on: true, efi: efi() });
$("hdoff").onclick = () => post({ act: "hidpi", on: false, efi: efi() });
$("gpuon").onclick = () => post({ act: "gputest", on: true, efi: efi() });
$("gpuoff").onclick = () => post({ act: "gputest", on: false, efi: efi() });
$("xeon").onclick = () => post({ act: "xe", on: true, efi: efi() });
$("xeoff").onclick = () => post({ act: "xe", on: false, efi: efi() });
$("armon").onclick = () => { $("armon").disabled = true; post({ act: "arm", op: "on" }); };
$("armoff").onclick = () => post({ act: "arm", op: "off" });
$("armreqon").onclick = () => { $("armreq").hidden = true; $("armon").disabled = true; post({ act: "arm", op: "on", from: "windows" }); };
$("armreqno").onclick = (e) => { e.preventDefault(); $("armreq").hidden = true; post({ act: "arm", op: "notNow" }); };
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
$("teston").onclick = () => post({ act: "tester", on: true });
$("testoff").onclick = () => post({ act: "tester", on: false });
$("earlyon").onclick = () => post({ act: "early", on: true });
$("earlyoff").onclick = () => post({ act: "early", on: false });
post({ act: "early" });
$("efichk").onclick = () => { $("efichk").disabled = true; $("efichkr").textContent = "正在读取 EFI..."; $("efiout").textContent = ""; post({ act: "checkEfi" }); };
$("tccg").onclick = () => { $("tccr").textContent = "请选择应用..."; post({ act: "tccGrant" }); };
$("gpumap").onclick = () => { $("gpumap").disabled = true; $("gpumapr").textContent = "启动中..."; post({ act: "gpumap" }); };
$("priv").onclick = (e) => { e.preventDefault(); post({ act: "privacy" }); };
$("logs").onclick = (e) => { e.preventDefault(); post({ act: "logs" }); };
$("src").onclick = (e) => { e.preventDefault(); post({ act: "open", url: "https://github.com/nullmoth/nvidia-macos-driver" }); };
post({ act: "scan" });

document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === b));
  ["drv", "efi", "tools", "usb", "crash"].forEach((t) => ($("t-" + t).hidden = t !== b.dataset.t));
  $("ttl").textContent = "1401 — " + b.dataset.title;
  if (b.dataset.t !== "usb") post({ act: "usbStop" });
}));
function setTheme(light) {
  $("desk").classList.toggle("light", light);
  try { localStorage.setItem("theme", light ? "light" : "dark"); } catch (e) { }
}
(() => {
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) { }
  const prefersLight = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches;
  $("desk").classList.toggle("light", saved ? saved === "light" : prefersLight);
})();
$("theme").onclick = () => setTheme(!$("desk").classList.contains("light"));
$("efimount").onclick = () => { $("efimount").disabled = true; $("efimountr").textContent = "正在查找 EFI..."; post({ act: "mountEfi" }); };
const CONN = [[0, "USB 2 Type-A"], [3, "USB 3 Type-A"], [9, "USB-C（可正反插）"], [10, "USB-C（单向）"], [255, "机内端口"]];
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
    h += `<table class="pc ports" border="1" cellspacing="2" cellpadding="3"><caption>控制器 ${esc(c.controller)} (${esc(c.vendor)}:${esc(c.device)}) &mdash; <span class="${n > 15 ? "bad" : ""}">已选 ${n} / 15</span></caption><tr><th>使用</th><th>端口</th><th>已见</th><th>插头类型</th><th>当前设备</th></tr>`;
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
    U.off.delete(c + "/" + p); U.pick[c][p] = +s.value; usbRender();
  }));
}
$("uw").onclick = () => { U.pick = {}; U.off = new Set(); U.last = ""; post({ act: "usbStart" }); $("uw").textContent = "监听中..."; $("uw").disabled = true; };
$("uwr").onclick = () => { $("uerr").textContent = ""; post({ act: "usbStop" }); post({ act: "usbWrite", sel: U.pick, efi: efi() }); };
$("mk").onclick = () => post({ act: "crashReport" });
$("cf").onclick = () => post({ act: "open", url: "https://buymeacoffee.com/nullmoth" });
$("cr").onclick = () => post({ act: "open", url: "https://github.com/nullmoth/1401/blob/main/NOTICE.md" });
$("sl").onclick = () => { $("sl").disabled = true; $("slr").textContent = "正在收集并发送..."; post({ act: "sendLogs" }); };
$("fl").onclick = () => { $("sl").disabled = true; $("fl").disabled = true; $("slr").textContent = "正在录制屏幕 20 秒后发送..."; post({ act: "sendLogs", sample: "flicker" }); };
$("od").onclick = () => post({ act: "optionalDiagnostics" });
$("dr").onclick = () => post({ act: "importDiagnosticReceipt" });
$("up").onclick = () => post({ act: "open", url: "https://nullmothsystems.com/#send" });
const prevOn = NM.on;
NM.on = (m) => {
  if (m.event === "diagnosticsStatus") { $("odr").textContent = m.data.text; return; }
  if (m.event === "diagnosticReceipt") { $("drr").textContent = m.data.text; return; }
  if (m.event === "usb") {
    const snap = JSON.stringify([m.data.controllers, m.data.seen]);
    if (snap === U.last) return;
    U.last = snap;
    U.ctrls = m.data.controllers; U.seen = m.data.seen;
    for (const c of U.ctrls) {
      const key = c.key || c.controller;
      U.pick[key] = U.pick[key] || {};
      for (const p of c.ports) if ((U.seen[key] || []).includes(p.name) && !(p.name in U.pick[key]) && !U.off.has(key + "/" + p.name)) U.pick[key][p.name] = usbConnectorDefault(p);
    }
    usbRender(); return;
  }
  if (m.event === "usbErr") { $("uerr").textContent = m.data; return; }
  if (m.event === "early") {
    $("earlyr").textContent = m.data.on ? "已开启：新驱动会先到达这台 Mac，然后才向所有人提供。" : "已关闭：本机会在新版本经过先行用户验证后才收到更新。";
    $("earlyon").hidden = m.data.on; $("earlyoff").hidden = !m.data.on;
    return;
  }
  if (m.event === "arm") { armEvent(m.data); return; }
  if (m.event === "tester") {
    $("testr").innerHTML = m.data.ok ? `<span class="good">${m.data.on ? "已加入：每次重启后会发送一份报告。" : "已退出：不再运行任何东西。"}</span>`
                                     : `<span class="warn">${esc(m.data.why)}</span>`;
    return;
  }
  if (m.event === "logsStatus") { $("slr").textContent = m.data.text; return; }
  if (m.event === "efiCheck") {
    const d = m.data;
    $("efichk").disabled = false;
    $("efiout").textContent = "";
    if (d.cancelled) { $("efichkr").textContent = ""; return; }
    if (!d.ok) { $("efichkr").innerHTML = `<span class="warn">${esc(d.why || "检查未能完成。")}</span>`; return; }
    const n = d.issues.length;
    $("efin").hidden = !n; $("efin").textContent = n;
    $("efichkr").innerHTML = n ? `<span class="warn">${esc(d.partition)} 中有 ${n} 处需要修改</span>`
                               : `<span class="good">${esc(d.partition)} 中未发现问题</span>`;
    for (const i of d.issues) {
      const box = document.createElement("details"), sum = document.createElement("summary"), b = document.createElement("b");
      b.textContent = i.title; sum.appendChild(b); box.appendChild(sum);
      const what = document.createElement("p"); what.textContent = i.what + (i.restart ? " 下次重启后生效。" : ""); box.appendChild(what);
      if ((i.now || []).length) {
        const now = document.createElement("div"); now.className = "now";
        const lab = document.createElement("b"); lab.textContent = "本机当前值： "; now.appendChild(lab);
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
      note.textContent = "编辑 config.plist 之前，请先留一份副本。如果某项修改导致本机无法启动，请从你的 1401 U 盘启动并把副本放回去。";
      $("efiout").appendChild(note);
    }
    return;
  }
  if (m.event === "efiMount") {
    $("efimount").disabled = false;
    $("efimountr").innerHTML = m.data.cancelled ? "" : m.data.ok ? `<span class="good">已将 ${esc(m.data.partition)} 挂载到 ${esc(m.data.where)}</span>`
                                                              : `<span class="warn">${esc(m.data.why || "无法挂载 EFI。")}</span>`;
    return;
  }
  if (m.event === "tccStatus") { $("tccr").innerHTML = m.data.text ? `<span class="${m.data.ok ? "good" : "warn"}">${esc(m.data.text)}</span>` : ""; return; }
  if (m.event === "gpumapStatus") { $("gpumapr").textContent = m.data.text; if (m.data.done) $("gpumap").disabled = false; return; }
  if (m.event === "logsDone") {
    const d = m.data;
    $("sl").disabled = false; $("fl").disabled = false;
    $("slr").innerHTML = d.ok ? `<span class="good">已发送。报告编号 ${esc(d.ids.join(", "))}</span>——求助时请引用它。` + (d.errors.length ? `<br><span class="warn">未发送：${esc(d.errors.join("; "))}</span>` : "")
                              : `<span class="warn">${esc(d.why || ("没有发送任何内容：" + (d.errors || []).join("; ")))}</span>`;
    if (d.localPath) $("slr").innerHTML += "<br>报告文件已保存在本地。打开日志可找到它们，或重试发送日志。";
    return;
  }
  if (m.event === "crashDone") { $("cr").innerHTML = m.data.ok ? `<span class="good">已保存到你的桌面：</span> ${esc(m.data.path.split("/").pop())}` : `<span class="warn">${esc(m.data.why)}</span>`; return; }
  if (m.event === "scan" && m.data.crashes) $("cr").textContent = m.data.crashes.length ? `本机有 ${m.data.crashes.length} 个提及驱动的崩溃文件。` : "本机没有提及驱动的崩溃记录。";
  if (m.event === "scan" && m.data.itlwmNeedsHeliPort) {
    setTimeout(() => $("verdict").insertAdjacentHTML("beforeend", '<p class="warn">Wi-Fi：本机的 Intel Wi-Fi 使用 itlwm 驱动，它需要通过自己的应用 HeliPort 来连接网络，而不是 Wi-Fi 菜单。请从 github.com/OpenIntelWireless/HeliPort/releases 下载 HeliPort，移到应用程序文件夹并打开，在那里选择你的网络。要开机自启，请在其菜单中打开"登录时启动"。</p>'), 0);
  }
  if (m.event === "scan" && m.data.safemode) {
    setTimeout(() => {
      $("verdict").insertAdjacentHTML("afterbegin", '<p class="warn">本机是在 NVIDIA 驱动被关闭的状态下启动的：boot-args 里有 -nvoff。macOS 更新期间 1401 会自动加入它，也有人在黑屏后手动加它。如果你为 macOS 26 更新做过准备，请现在从系统设置更新 macOS，更新后驱动会自动恢复。不想更新就恢复驱动，或更新后驱动仍关闭时，点击"重新开启驱动"，然后重启。如果开启驱动后黑屏，请先发送日志（下方的"向 NullMoth 发送日志"）。要永久移除驱动，请点击下方的"卸载驱动"。</p><p class="row"><button type="button" class="b go" id="nvon">重新开启驱动</button></p>');
      $("nvon").onclick = () => { $("nvon").disabled = true; post({ act: "osupdate", cancel: true, efi: efi() }); };
    }, 0);
  }
  prevOn(m);
};
window.NM = NM;
