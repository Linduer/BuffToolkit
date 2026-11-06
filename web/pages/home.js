/* 首页：状态总览 + 功能入口 + 最近任务 */
import { h, card, statBox, refreshStatus, api, toast } from "../app.js";

const ENTRIES = [
  ["/calc", "炼金期望计算", "实时拉价按利润率筛配方，可写台账"],
  ["/price", "材料邮件提醒", "扫材料到价按号发邮件"],
  ["/stock", "库存记录", "同步库存 / 查询 / 缺料 / 账本 / 导出"],
  ["/tools", "开炉工具", "配料寻优 + 主材料调价"],
  ["/subscribe", "订阅管理", "查看状态 / 输入密钥激活"],
  ["/config", "配置管理", "账户与凭据 / 邮箱"],
];

export async function render(view) {
  const st = await refreshStatus();
  const sub = st.subscribe || {};
  const accs = st.accounts || [];
  const okN = accs.filter(a => a.buff_ok).length;

  const subCls = sub.local ? "ok" : sub.active ? "ok" : "bad";
  const subText = sub.local ? "本地自用（全开）"
    : sub.active ? `正常 · ${sub.exp_str} 到期`
    : (sub.reason || "未激活");

  view.append(card("运行状态", null,
    h("div", { class: "grid3" },
      statBox("订阅状态", subText, subCls),
      statBox("账户", `${accs.length} 个（BUFF 可用 ${okN} 个）`, accs.length ? "" : "warn"),
      statBox("发信配置", st.email_ready ? "就绪" : "未配全", st.email_ready ? "ok" : "warn")),
    !st.config_exists ? h("div", { class: "hint warn",
      text: "⚠ 找不到 爬虫配置.json —— 先到「配置管理」创建账户，或把「爬虫配置模板.json」复制成它" }) : null));

  view.append(card("功能", null,
    h("div", { class: "grid3" },
      ENTRIES.map(([path, t, d]) =>
        h("div", { class: "entry", onclick: () => { location.hash = "#" + path; } },
          h("div", { class: "t", text: t }),
          h("div", { class: "d", text: d }))))));

  const jobCard = card("最近任务", "长任务在后台运行（关掉页面也不影响），这里看最近几条");
  const jobBox = h("div", { class: "empty", text: "加载中…" });
  jobCard.append(jobBox);
  view.append(jobCard);

  try {
    const d = await api("/api/jobs");
    const jobs = (d.jobs || []).slice(-6).reverse();
    jobBox.className = "";
    if (!jobs.length) { jobBox.className = "empty"; jobBox.textContent = "还没有任务"; return; }
    jobBox.append(h("table", { class: "tbl" },
      h("thead", {}, h("tr", {}, h("th", { text: "任务" }), h("th", { text: "状态" }),
        h("th", { text: "开始" }), h("th", { text: "结束" }))),
      h("tbody", {}, jobs.map(j => h("tr", {},
        h("td", { text: `#${j.id} ${j.title}` }),
        h("td", {}, jobTag(j)),
        h("td", { text: j.started || "" }),
        h("td", { text: j.ended || "—" }))))));
  } catch (e) {
    jobBox.className = "empty"; jobBox.textContent = "任务列表加载失败：" + e.message;
  }
}

function jobTag(j) {
  if (j.status === "running") return h("span", { class: "tag info", text: "运行中" });
  if (j.status === "done") return h("span", { class: "tag ok", text: "完成" });
  return h("span", { class: "tag bad", text: `失败(${j.rc})` });
}
