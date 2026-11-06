/* BuffToolkit 浏览器界面 —— 核心：路由 / API / 公共组件（原生 ES 模块，无构建） */

/* ---------- DOM 工厂 ---------- */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(9)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/* ---------- API ---------- */
export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let obj;
  try { obj = await res.json(); } catch { throw new Error("HTTP " + res.status); }
  if (!obj.ok) throw new Error(obj.error || "HTTP " + res.status);
  return obj.data;
}

/* ---------- toast ---------- */
export function toast(msg, type = "info") {
  const el = h("div", { class: "toast " + type, text: msg });
  document.getElementById("toast-wrap").append(el);
  setTimeout(() => el.remove(), type === "err" ? 6000 : 3000);
}

/* ---------- 全局状态 ---------- */
export const State = { status: null };

export async function refreshStatus() {
  const st = await api("/api/status");
  State.status = st;
  const chip = document.getElementById("sub-chip");
  document.getElementById("ver").textContent = "v" + st.version;
  const sub = st.subscribe || {};
  if (sub.local) {
    chip.className = "chip local";
    chip.textContent = "本地自用模式 · 功能全开";
  } else if (sub.active) {
    chip.className = "chip ok";
    const left = sub.left >= 0 ? ` | 本月炼金剩余 ${sub.left}/${sub.quota}` : "";
    chip.textContent = `已激活 · ${sub.holder || ""} · ${sub.exp_str} 到期${left}`;
  } else {
    chip.className = "chip bad";
    chip.textContent = "未激活 —— 点此激活（选「订阅管理」）";
  }
  chip.onclick = () => { location.hash = "#/subscribe"; };
  return st;
}

/* ---------- 长任务面板 ---------- */
/* 用法：const job = jobRunner(el, slug, args, title, onDone, opts)
   onDone(job) 在结束时回调（用于刷新页面数据）；
   opts.start: 自定义启动函数（默认 POST /api/jobs/start；如 Steam 登录走专用接口）；
   opts.onLines(chunk, allText): 每次收到增量输出时回调（用于检测关键字，如「需要验证码」）；
   返回 {stop}。 */
export function jobRunner(container, slug, args, title, onDone, opts = {}) {
  container.innerHTML = "";
  const stat = h("span", { class: "tag info", text: "启动中…" });
  const stopBtn = h("button", { class: "btn sm danger", text: "停止",
    onclick: () => api("/api/jobs/stop", { method: "POST", body: { id: jid } })
      .catch(e => toast(e.message, "err")) });
  const log = h("div", { class: "job-log", text: "" });
  container.append(
    h("div", { class: "job-head" },
      h("div", { class: "row", style: "align-items:center" },
        h("b", { text: title }), stat),
      stopBtn),
    log);
  let jid = null, from = 0, timer = null, done = false, allText = "";

  async function tick() {
    try {
      const d = await api(`/api/jobs/poll?id=${jid}&from=${from}`);
      if (d.lines && d.lines.length) {
        const chunk = d.lines.join("\n");
        log.textContent += (log.textContent ? "\n" : "") + chunk;
        allText += (allText ? "\n" : "") + chunk;
        log.scrollTop = log.scrollHeight;
        from = d.next;
        if (opts.onLines) { try { opts.onLines(chunk, allText); } catch (_) {} }
      }
      if (d.status === "running") { stat.textContent = "运行中…"; stat.className = "tag info"; return; }
      // 结束
      clearInterval(timer);
      done = true;
      stopBtn.remove();
      if (d.status === "done") {
        stat.textContent = `完成（${d.ended}）`; stat.className = "tag ok";
      } else {
        stat.textContent = `失败（退出码 ${d.rc}，${d.ended}）`; stat.className = "tag bad";
        toast(`${title} 退出码 ${d.rc}`, "err");
      }
      if (onDone) onDone(d, allText);
    } catch (e) {
      clearInterval(timer);
      stat.textContent = "中断：" + e.message; stat.className = "tag bad";
      if (onDone) onDone(null, allText);
    }
  }

  (async () => {
    try {
      const d = opts.start
        ? await opts.start()
        : await api("/api/jobs/start", { method: "POST", body: { slug, args } });
      jid = d.id;
      timer = setInterval(tick, 800);
      tick();
    } catch (e) {
      stat.textContent = "启动失败"; stat.className = "tag bad";
      log.textContent = e.message;
      stopBtn.remove();
      if (e.message.includes("正在运行")) toast(e.message, "err");
    }
  })();

  return { stop: () => { if (!done && jid) stopBtn.click(); } };
}

/* ---------- 常用小组件 ---------- */
export function card(title, desc, ...children) {
  return h("div", { class: "card" },
    title ? h("h2", { text: title }) : null,
    desc ? h("div", { class: "desc", text: desc }) : null,
    ...children);
}

export function statBox(k, v, cls = "") {
  return h("div", { class: "stat" },
    h("div", { class: "k", text: k }),
    h("div", { class: "v " + cls, text: v }));
}

export async function loadAccounts() {
  const st = State.status || await refreshStatus();
  return st.accounts || [];
}

/* ---------- 路由 ---------- */
const NAV = [
  ["/", "首页"],
  ["/calc", "炼金期望计算"],
  ["/price", "材料邮件提醒"],
  ["/stock", "库存记录"],
  ["/tools", "开炉工具"],
  ["/subscribe", "订阅管理"],
  ["/config", "配置管理"],
];

const ROUTES = {
  "/":            () => import("./pages/home.js"),
  "/calc":        () => import("./pages/calc.js"),
  "/price":       () => import("./pages/price.js"),
  "/stock":       () => import("./pages/stock.js"),
  "/tools":       () => import("./pages/tools.js"),
  "/subscribe":   () => import("./pages/subscribe.js"),
  "/config":      () => import("./pages/config.js"),
};

function buildNav() {
  const nav = document.getElementById("nav");
  for (const [path, label] of NAV) {
    nav.append(h("a", { class: "nav-item", href: "#" + path, text: label,
      dataset: { path } }));
  }
}

async function render() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const path = hash.split("?")[0];
  const use = ROUTES[path] ? path : "/";
  document.querySelectorAll(".nav-item").forEach(a =>
    a.classList.toggle("active", a.dataset.path === use));
  const view = document.getElementById("view");
  view.innerHTML = "";
  try {
    const mod = await ROUTES[use]();
    await mod.render(view);
  } catch (e) {
    view.append(card("页面加载失败", String(e)));
  }
}

/* ---------- 启动 ---------- */
buildNav();
window.addEventListener("hashchange", render);
render();
refreshStatus().catch(e => {
  const chip = document.getElementById("sub-chip");
  chip.className = "chip bad"; chip.textContent = "服务连接失败：" + e.message;
});
