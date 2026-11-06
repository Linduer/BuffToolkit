/* 开炉工具：配料寻优 + 主材料调价 */
import { h, card, refreshStatus, api, toast, jobRunner } from "../app.js";

export async function render(view) {
  const st = await refreshStatus();
  const accs = st.accounts || [];

  /* ---------- 配料寻优 ---------- */
  const oBox = h("div");
  const oSel = h("select", { class: "inp" },
    accs.length ? accs.map(a => h("option", { value: a.name, text: a.name }))
                : [h("option", { text: "没有账户 —— 先去配置管理" })]);
  const oNoScan = h("input", { type: "checkbox" });
  const oBtn = h("button", { class: "btn primary", text: "开始寻优" });
  oBtn.onclick = () => {
    if (!accs.length) { location.hash = "#/config"; return toast("先到「配置管理」添加账户", "err"); }
    const args = ["--account", oSel.value];
    if (oNoScan.checked) args.push("--no-scan");
    jobRunner(oBox, "optimize", args, `配料寻优（${oSel.value}）`);
  };
  view.append(card("配料寻优", "按该账户库存 + 磨损上限排炉单；默认会先自动刷新一次库存（联网，较慢）。",
    h("div", { class: "row" }, oSel,
      h("div", { class: "narrow" }, h("label", { style: "display:flex;gap:6px;align-items:center" },
        oNoScan, "跳过前置扫描（直接用现有快照）")),
      h("div", { class: "narrow" }, oBtn)),
    h("div", { class: "hint", text: "跑完会生成炉单 json：输出\\配料寻优_炉单_号<账户>.json（留档）与 配料寻优_炉单.json（最近一次）。" }),
    h("div", { style: "margin-top:14px" }, oBox)));

  /* ---------- 主材料调价 ---------- */
  const rBox = h("div");
  const gIn = h("input", { class: "inp", placeholder: "组号，如 2:1 2:4（账号:组号，空格分隔）" });
  const fIn = h("input", { class: "inp narrow", style: "max-width:140px", placeholder: "乘数 如 1.13" });
  const bIn = h("input", { class: "inp narrow", style: "max-width:140px", placeholder: "买入乘数(可空)" });
  const dryBtn = h("button", { class: "btn primary", text: "① 预览（dry-run，不写入）" });
  const applyBtn = h("button", { class: "btn danger", text: "② 正式执行（写入台账）", disabled: "disabled" });
  applyBtn.style.display = "none";

  function buildArgs() {
    const groups = gIn.value.trim().split(/\s+/).filter(Boolean);
    const f = fIn.value.trim();
    if (!groups.length) { toast("先填组号，如 2:1", "err"); return null; }
    if (!f || isNaN(parseFloat(f))) { toast("乘数要填数字，如 1.13", "err"); return null; }
    const args = ["--group", ...groups, "--factor", f];
    if (bIn.value.trim()) {
      if (isNaN(parseFloat(bIn.value.trim()))) { toast("买入乘数要填数字", "err"); return null; }
      args.push("--buy-factor", bIn.value.trim());
    }
    return args;
  }

  dryBtn.onclick = () => {
    const args = buildArgs();
    if (!args) return;
    applyBtn.style.display = "none";
    jobRunner(rBox, "reprice", [...args, "--dry-run"], "调价预览（不写入）", d => {
      if (d && d.status === "done") {
        applyBtn.style.display = "";
        toast("预览完成 —— 确认没问题再点「正式执行」", "info");
      }
    });
  };
  applyBtn.onclick = () => {
    const args = buildArgs();
    if (!args) return;
    if (!confirm("确认把新价格写入台账？（建议先预览过）")) return;
    jobRunner(rBox, "reprice", args, "调价写入", () => applyBtn.style.display = "none");
  };

  view.append(card("主材料调价", "按乘数重算主材料价、副材料价联动。先预览、确认后再写入台账。",
    h("div", { class: "row" }, gIn),
    h("div", { class: "row", style: "margin-top:8px" }, fIn, bIn,
      h("div", { class: "narrow" }, dryBtn),
      h("div", { class: "narrow" }, applyBtn)),
    h("div", { style: "margin-top:14px" }, rBox)));

  /* ---------- 自动开炉（Beta）----------
     ★ 三道闸：① 只能先「查看炉单」→「预演」（不发请求，展示 10 件与校验结果）
              ② 预演通过后，须在确认框**再键入一次炉号**才解锁「真开炉」按钮
              ③ 真开时 开炉.js 发请求前会重新连 GC 逐件重校验（库存/磨损/保护期），
                 预演后库存变过的炉会被自动拦下 */
  const cBox = h("div");
  const cIn = h("input", { class: "inp narrow", style: "max-width:120px", placeholder: "炉号，如 1" });
  const cListBtn = h("button", { class: "btn", text: "查看炉单" });
  const cPreviewBtn = h("button", { class: "btn primary", text: "预演（不发请求）" });
  const cGoBtn = h("button", { class: "btn danger", text: "真开炉（不可逆）", disabled: "disabled" });
  const cConfirm = h("input", { class: "inp narrow", style: "max-width:120px", placeholder: "键入炉号确认" });
  cGoBtn.style.display = "none";
  cConfirm.style.display = "none";

  const craftNum = () => {
    const n = parseInt(cIn.value.trim(), 10);
    if (!n || n < 1) { toast("先填炉号（见「查看炉单」输出）", "err"); return null; }
    return n;
  };

  cListBtn.onclick = () => jobRunner(cBox, "craft", ["--list"], "查看炉单");
  cPreviewBtn.onclick = () => {
    const n = craftNum(); if (!n) return;
    cGoBtn.style.display = "none"; cConfirm.style.display = "none"; cConfirm.value = "";
    jobRunner(cBox, "craft", ["--furnace", String(n)], `自动开炉 · 预演第 ${n} 炉`, d => {
      if (d && d.status === "done") {
        cGoBtn.style.display = ""; cConfirm.style.display = "";
        toast(`预演完成 —— 确认没问题后，在确认框键入 ${n} 解锁真开炉`, "info");
      }
    });
  };
  cConfirm.oninput = () => {
    cGoBtn.disabled = cConfirm.value.trim() !== cIn.value.trim();
  };
  cGoBtn.onclick = () => {
    const n = craftNum(); if (!n) return;
    if (cConfirm.value.trim() !== String(n)) { toast("确认框与炉号不一致", "err"); return; }
    const msg = "自动开炉不可逆：第 " + n + " 炉的 10 件材料炼掉就无法恢复。\n"
      + "Steam 自动化属灰色地带，账号风控风险自担。\n\n确定真开第 " + n + " 炉？";
    if (!confirm(msg)) return;
    jobRunner(cBox, "craft", ["--furnace", String(n), "--go"], `自动开炉 · 真开第 ${n} 炉`,
      () => { cGoBtn.style.display = "none"; cConfirm.style.display = "none"; cConfirm.value = ""; });
  };

  view.append(card("自动开炉（Beta）",
    "消费「配料寻优」刚排出的炉单，连 Steam GC 真开炉。令牌自动跟随炉单上的账户，不会用错号。"
    + "先预演、后确认、执行前还会重校验。产物与消耗记入 输出\\steam\\开炉记录_累计.json。",
    h("div", { class: "row" }, cIn,
      h("div", { class: "narrow" }, cListBtn),
      h("div", { class: "narrow" }, cPreviewBtn),
      h("div", { class: "narrow" }, cConfirm),
      h("div", { class: "narrow" }, cGoBtn)),
    h("div", { class: "hint", text: "⚠️ Beta：开炉不可逆（10 件材料炼掉就没了）；Steam 自动化属灰色地带，账号风险自担。"
      + "炉单是旧的（寻优后库存变过）预演就会拦，被拦是保护你不是 bug。有问题联系作者 QQ 916182191。" }),
    h("div", { style: "margin-top:14px" }, cBox)));
}
