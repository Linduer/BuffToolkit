/* 订阅管理：状态 + 激活 */
import { h, card, statBox, refreshStatus, api, toast } from "../app.js";

export async function render(view) {
  const st = await refreshStatus();
  let cur = st.subscribe || {};

  const statusCard = card("订阅状态", null);
  const box = h("div", { class: "grid3" });
  statusCard.append(box);
  view.append(statusCard);

  function paint() {
    box.innerHTML = "";
    if (cur.local) {
      box.append(statBox("模式", "本地自用（不校验）", "ok"),
        statBox("到期", "不限", "ok"), statBox("次数", "不限", "ok"));
      return;
    }
    if (cur.active) {
      box.append(
        statBox("持有人", cur.holder || "—", "ok"),
        statBox("到期", cur.exp_str || "—",
          (cur.exp - Date.now() / 1000) < 3 * 86400 ? "warn" : "ok"),
        statBox("本月炼金次数", cur.left >= 0 ? `剩余 ${cur.left} / ${cur.quota}` : "不限", ""));
    } else {
      box.append(statBox("状态", "未激活", "bad"),
        statBox("原因", cur.reason || "—", "warn"),
        statBox("说明", "激活后功能全开", ""));
    }
  }
  paint();

  const kb = h("textarea", { class: "inp", placeholder: "粘贴 BT- 开头的密钥（含点号后的签名，整条复制）" });
  const btn = h("button", { class: "btn primary", text: "激活 / 更换密钥" });
  btn.onclick = async () => {
    const key = kb.value.trim();
    if (!key) return toast("请先粘贴密钥", "err");
    btn.disabled = true;
    try {
      cur = await api("/api/subscribe/activate", { method: "POST", body: { key } });
      toast("激活成功：" + (cur.exp_str || "") + " 到期", "ok");
      await refreshStatus();
      paint();
      kb.value = "";
    } catch (e) {
      toast(e.message, "err");
    } finally {
      btn.disabled = false;
    }
  };

  view.append(card("激活", "密钥由卖家签发（BT- 开头）；到期/过期后输入新密钥即可续期。",
    kb,
    h("div", { class: "row", style: "margin-top:12px" }, h("div", {}, btn)),
    h("div", { class: "hint", text: "提示：激活需要联网做一次服务端核验；断网时本地验签通过也可先激活，联网后自动复核。" })));
}
