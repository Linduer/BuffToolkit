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
}
