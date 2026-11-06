/* 库存记录：同步 / 查询 / 缺料核对 / 买卖记录 / 导出 / 输出浏览 */
import { h, card, refreshStatus, api, toast, jobRunner, State } from "../app.js";

export async function render(view) {
  const st = await refreshStatus();
  const accs = st.accounts || [];
  const buffAccs = accs.filter(a => a.buff_ok);

  /* ---------- 同步（Steam 官方通道）/ 买卖记录（BUFF 通道） ---------- */
  const findAcc = name => accs.find(x => x.name === name) || {};
  let steamOk = new Set(accs.filter(a => a.steam_ok).map(a => a.name));

  // —— Steam 官方通道（令牌验证器登录为主，扫码备用；令牌长期有效，仅拉库存） ——
  const steamBox = h("div");
  const qrBox = h("div", { style: "display:none;margin-top:14px" });
  let qrTimer = null;
  const stopQr = () => {
    if (qrTimer) { clearInterval(qrTimer); qrTimer = null; }
    qrBox.style.display = "none";
    qrBox.innerHTML = "";
  };
  const startQr = () => {
    stopQr();
    qrBox.style.display = "";
    const img = h("img", { class: "qr-img", alt: "Steam 登录二维码" });
    img.onerror = () => { img.style.display = "none"; };
    img.onload = () => { img.style.display = ""; };
    qrBox.append(img, h("div", { class: "hint",
      text: "打开手机 Steam App → 扫一扫 → 确认登录（二维码约 5 分钟内有效）。令牌只存本机，仅用于读取库存。" }));
    const tick = () => { img.src = "/api/steam-qr?t=" + Date.now(); };
    tick();
    qrTimer = setInterval(tick, 2000);
  };
  const steamSel = h("select", { class: "inp" },
    accs.length
      ? accs.map(a => h("option", { value: a.name,
          text: `${a.name}${steamOk.has(a.name) ? "（已登录 Steam）" : "（未登录）"}${a.steamid ? " · " + a.steamid : ""}` }))
      : [h("option", { text: "配置里没有账户 —— 先去配置管理" })]);

  // 令牌验证器登录表单（默认收起；密码只用于本次换长期令牌，不保存）
  const loginForm = h("div", { style: "display:none;margin-top:14px" });
  const accIn = h("input", { class: "inp", placeholder: "Steam 账号名（登录名，不是昵称）", autocomplete: "off" });
  const pwdIn = h("input", { class: "inp", type: "password", placeholder: "Steam 密码", autocomplete: "off" });
  const loginGo = h("button", { class: "btn primary", text: "开始登录" });
  const codeRow = h("div", { style: "display:none;margin-top:10px" });
  const codeIn = h("input", { class: "inp", placeholder: "验证码（令牌验证器 5 位动态码 / 邮箱码）", autocomplete: "off" });
  const codeGo = h("button", { class: "btn primary", text: "提交验证码" });
  const loginLog = h("div", { style: "margin-top:10px" });
  const openLoginForm = () => {
    stopQr();
    loginForm.style.display = "";
    codeRow.style.display = "none";
    accIn.focus();
  };
  const doLogin = () => {
    const sa = accIn.value.trim(), pw = pwdIn.value;
    if (!sa || !pw) return toast("先填 Steam 账号名和密码", "err");
    loginLog.innerHTML = "";
    codeRow.style.display = "none";
    jobRunner(loginLog, "steam-login-code", null,
      `Steam 登录「${steamSel.value}」（令牌验证器）`, afterLogin, {
        start: () => api("/api/steam-login-code", { method: "POST", body: {
          account: steamSel.value, steam_account: sa, password: pw } }),
        onLines: chunk => {
          if (chunk.includes("需要验证码") || chunk.includes("码不对/已过期")) {
            codeRow.style.display = "";
            codeIn.value = "";
            codeIn.focus();
            toast("需要验证码：手机 Steam App → Steam 令牌 → 令牌验证器", "info");
          }
        },
      });
    pwdIn.value = "";   // 发起后立刻清掉页面里的密码（node 已从环境变量取走）
  };
  loginGo.onclick = doLogin;
  pwdIn.onkeydown = e => { if (e.key === "Enter") doLogin(); };
  codeGo.onclick = () => {
    const c = codeIn.value.trim();
    if (!c) return toast("先填验证码", "err");
    api("/api/steam-code", { method: "POST", body: { code: c } })
      .then(() => { toast("已提交验证码，等待验证结果…", "ok"); codeIn.value = ""; })
      .catch(e => toast(e.message, "err"));
  };
  codeIn.onkeydown = e => { if (e.key === "Enter") codeGo.click(); };
  loginForm.append(
    h("div", { class: "row" }, accIn),
    h("div", { class: "row", style: "margin-top:8px" }, pwdIn),
    h("div", { class: "row", style: "margin-top:8px" }, h("div", { class: "narrow" }, loginGo),
      h("div", { class: "hint", text: "账号密码只用于本次换取长期令牌：不保存、不落盘；登录成功后手机不用再操作，之后一键同步。" })),
    codeRow,
    loginLog);
  codeRow.append(
    h("div", { class: "row" }, codeIn, h("div", { class: "narrow" }, codeGo)),
    h("div", { class: "hint", text: "验证码 30 秒一换：手机 Steam App → 右下角菜单 →「Steam 令牌」→ 令牌验证器。超时/填错会提示重取，再填一次即可。" }));

  const steamMain = h("button", { class: "btn primary" });
  const steamRelog = h("button", { class: "btn", text: "重新登录", style: "display:none" });
  const steamQr = h("button", { class: "btn sm", text: "扫码登录（备用）" });
  const refreshSteamBtn = () => {
    const ok = steamOk.has(steamSel.value);
    steamMain.textContent = ok ? "同步库存（Steam 通道）" : "令牌验证器登录";
    steamRelog.style.display = ok ? "" : "none";
  };
  const afterLogin = async () => {
    stopQr();
    loginForm.style.display = "none";
    codeRow.style.display = "none";
    try {
      const s2 = await refreshStatus();
      steamOk = new Set((s2.accounts || []).filter(a => a.steam_ok).map(a => a.name));
    } catch (e) { /* 状态刷新失败不影响后续点击时再查 */ }
    refreshSteamBtn();
  };
  steamSel.onchange = () => { loginForm.style.display = "none"; stopQr(); refreshSteamBtn(); };
  steamMain.onclick = () => {
    if (!accs.length) { location.hash = "#/config"; return toast("先到「配置管理」添加账户", "err"); }
    if (steamOk.has(steamSel.value)) {
      jobRunner(steamBox, "stock", ["--via", "steam", "--probe", "--account", steamSel.value],
        `同步「${steamSel.value}」库存（Steam）`);
    } else {
      openLoginForm();
    }
  };
  steamRelog.onclick = () => {
    if (!accs.length) { location.hash = "#/config"; return toast("先到「配置管理」添加账户", "err"); }
    openLoginForm();
  };
  steamQr.onclick = () => {
    if (!accs.length) { location.hash = "#/config"; return toast("先到「配置管理」添加账户", "err"); }
    loginForm.style.display = "none";
    startQr();
    jobRunner(steamBox, "steam-login", ["--account", steamSel.value, "--force"],
      `Steam 扫码登录「${steamSel.value}」`, afterLogin);
  };
  refreshSteamBtn();
  view.append(card("同步库存 · Steam 通道",
    "官方通道：用手机 Steam App 的「令牌验证器」登录（推荐；密码只换令牌、不保存），或扫码登录（备用）。令牌长期有效，仅拉库存、不操作账号，结果与游戏内一致。",
    h("div", { class: "row" }, steamSel,
      h("div", { class: "narrow" }, steamMain),
      h("div", { class: "narrow" }, steamRelog)),
    loginForm,
    qrBox,
    h("div", { class: "row", style: "margin-top:12px" }, h("div", { class: "narrow" }, steamQr)),
    h("div", { style: "margin-top:14px" }, steamBox)));

  // —— 买卖记录 · BUFF 通道（Cookie 直拉买入/卖出历史 → 账本 Excel） ——
  const ledBox = h("div");
  const ledSel = h("select", { class: "inp" },
    buffAccs.length
      ? buffAccs.map(a => h("option", { value: a.name, text: a.name }))
      : [h("option", { text: "没有可用的 BUFF Cookie —— 先去配置管理" })]);
  const ledBtn = h("button", { class: "btn primary", text: "拉取买卖记录（BUFF 通道）" });
  ledBtn.onclick = () => {
    if (!buffAccs.length) { location.hash = "#/config"; return toast("先到「配置管理」填好 BUFF Cookie", "err"); }
    jobRunner(ledBox, "ledger", ["--account", ledSel.value],
      `拉取「${ledSel.value}」买卖记录（BUFF）`);
  };
  view.append(card("买卖记录 · BUFF 通道",
    "用配置里的 BUFF Cookie 拉该账户的买入/卖出历史，生成账本 Excel（买入明细 / 卖出明细含盈亏）。",
    h("div", { class: "row" }, ledSel, h("div", { class: "narrow" }, ledBtn)),
    h("div", { style: "margin-top:14px" }, ledBox)));

  /* ---------- 查询 ---------- */
  const qBox = h("div");
  const qIn = h("input", { class: "inp", placeholder: "关键词（名字模糊，多个用逗号分隔；留空=全部）" });
  const qBtn = h("button", { class: "btn primary", text: "查询库存" });
  qBtn.onclick = () => {
    const kw = qIn.value.trim();
    jobRunner(qBox, "query", kw ? ["--name", kw] : [], "库存查询");
  };
  qIn.onkeydown = e => { if (e.key === "Enter") qBtn.click(); };
  view.append(card("查询库存", "离线查询（读本地上次的库存快照）。",
    h("div", { class: "row" }, qIn, h("div", { class: "narrow" }, qBtn)),
    h("div", { style: "margin-top:14px" }, qBox)));

  /* ---------- 缺料 / 核对 / 账本 ---------- */
  const tBox = h("div");
  const tool = (slug, title, desc, args = []) =>
    h("div", { class: "entry", onclick: () => jobRunner(tBox, slug, args, title) },
      h("div", { class: "t", text: title }), h("div", { class: "d", text: desc }));
  view.append(card("分析与账本", "结果输出显示在下方。",
    h("div", { class: "grid2" },
      tool("match", "缺料分析", "看配方组还差什么材料、缺最多的是什么"),
      tool("cover", "材料核对", "台账材料 vs 库存覆盖情况")),
    h("div", { style: "margin-top:14px" }, tBox)));

  /* ---------- 导出客户版 ---------- */
  const exBox = h("div");
  const exSel = h("select", { class: "inp" },
    [h("option", { value: "", text: "全部账户" }),
      ...accs.map(a => h("option", { value: a.name, text: a.name }))]);
  const exAll = h("input", { type: "checkbox" });
  const exBtn = h("button", { class: "btn primary", text: "导出客户版" });
  exBtn.onclick = async () => {
    exBtn.disabled = true;
    exBox.innerHTML = "";
    try {
      const d = await api("/api/stock/export", { method: "POST", body: {
        account: exSel.value || null, all: exAll.checked } });
      exBox.append(h("div", { class: "job-log", text: d.output || "（无输出）" }));
      if (d.result) {
        toast("已生成：" + d.result, "ok");
        exBox.append(h("div", { class: "row", style: "margin-top:10px" },
          h("div", {}, h("button", { class: "btn sm", text: "打开输出目录",
            onclick: () => api("/api/open", { method: "POST", body: { dir: "output", sub: "库存" } })
              .catch(e => toast(e.message, "err")) }))));
      }
    } catch (e) { toast(e.message, "err"); }
    finally { exBtn.disabled = false; }
  };
  view.append(card("导出客户版", "按台账筛出炼金材料生成干净的 Excel（手工行保留）。",
    h("div", { class: "row" }, exSel,
      h("div", { class: "narrow" }, h("label", { style: "display:flex;gap:6px;align-items:center" },
        exAll, "不筛选（全量）")),
      h("div", { class: "narrow" }, exBtn)),
    h("div", { style: "margin-top:14px" }, exBox)));

  /* ---------- 输出目录浏览 ---------- */
  const fBox = h("div");
  view.append(card("输出目录", "程序生成的文件都在这里（可下载/打开）。", fBox));
  browser(fBox, "output", "库存");
}

function browser(box, dir, sub) {
  async function load() {
    box.innerHTML = "";
    const crumbs = h("div", { class: "row", style: "margin-bottom:10px;align-items:center" });
    const rootName = dir === "output" ? "输出" : "日志";
    crumbs.append(h("a", { class: "nav-item", style: "display:inline-block;padding:4px 10px",
      text: "◀ " + rootName, onclick: () => { sub = ""; load(); } }));
    let acc = "";
    for (const part of (sub ? sub.split("/") : [])) {
      acc = acc ? acc + "/" + part : part;
      const at = acc;
      crumbs.append(" / ", h("a", { class: "nav-item", style: "display:inline-block;padding:4px 10px",
        text: part, onclick: () => { sub = at; load(); } }));
    }
    box.append(crumbs);
    try {
      const d = await api(`/api/files?dir=${dir}&sub=${encodeURIComponent(sub)}`);
      if (!d.items.length) { box.append(h("div", { class: "empty", text: "（空目录）" })); return; }
      box.append(h("table", { class: "tbl" },
        h("thead", {}, h("tr", {}, h("th", { text: "名称" }), h("th", { text: "大小" }),
          h("th", { text: "修改时间" }), h("th", { text: "操作" }))),
        h("tbody", {}, d.items.map(it => h("tr", {},
          h("td", { text: it.name + (it.is_dir ? "（目录）" : "") }),
          h("td", { class: "mono", style: "font-size:12px", text: it.is_dir ? "—" : fmtSize(it.size) }),
          h("td", { class: "mono", style: "font-size:12px", text: it.mtime }),
          h("td", {}, it.is_dir
            ? h("button", { class: "btn sm", text: "进入", onclick: () => { sub = sub ? sub + "/" + it.name : it.name; load(); } })
            : h("span", {},
                h("button", { class: "btn sm", text: "下载",
                  onclick: () => { location.href = `/api/download?dir=${dir}&sub=${encodeURIComponent(sub ? sub + "/" + it.name : it.name)}`; } }),
                " ",
                h("button", { class: "btn sm", text: "打开",
                  onclick: () => api("/api/open", { method: "POST", body: { dir, sub: sub ? sub + "/" + it.name : it.name } })
                    .catch(e => toast(e.message, "err")) }))))))));
    } catch (e) {
      box.append(h("div", { class: "empty", text: "读取失败：" + e.message }));
    }
  }
  load();
}

function fmtSize(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}
