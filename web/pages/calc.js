/* 炼金期望计算：网页表单 → --params 无人值守计算 → 结果勾选写台账 */
import { h, card, refreshStatus, api, toast, jobRunner, statBox } from "../app.js";

export async function render(view) {
  const st = await refreshStatus();
  const sub = st.subscribe || {};

  let meta = null;
  try {
    meta = await api("/api/calc/meta");
  } catch (e) {
    view.append(card("加载失败", "读取参照表出错：" + e.message));
    return;
  }

  view.append(card("状态", null,
    h("div", { class: "grid2" },
      statBox("订阅", sub.local ? "本地自用" : sub.active ? `正常 · ${sub.exp_str} 到期` : "未激活（跑不了）",
        (sub.local || sub.active) ? "ok" : "bad"),
      statBox("本月炼金次数", sub.local ? "不限" : (sub.left >= 0 ? `剩余 ${sub.left} / ${sub.quota}` : "—"), ""))));

  /* ---------- 参数表单 ---------- */
  const ratioIn = h("input", { class: "inp", value: meta.ratio_default ?? 0.5 });
  const raritySel = h("select", { class: "inp" },
    meta.rarities.map(r => h("option", { value: r, text: r })));
  const aSel = h("select", { class: "inp narrow", style: "max-width:120px" },
    [1, 2, 3, 4, 5].map(i => h("option", { value: i, text: `${i}（副 ${10 - i}）`, selected: i === 4 ? "selected" : null })));
  const idsIn = h("input", { class: "inp", placeholder: "逗号分隔，至少 2 个，如 1,5,6,20" });
  const wearsIn = h("input", { class: "inp", placeholder: "恰好 2 个，如 0.0142,0.1071" });
  const pwIn = h("input", { class: "inp narrow", style: "max-width:160px", list: "pw-list", value: "0.07" });
  const dl = h("datalist", { id: "pw-list" },
    ["0.07", "0.15", "0.38", "0.45"].map(v => h("option", { value: v, text: v === "0.07" ? "0.07（崭新）" : v === "0.15" ? "0.15（略磨）" : v === "0.38" ? "0.38（久经）" : "0.45（破损）" })));

  const runBtn = h("button", { class: "btn primary", text: "开始计算（联网拉价，需要较长时间）" });
  const oBox = h("div");

  /* 收藏品编号对照表：点编号直接填进输入框 */
  const refBox = buildCollectRef(meta.collections || [], (id) => {
    const cur = idsIn.value.split(/[,，\s]+/).filter(Boolean);
    if (!cur.includes(id)) cur.push(id);
    idsIn.value = cur.join(",");
    toast(`已填入编号 ${id}`, "ok");
  });

  runBtn.onclick = () => {
    const ids = idsIn.value.split(/[,，\s]+/).filter(Boolean).map(Number);
    const wears = wearsIn.value.split(/[,，\s]+/).filter(Boolean).map(Number);
    const ratio = parseFloat(ratioIn.value);
    const pw = parseFloat(pwIn.value);
    if (isNaN(ratio) || ratio < 0) return toast("利润率门槛要填数字", "err");
    if (ids.length < 2 || ids.some(isNaN)) return toast("收藏品编号至少 2 个（逗号分隔的整数）", "err");
    if (wears.length !== 2 || wears.some(isNaN)) return toast("材料磨损必须恰好 2 个数字", "err");
    if (isNaN(pw) || pw <= 0 || pw > 1) return toast("产物磨损要填 0~1 的数字", "err");
    const params = JSON.stringify({
      min_ratio: ratio, item_rarity: raritySel.value, a: parseInt(aSel.value),
      item_ids: ids, wears, product_wear: pw,
    });
    jobRunner(oBox, "calc", ["--params", params], "炼金期望计算", (d, allText) => {
      const m = /RESULT_JSON=(.+)/.exec(allText || "");
      if (m) loadResult(m[1].trim());
      else if (d && d.status === "done") toast("计算完成但未找到结果文件（可能 0 个达标配方）", "info");
    });
  };

  view.append(card("计算参数", "对应控制台版 6 步问答；每次计算扣 1 次本月炼金次数。",
    h("label", { class: "f", text: "利润率门槛（只显示高于它的）" }), ratioIn,
    h("label", { class: "f", text: "材料等级" }), raritySel,
    h("label", { class: "f", text: "主材料把数 a（副材料 = 10 − a）" }), aSel,
    h("label", { class: "f", text: "收藏品编号（逗号分隔，至少 2 个，两两配对枚举）" }), idsIn,
    refBox,
    h("label", { class: "f", text: "两个材料归一化磨损（恰好 2 个，与主/副自动绑定）" }), wearsIn,
    h("label", { class: "f", text: "产物归一化磨损 = 目标档位上限" }), pwIn, dl,
    h("div", { class: "row", style: "margin-top:14px" }, h("div", {}, runBtn)),
    h("div", { style: "margin-top:14px" }, oBox)));

  /* ---------- 结果区 ---------- */
  const resCard = card("计算结果", "勾选要写入台账的配方，选择目标 sheet，然后写入。");
  resCard.style.display = "none";
  view.append(resCard);

  async function loadResult(file) {
    let data;
    try {
      data = await api("/api/calc/result?file=" + encodeURIComponent(file));
    } catch (e) {
      return toast("结果读取失败：" + e.message, "err");
    }
    resCard.style.display = "";
    resCard.innerHTML = "";
    const results = data.results || [];
    if (!results.length) {
      resCard.append(h("h2", { text: "计算结果" }), h("div", { class: "empty", text: "0 个达标配方" }));
      return;
    }
    const cks = new Map();
    const rows = results.map(r => {
      const ck = h("input", { type: "checkbox", disabled: r.可写入 ? null : "disabled" });
      cks.set(r.no, ck);
      return h("tr", {},
        h("td", { text: r.no }),
        h("td", {}, ck),
        h("td", { text: r.配方 || "" }),
        h("td", { text: fmt(r.利润率) }),
        h("td", { text: fmt(r.总成本) }),
        h("td", { text: fmt(r.总期望) }),
        h("td", {}, r.可写入
          ? h("span", { class: "tag ok", text: "可写入" })
          : h("span", { class: "tag warn", text: "缺价格列表" })));
    });
    const allCk = h("input", { type: "checkbox" });
    allCk.onchange = () => { for (const [, ck] of cks) if (!ck.disabled) ck.checked = allCk.checked; };

    resCard.append(
      h("h2", { text: `计算结果（${results.length} 个达标配方）` }),
      h("div", { class: "desc", text: `结果文件：${data.file}` }),
      h("div", { style: "max-height:420px;overflow:auto" },
        h("table", { class: "tbl" },
          h("thead", {}, h("tr", {},
            h("th", { text: "#" }), h("th", {}, allCk), h("th", { text: "配方" }),
            h("th", { text: "利润率" }), h("th", { text: "总成本" }), h("th", { text: "总期望" }),
            h("th", { text: "写入状态" }))),
          h("tbody", {}, rows))));

    const sheetBox = h("div", { style: "margin-top:12px" });
    if (meta.ledger_sheets && meta.ledger_sheets.length) {
      sheetBox.append(h("label", { class: "f", text: "写入台账的 sheet（= Steam 号，可多选）" }));
      const sheetCks = meta.ledger_sheets.map(s => {
        const ck = h("input", { type: "checkbox", value: s });
        return { s, ck };
      });
      sheetBox.append(h("div", { class: "row" },
        sheetCks.map(({ s, ck }) => h("label", { style: "display:flex;gap:6px;align-items:center" }, ck, s))));
      const writeBtn = h("button", { class: "btn danger", text: "写入选中的配方到台账" });
      const wBox = h("div", { style: "margin-top:12px" });
      writeBtn.onclick = () => {
        const picked = [...cks.entries()].filter(([, ck]) => ck.checked).map(([no]) => no);
        const sheets = sheetCks.filter(x => x.ck.checked).map(x => x.s);
        if (!picked.length) return toast("先勾选要写入的配方", "err");
        if (!sheets.length) return toast("先勾选要写入的 sheet", "err");
        if (!confirm(`把 ${picked.length} 个配方写入 sheet「${sheets.join("、")}」？（建议先确认预览无误）`)) return;
        jobRunner(wBox, "calc-write",
          ["--write-ledger", data.file, "--pick", picked.join(","), "--sheets", sheets.join(",")],
          "写入台账");
      };
      sheetBox.append(h("div", { class: "row", style: "margin-top:10px" }, h("div", {}, writeBtn)));
      sheetBox.append(wBox);
    } else {
      sheetBox.append(h("div", { class: "hint warn",
        text: "没有读到台账 sheet（实时炼金配方.xlsx 缺失或为空）——写入功能不可用，可先用 Excel 打开结果文件。" }));
    }
    resCard.append(sheetBox);
    toast(`计算完成：${results.length} 个达标配方`, "ok");
  }
}

function fmt(v) {
  if (v === null || v === undefined) return "—";
  return typeof v === "number" ? (Math.round(v * 10000) / 10000).toString() : String(v);
}

/* 收藏品名字 ↔ 编号对照表（折叠）：按编号聚合多个名字，点编号回调 onPick */
function buildCollectRef(collections, onPick) {
  const det = h("details", { class: "ref" });
  if (!collections.length) {
    det.append(h("summary", { text: "收藏品名字 ↔ 编号对照表（未读到，请检查参照表 / 收藏品编号固定.json）" }));
    return det;
  }
  const byId = new Map();
  for (const c of collections) {
    if (!byId.has(c.id)) byId.set(c.id, new Set());
    byId.get(c.id).add(c.name);
  }
  const rows = [...byId.entries()]
    .sort((a, b) => (Number(a[0]) || 0) - (Number(b[0]) || 0))
    .map(([id, names]) => h("tr", {},
      h("td", {}, h("span", { class: "ref-id", text: id, title: "点击填入输入框", onclick: () => onPick(id) })),
      h("td", { text: [...names].join("、") })));
  det.append(
    h("summary", { text: `收藏品名字 ↔ 编号对照表（共 ${byId.size} 个编号，点编号直接填入输入框）` }),
    h("div", { class: "ref-box" },
      h("table", { class: "tbl" },
        h("thead", {}, h("tr", {}, h("th", { text: "编号" }), h("th", { text: "收藏品名字" }))),
        h("tbody", {}, rows))));
  return det;
}
