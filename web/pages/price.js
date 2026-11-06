/* 材料邮件提醒：价格提醒 / 期望校验 —— 设置表单 + 立即执行（2026-10-19 网页化，原为控制台兜底） */
import { h, card, refreshStatus, api, toast, jobRunner, statBox } from "../app.js";

export async function render(view) {
  const st = await refreshStatus();
  const sub = st.subscribe || {};

  view.append(card("状态", null,
    h("div", { class: "grid2" },
      statBox("发信配置", st.email_ready ? "就绪（到价会发邮件）" : "未配全 —— 去配置管理补",
        st.email_ready ? "ok" : "warn"),
      statBox("订阅", sub.local ? "本地自用" : sub.active ? `正常 · ${sub.exp_str} 到期` : "未激活（跑不了）",
        (sub.local || sub.active) ? "ok" : "bad"))));

  let cfg = null;
  try { cfg = (await api("/api/config")).config; } catch (e) { /* 配置缺失时仍可「立即执行」 */ }

  const priceLast = h("span", { class: "hint", text: lastText(st.price_last, "上次扫描") });
  const expectLast = h("span", { class: "hint", text: lastText(st.expect_last, "上次校验") });

  async function refreshLast() {
    try {
      const s = await refreshStatus();
      priceLast.textContent = lastText(s.price_last, "上次扫描");
      expectLast.textContent = lastText(s.expect_last, "上次校验");
    } catch (e) { /* 忽略 */ }
  }

  /* ---------- 立即扫描（价格提醒） ---------- */
  const box = h("div");
  const dryCk = h("input", { type: "checkbox" });
  const runBtn = h("button", { class: "btn primary", text: "立即扫描" });
  runBtn.onclick = () => {
    // 手动点 = 用户主动要跑，跟控制台菜单一致加 --force（否则会被「扫描间隔/时刻表」跳过）
    jobRunner(box, "price", dryCk.checked ? ["--dry-run"] : ["--force"], "材料降价扫描",
      () => refreshLast());
  };
  view.append(card("立即扫描（价格提醒）", "扫 BUFF/悠悠 两平台材料价，低于指导价就按账户发邮件。C5 / Steam 价格查询已实现，但客户版暂不开放。",
    h("div", { class: "row" },
      h("div", { class: "narrow" }, h("label", { style: "display:flex;gap:6px;align-items:center" },
        dryCk, "试跑（只扫描看结果，不发邮件）")),
      h("div", { class: "narrow" }, runBtn)),
    h("div", { style: "margin-top:14px" }, box)));

  /* ---------- 价格提醒设置 ---------- */
  if (cfg) {
    const pr = (cfg.price && typeof cfg.price === "object") ? cfg.price : {};
    const ivIn = numIn(pr.min_interval_hours ?? 0, { min: 0, max: 720, step: 0.5 });
    const dpIn = numIn(pr.min_drop_pct ?? 0, { min: 0, max: 99, step: 0.1 });
    const emptyCk = h("input", { type: "checkbox", checked: pr.send_when_empty === true });
    const saveBtn = h("button", { class: "btn primary", text: "保存价格提醒设置" });
    saveBtn.onclick = async () => {
      const iv = numVal(ivIn, "扫描间隔"), dp = numVal(dpIn, "降幅阈值");
      if (iv === null || dp === null) return;
      if (iv < 0 || iv > 720) return toast("扫描间隔须在 0~720 小时之间", "err");
      if (dp < 0 || dp > 99) return toast("降幅阈值须在 0~99 之间", "err");
      const rt = times.collect(); if (rt === null) return;
      if (await saveSeg("price", { min_interval_hours: iv, min_drop_pct: dp, send_when_empty: emptyCk.checked, run_times: rt })) {
        ivIn.value = String(iv); dpIn.value = String(dp);
      }
    };
    const times = timesEditor(pr.run_times);
    view.append(card("价格提醒设置", "改动直接保存到本地 爬虫配置.json，立即生效（与控制台同一处配置）。",
      h("label", { class: "f", text: "每天运行时刻（到时自动开始扫描，可加多个）" }),
      times.box,
      h("div", { class: "hint", text: "到点后的首次触发才跑（由系统定时触发检查）；填了时刻表，「扫描间隔」不再生效" }),
      h("label", { class: "f", text: "扫描间隔（小时，时刻表为空时使用）" }),
      ivIn,
      h("div", { class: "hint", text: "0 = 不限制；支持 0.5 这类小数" }),
      h("label", { class: "f", text: "降幅阈值（%）" }),
      dpIn,
      h("div", { class: "hint", text: "低于指导价百分之几才提醒；0 = 低于即提醒" }),
      h("label", { class: "f", style: "display:flex;gap:8px;align-items:center" },
        emptyCk, "无命中也发一封「无」邮件"),
      h("div", { class: "row", style: "margin-top:14px" },
        h("div", {}, saveBtn),
        h("div", {}, priceLast)),
      h("div", { class: "hint", text: "到点判断/间隔节流都记在「上次扫描」里；「立即扫描」不受限制" })));
  }

  /* ---------- 期望校验 ---------- */
  const ebox = h("div");
  const edryCk = h("input", { type: "checkbox" });
  const erunBtn = h("button", { class: "btn primary", text: "立即校验" });
  erunBtn.onclick = () => {
    // 同上：手动点 = 强跑，不受「校验间隔/时刻表」限制
    jobRunner(ebox, "expect", edryCk.checked ? ["--dry-run"] : ["--force"], "期望校验",
      () => refreshLast());
  };
  const kids = [
    h("div", { class: "row" },
      h("div", { class: "narrow" }, h("label", { style: "display:flex;gap:6px;align-items:center" },
        edryCk, "试跑（不发邮件、不写历史）")),
      h("div", { class: "narrow" }, erunBtn)),
    h("div", { style: "margin-top:14px" }, ebox),
  ];
  if (cfg) {
    const ex = (cfg.expect && typeof cfg.expect === "object") ? cfg.expect : {};
    const eivIn = numIn(ex.min_interval_hours ?? 0, { min: 0, max: 720, step: 0.5 });
    const edpIn = numIn(ex.drop_warn_pct ?? 5, { min: 0, max: 99, step: 0.1 });
    const cleanCk = h("input", { type: "checkbox", checked: ex.send_when_clean !== false });
    const esaveBtn = h("button", { class: "btn primary", text: "保存期望校验设置" });
    esaveBtn.onclick = async () => {
      const iv = numVal(eivIn, "校验间隔"), dp = numVal(edpIn, "跌破阈值");
      if (iv === null || dp === null) return;
      if (iv < 0 || iv > 720) return toast("校验间隔须在 0~720 小时之间", "err");
      if (dp < 0 || dp > 99) return toast("跌破阈值须在 0~99 之间", "err");
      const rt = etimes.collect(); if (rt === null) return;
      if (await saveSeg("expect", { min_interval_hours: iv, drop_warn_pct: dp, send_when_clean: cleanCk.checked, run_times: rt })) {
        eivIn.value = String(iv); edpIn.value = String(dp);
      }
    };
    const etimes = timesEditor(ex.run_times);
    kids.push(
      h("label", { class: "f", text: "每天校验时刻（到时自动开始校验，可加多个）" }),
      etimes.box,
      h("div", { class: "hint", text: "到点后的首次触发才跑；填了时刻表，「校验间隔」不再生效" }),
      h("label", { class: "f", text: "校验间隔（小时，时刻表为空时使用）" }),
      eivIn,
      h("div", { class: "hint", text: "0 = 不限制；「立即校验」不受间隔限制" }),
      h("label", { class: "f", text: "跌破阈值（%）" }),
      edpIn,
      h("div", { class: "hint", text: "实时期望低于台账期望百分之几就预警；0 = 低于即预警（缺省 5）" }),
      h("label", { class: "f", style: "display:flex;gap:8px;align-items:center" },
        cleanCk, "平安邮件（全部正常也发一封汇总）"),
      h("div", { class: "row", style: "margin-top:14px" },
        h("div", {}, esaveBtn),
        h("div", {}, expectLast)));
  } else {
    kids.push(h("div", { class: "hint", text: "配置文件缺失，设置表单不可用（先到「配置管理」处理）" }),
      h("div", {}, expectLast));
  }
  view.append(card("期望校验", "核对台账期望与实时价；跌破阈值 / 缺价时按账户发预警邮件。", ...kids));

  /* ---------- 邮箱与分发 ---------- */
  view.append(card("邮箱与分发", "收件邮箱 / SMTP / 授权码 / 按账户分发 / 邮件开关 —— 在「配置管理」里改（同一份配置）。",
    h("div", { class: "row" },
      h("div", {}, h("a", { class: "btn", href: "#/config", text: "去配置管理" })))));

  /* ---------- 小组件 ---------- */
  function timesEditor(vals) {
    function bumpTime(inp, mins) {
      const [hh, mm] = (inp.value || "00:00").split(":").map(Number);
      const total = (hh * 60 + mm + mins + 1440) % 1440;
      inp.value = String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
    }
    const rows = h("div");
    function addRow(v) {
      const inp = h("input", { class: "inp", type: "time", value: v || "", style: "max-width:150px" });
      let acc = 0;
      inp.addEventListener("wheel", (e) => {
        e.preventDefault();
        acc += e.deltaY;
        if (Math.abs(acc) < 100) return;
        bumpTime(inp, acc > 0 ? -15 : 15);
        acc = 0;
      }, { passive: false });
      const del = h("button", { class: "btn sm narrow", text: "删除" });
      const row = h("div", { class: "row", style: "margin:4px 0;align-items:center" }, inp, del);
      del.onclick = () => row.remove();
      rows.append(row);
    }
    (vals || []).forEach((v) => addRow(v));
    const addBtn = h("button", { class: "btn", text: "＋ 添加时刻" });
    addBtn.onclick = () => addRow("");
    return {
      box: h("div", {}, rows, addBtn),
      collect() {
        const v = Array.from(rows.querySelectorAll("input[type=time]"))
          .map((i) => i.value).filter(Boolean).sort();
        if (v.length > 12) { toast("运行时刻最多 12 个", "err"); return null; }
        return v;
      },
    };
  }

  function numIn(v, attrs) {
    return h("input", { class: "inp", type: "number", value: String(v ?? ""),
      min: attrs.min, max: attrs.max, step: attrs.step });
  }

  function numVal(inp, label) {
    const s = String(inp.value).trim();
    const n = s === "" ? 0 : Number(s);
    if (!isFinite(n)) { toast(`${label}必须是数字`, "err"); return null; }
    return n;
  }

  async function saveSeg(seg, patch) {
    const cur = (cfg[seg] && typeof cfg[seg] === "object") ? cfg[seg] : {};
    const obj = { ...cur, ...patch };
    try {
      await api("/api/config/save", { method: "POST", body: { [seg]: obj } });
      cfg[seg] = obj;
      toast("已保存", "ok");
      return true;
    } catch (e) { toast(e.message, "err"); return false; }
  }
}

function lastText(v, what) {
  return what + "：" + (v || "（还没跑过）");
}
