/* 配置管理：账户与凭据 / 邮箱 / 高级（原始 JSON） */
import { h, card, refreshStatus, api, toast } from "../app.js";

const FIELDS = [
  ["name", "账户名", "台账 sheet 名；唯一、不含 /"],
  ["buff_cookie", "BUFF Cookie", "浏览器 F12 复制整条（重要）"],
  ["youpin_token", "悠悠 Token", "不用悠悠可留空"],
  ["steamid", "SteamID64", "库存归属纠偏用；不确定可留空（默认按账户名）"],
];

let cfg = null;

export async function render(view) {
  try {
    cfg = (await api("/api/config")).config;
  } catch (e) {
    view.append(card("配置读取失败", e.message,
      h("div", { class: "hint", text: "把「爬虫配置模板.json」复制成「爬虫配置.json」（与程序同级）后刷新。" })));
    return;
  }
  if (!Array.isArray(cfg.accounts)) cfg.accounts = [];

  const accBox = h("div");
  const emailBox = h("div");

  view.append(card("账户与凭据", "改动直接保存到本地 爬虫配置.json，立即生效。",
    accBox,
    h("div", { class: "row", style: "margin-top:12px" },
      h("div", {}, h("button", { class: "btn", text: "+ 添加账户", onclick: () => editAcc(-1) })))));
  view.append(card("邮箱配置", "价格提醒 / 期望校验的发信参数。",
    emailBox));
  view.append(card("高级：原始 JSON", "整文件编辑（含 smtp/节流等全部字段）。改完点保存，语法错误会被拦下。",
    rawBox()));

  renderAcc();
  renderEmail();

  /* ---------- 账户 ---------- */
  function renderAcc() {
    accBox.innerHTML = "";
    if (!cfg.accounts.length) {
      accBox.append(h("div", { class: "empty", text: "还没有账户 —— 点下面「添加账户」" }));
      return;
    }
    accBox.append(h("table", { class: "tbl" },
      h("thead", {}, h("tr", {},
        h("th", { text: "账户名" }), h("th", { text: "BUFF" }), h("th", { text: "悠悠" }),
        h("th", { text: "SteamID64" }), h("th", { text: "操作" }))),
      h("tbody", {}, cfg.accounts.map((a, i) => h("tr", {},
        h("td", { text: a.name || "（缺名）" }),
        h("td", {}, tag(!!a.buff_cookie, "可用", "未填")),
        h("td", {}, tag(!!a.youpin_token, "可用", "未填")),
        h("td", { class: "mono", style: "font-size:12px", text: a.steamid || "—" }),
        h("td", {},
          h("button", { class: "btn sm", text: "编辑", onclick: () => editAcc(i) }),
          " ",
          h("button", { class: "btn sm danger", text: "删除", onclick: () => delAcc(i) })))))));
  }

  function editAcc(i) {
    const isNew = i < 0;
    const src = isNew ? { name: "", buff_cookie: "", youpin_token: "", steamid: "" } : cfg.accounts[i];
    const inputs = {};
    const form = h("div", { class: "card", style: "background:#fafbfc" });
    form.append(h("h2", { text: isNew ? "添加账户" : `编辑「${src.name}」` }));
    for (const [k, label, hint] of FIELDS) {
      inputs[k] = h("input", { class: "inp", value: src[k] || "" });
      form.append(h("label", { class: "f", text: label }), inputs[k],
        h("div", { class: "hint", text: hint }));
    }
    const save = h("button", { class: "btn primary", text: "保存" });
    save.onclick = () => {
      const item = {
        ...(isNew ? {} : cfg.accounts[i]),
        name: inputs.name.value.trim(),
        buff_cookie: inputs.buff_cookie.value.trim(),
        youpin_token: inputs.youpin_token.value.trim(),
      };
      const sid = inputs.steamid.value.trim();
      if (sid) item.steamid = sid; else delete item.steamid;
      if (!item.name) return toast("账户名必填", "err");
      if (item.name.includes("/")) return toast("账户名不能含 /", "err");
      const dup = cfg.accounts.some((a, j) => j !== i && (a.name || "") === item.name);
      if (dup) return toast("账户名已存在", "err");
      if (isNew) cfg.accounts.push(item); else cfg.accounts[i] = item;
      saveConfig({ accounts: cfg.accounts }, () => renderAcc());
    };
    form.append(h("div", { class: "row", style: "margin-top:12px" },
      h("div", {}, save), h("div", {}, h("button", { class: "btn", text: "取消", onclick: () => form.remove() }))));
    accBox.append(form);
    inputs.name.focus();
  }

  async function delAcc(i) {
    const a = cfg.accounts[i];
    if (!confirm(`确认删除账户「${a.name}」？（不影响文件里的其它配置）`)) return;
    cfg.accounts.splice(i, 1);
    saveConfig({ accounts: cfg.accounts }, () => renderAcc());
  }

  /* ---------- 邮箱 ---------- */
  function renderEmail() {
    emailBox.innerHTML = "";
    const em = (cfg.email && typeof cfg.email === "object") ? cfg.email : (cfg.email = {});
    const inputs = {};
    for (const [k, label, hint] of [
      ["smtp_server", "SMTP 服务器", "默认 smtp.qq.com"],
      ["smtp_port", "端口", "默认 465（SSL）"],
      ["sender", "发件邮箱", "如 xxx@qq.com"],
      ["auth_code", "授权码", "邮箱设置里生成，不是登录密码"],
      ["to", "默认收件邮箱", "留空 = 发给发件邮箱自己"],
    ]) {
      inputs[k] = h("input", { class: "inp", value: em[k] ?? (k === "smtp_server" ? "smtp.qq.com" : k === "smtp_port" ? 465 : "") });
      emailBox.append(h("label", { class: "f", text: label }), inputs[k],
        h("div", { class: "hint", text: hint }));
    }
    const cks = {};
    for (const [k, label] of [["send_price", "材料降价提醒邮件"], ["send_expect", "期望校验邮件"]]) {
      cks[k] = h("input", { type: "checkbox", checked: em[k] !== false });
      emailBox.append(h("label", { class: "f", style: "display:flex;gap:8px;align-items:center" },
        cks[k], label + "（勾选=开启）"));
    }

    const st = em.sheet_to && typeof em.sheet_to === "object" ? em.sheet_to : (em.sheet_to = {});
    emailBox.append(h("label", { class: "f", text: "按账户分发（账户名 → 收件邮箱；不配则全部发给默认收件人）" }));
    emailBox.append(h("table", { class: "tbl" }, h("tbody", {}, Object.entries(st).map(([k, v]) =>
      h("tr", {}, h("td", { text: k }), h("td", { text: v }),
        h("td", { style: "width:60px" }, h("button", { class: "btn sm danger", text: "删",
          onclick: () => { delete st[k]; renderEmail(); } })))))));
    const kIn = h("input", { class: "inp", placeholder: "账户名（与台账 sheet 名一字不差）" });
    const vIn = h("input", { class: "inp", placeholder: "收件邮箱" });
    emailBox.append(h("div", { class: "row", style: "margin-top:8px" }, kIn, vIn,
      h("div", { class: "narrow" }, h("button", { class: "btn sm", text: "添加", onclick: () => {
        const k = kIn.value.trim(), v = vIn.value.trim();
        if (!k || !v.includes("@")) return toast("账户名必填、邮箱要含 @", "err");
        st[k] = v; renderEmail();
      } }))));

    emailBox.append(h("div", { class: "row", style: "margin-top:14px" },
      h("div", {}, h("button", { class: "btn primary", text: "保存邮箱配置", onclick: () => {
        const obj = {
          ...em,
          smtp_server: inputs.smtp_server.value.trim(),
          smtp_port: parseInt(inputs.smtp_port.value || "465", 10),
          sender: inputs.sender.value.trim(),
          auth_code: inputs.auth_code.value.trim(),
          to: inputs.to.value.trim(),
          send_price: cks.send_price.checked,
          send_expect: cks.send_expect.checked,
          sheet_to: st,
        };
        if (isNaN(obj.smtp_port)) return toast("端口必须是数字", "err");
        cfg.email = obj;
        saveConfig({ email: obj }, () => { renderEmail(); toast("邮箱配置已保存", "ok"); });
      } }))));
  }

  /* ---------- 高级 ---------- */
  function rawBox() {
    const ta = h("textarea", { class: "inp mono", style: "min-height:260px;font-size:12.5px" });
    ta.value = JSON.stringify(cfg, null, 2);
    const save = h("button", { class: "btn primary", text: "保存整份配置" });
    save.onclick = async () => {
      try {
        await api("/api/config/save", { method: "POST", body: { text: ta.value } });
        toast("已保存", "ok");
        cfg = (await api("/api/config")).config;
        renderAcc(); renderEmail();
      } catch (e) { toast(e.message, "err"); }
    };
    const reload = h("button", { class: "btn", text: "重新载入" });
    reload.onclick = async () => {
      cfg = (await api("/api/config")).config;
      ta.value = JSON.stringify(cfg, null, 2);
      renderAcc(); renderEmail();
      toast("已重新载入", "info");
    };
    return h("div", {}, ta,
      h("div", { class: "row", style: "margin-top:10px" }, h("div", {}, save), h("div", {}, reload)));
  }

  async function saveConfig(payload, after) {
    try {
      await api("/api/config/save", { method: "POST", body: payload });
      toast("已保存", "ok");
      refreshStatus().catch(() => {});
      if (after) after();
    } catch (e) { toast(e.message, "err"); }
  }
}

function tag(ok, yes, no) {
  return h("span", { class: "tag " + (ok ? "ok" : "warn"), text: ok ? yes : no });
}
