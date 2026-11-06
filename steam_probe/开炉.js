/**
 * 开炉（真·炼金）—— 消费 配料寻优.py 导出的炉单，按编号执行。
 *
 * 流程：读炉单 → 连 GC 读实时库存 → 逐件校验 → （--go 才）发开炉请求 → 回报产物
 *
 * 用法：
 *   node 开炉.js --list                   # 列出炉单
 *   node 开炉.js --furnace 1              # 预演第 1 炉（默认，不发请求）
 *   node 开炉.js --furnace 1 --go         # 真开第 1 炉
 *   node 开炉.js --plan <path>            # 指定炉单（默认 ../输出/配料寻优_炉单.json）
 *
 * ★ recipe 来自炉单里的材料级别，并已对照 CS2 items_game.txt 的 recipes 块验明：
 *   0=消费级 1=工业级 2=军规级 3=受限 4=保密 → 各自升一档；5=5件隐秘→刀/手套；
 *   10~14 / 15 是 StatTrak 版。编号未被重排。
 *
 * 安全校验（任一不过即中止，不发请求）：
 *   件在库存 / 品质可炼(4=普通 或 12=纪念品) / 不在保护期 / 磨损与炉单一致 / 无重复 / 件数==10
 *
 * ★ 品质白名单（2026-10-14 放开）：全项目口径是「普通 + 纪念品可炼（可同炉、产物为普通）」，
 *   原先写死 quality==4 会把含纪念品的整炉拦掉（规范 P1 早有预警，10-14 实测撞上）。
 *   现收 {4, 12}；StatTrak(9) / 原版(1) 仍然拦掉。
 */

const fs = require('fs');
const path = require('path');
const SteamUser = require('steam-user');
const GlobalOffensive = require('globaloffensive');

const HERE = __dirname;
// ★多账号：令牌按账号分文件。设 STEAM_TOKEN_NAME=1 → 令牌_1.json；不设则沿用 令牌.json（号2 兼容）
//   若都没给，加载炉单后再跟随 plan.account 自动切换（见下方）
let ACCT_TOKEN_NAME = (process.env.STEAM_TOKEN_NAME || '').trim();
let TOKEN_FILE = ACCT_TOKEN_NAME ? `令牌_${ACCT_TOKEN_NAME}.json` : '令牌.json';
let TOKEN_PATH = path.join(HERE, TOKEN_FILE);
// ★ 可炼品质白名单（2026-10-14）：4=普通 / 12=纪念品，两者可同炉（产物为普通皮肤）。
//   StatTrak(9) 不可炼、原版 Stock(1) 非皮肤 —— 都不在白名单里，照旧拦掉。
const OK_QUALITY = [4, 12];
const QUALITY_CN = { 1: '原版', 4: '普通', 9: 'StatTrak', 12: '纪念品' };
const OUT_DIR = path.join(HERE, '..', '输出', 'steam');
const DEFAULT_PLAN = path.join(HERE, '..', '输出', '配料寻优_炉单.json');

// ==========================================================================
// ★★ 2026-10-23：开炉日志 v2 —— 为「买卖记录 / 对账」把炉次变成可回溯的成本来源
//
//   为什么改：产物在 BUFF / 悠悠都没有买入记录，卖出时算不出盈亏；材料被炼掉后
//   在库存里消失，也只能靠炉次证明「它去哪了」。老日志有三个致命缺口：
//     ① `itemRemoved` 只有 id/def_index/paint_index —— **没有磨损**，
//        而 assetid 每换手一次就重新分配（BUFF 买入记录的 assetid ≠ Steam 库存里的 assetid），
//        所以既不能按 assetid 配、也不能按 (名字+磨损) 配 → 消耗了哪一件永远对不上；
//     ② 没有 `status` —— `finish(code)` 的退出码根本没落盘，
//        161 字节的空日志分不清「预演 / 校验失败 / 发送失败 / 超时」；
//     ③ `itemRemoved` 在 send 之前也会记 —— 实测有一炉记了 121 条，
//        那是整库同步噪音，会被 `库存扫描.crafted_index()` 当成「炼金消耗」误判。
//
//   ★★ 铁律不变：**纯读、纯记账**。任何一步失败只写 null，
//      【绝不】影响 10 件校验、绝不阻塞或改变开炉行为。
// ==========================================================================
const SKIN_TABLE_PATHS = [
  path.join(HERE, '..', '..', '数据源', 'zh_CN_skins.json'),   // 源码：代码/steam_probe → 项目根/数据源
  path.join(HERE, '..', '数据源', 'zh_CN_skins.json'),         // exe/PYZ：steam_probe → exe 同级/数据源
];
// ★ 材料成本两本账都读：BUFF 优先，其次悠悠（同键取第一笔，与 库存扫描.attach_costs 口径一致）
const LEDGER_BUFF_PATH = path.join(HERE, '..', '输出', '持仓', '持仓账本_累计.json');
const LEDGER_UU_PATH = path.join(HERE, '..', '输出', '持仓', '持仓账本_UU_累计.json');
// ★ 累计记录：一炉一条精简记录，对账不用遍历上百个单炉日志
const RECORD_PATH = path.join(OUT_DIR, '开炉记录_累计.json');
const LOG_SCHEMA = 2;

// ★ 名字归一：与 `持仓账本.norm_name`（规范 R11）口径一致。
//   ⚠️ 这是全项目第 4 份实现（另 3 份：持仓账本 / 库存扫描.canon_name / 配方匹配.match_key）。
//   故意做得「宁可配不上也不配错」：不同步时的唯一后果是 买入价=null，绝不会写错数。
const _TIER_END = / \((?:崭新出厂|略有磨损|久经沙场|破损不堪|战痕累累)\)$/;
const _NORM_ALIAS = [['cz75自动型', 'cz75'], ['野餐区', '野餐']];
function normName(s) {
  let n = String(s == null ? '' : s).replace(_TIER_END, '');
  n = n.replace(/纪念品|★|™/g, '').replace(/｜/g, '|');
  n = n.replace(/\s+/g, '').toLowerCase();
  for (const [a, b] of _NORM_ALIAS) n = n.split(a).join(b);
  return n;
}
// ★ 与 python 的 '%.17f' 同一个 double → 同一个字符串（float32 只有 ~7 位有效，这里只是不丢字符）
function wearKey(w) { const x = Number(w); return isFinite(x) ? x.toFixed(17) : ''; }

let _skinMap = null;
function skinName(paintIndex) {
  try {
    if (_skinMap === null) {
      _skinMap = false;                                  // 先置失败态，异常时不会反复重读
      const p = SKIN_TABLE_PATHS.find(x => fs.existsSync(x));
      if (!p) return null;
      const arr = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
      const m = new Map();
      for (const s of arr) if (s && s.paint_index != null && s.name) m.set(String(s.paint_index), s.name);
      _skinMap = m.size ? m : false;
    }
    if (_skinMap === false) return null;
    return _skinMap.get(String(paintIndex)) || null;
  } catch (_) { _skinMap = false; return null; }
}

// ★★ 账本索引：key = 归一物品名 + '\u0000' + wearKey(磨损)
//   ⚠️ 关键：**一律用数值 wearKey() 生成 key，不要用账本里的 `磨损原值` 字符串**。
//      BUFF 的 `磨损原值` 是 16 位（0.1261902153491974）、UU 是 19 位（0.12619021534919740…），
//      而炉单里的是 wearKey 的 17 位 —— 直接比字符串三边永远对不上（老版本就栽在这）。
function _ledgerIndex(p, label, into) {
  try {
    if (!fs.existsSync(p)) return;
    const led = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
    for (const b of (led.buys || [])) {
      if (!b || b['价格'] == null) continue;
      if (b['订单状态'] && b['订单状态'] !== '成功') continue;
      const k = normName(b['物品名']) + '\u0000' + wearKey(b['磨损']);
      if (!into.has(k)) into.set(k, { 价格: b['价格'], 来源: label, 成交时间: b['成交时间'] || '' });
    }
  } catch (_) {}
}

function computeMaterialCost(f) {
  const items = (f && f.items) || [];
  const out = {
    合计: null, 已匹配: 0, 共: items.length, 已匹配合计: null,
    口径: 'BUFF 优先、其次悠悠（持仓账本_累计.json / 持仓账本_UU_累计.json → buys）',
    明细: [],
  };
  try {
    const idx = new Map();
    _ledgerIndex(LEDGER_BUFF_PATH, 'BUFF', idx);
    _ledgerIndex(LEDGER_UU_PATH, 'UU', idx);          // ★ 已存在的键不覆盖 → BUFF 优先
    if (!idx.size) { out.备注 = '两本账本都没有可用的买入价'; return out; }
    let sum = 0, nBuff = 0;
    for (const p of items) {
      const hit = idx.get(normName(p.skin) + '\u0000' + wearKey(p.wear));
      out.明细.push({
        id: p.id, skin: p.skin, wear: p.wear,
        买入价: hit ? hit.价格 : null,
        来源: hit ? hit.来源 : null,
        成交时间: hit ? hit.成交时间 : null,
      });
      if (hit) { out.已匹配++; sum += hit.价格; if (hit.来源 === 'BUFF') nBuff++; }
    }
    out.已匹配合计 = Math.round(sum * 100) / 100;
    out.匹配来源 = { BUFF: nBuff, UU: out.已匹配 - nBuff };
    // ★ 只有 10 件全配上才给「合计」—— 缺件时的部分和会让人误以为这炉就这么便宜
    if (out.共 > 0 && out.已匹配 === out.共) out.合计 = out.已匹配合计;
    if (out.已匹配 < out.共) {
      out.备注 = `${out.共 - out.已匹配} 件材料在两本账本里都查不到买入价（多是账本没拉到那个号 / 名字归一不同步）`;
    }
  } catch (e) { out.备注 = '读账本失败: ' + e.message; }
  return out;
}


// ★ 2026-10-20：Valve 已把 craft 报文从裸二进制换成 protobuf（CMsgCraftItemsRequest）。
//   旧格式（Int16 recipe + Int16 count + Uint64[]）会被 GC 静默丢弃，随后断开会话（NO_SESSION）。
//   新格式：field1=recipe_def(uint32) / field2=craft_items(repeated uint64)；
//   发送时 protoHeader 必须传 {}（表示 protobuf），传 null 仍会被当成裸二进制。
function _varint(n) {
  n = BigInt(n);
  const out = [];
  while (n > 127n) { out.push(Number(n & 127n) | 128); n >>= 7n; }
  out.push(Number(n));
  return out;
}
function craftProtobuf(csgo, ids, recipe) {
  const bytes = [0x08, ..._varint(recipe)];
  for (const id of ids) bytes.push(0x10, ..._varint(id));
  csgo._steam.sendToGC(730, 1002, {}, Buffer.from(bytes));
}

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return (i >= 0 && process.argv[i + 1]) ? process.argv[i + 1] : def;
}
const GO = process.argv.includes('--go');
const LIST = process.argv.includes('--list');
const PLAN_PATH = arg('--plan', DEFAULT_PLAN);
const FURNACE = parseInt(arg('--furnace', '0'), 10);

if (!fs.existsSync(PLAN_PATH)) {
  console.error(`[x] 找不到炉单：${PLAN_PATH}\n    先跑：python 配料寻优.py`);
  process.exit(1);
}
const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8').replace(/^\uFEFF/, ''));
// ★ 炉单结构版本校验（与 steam.py / 配料寻优.py 的 PLAN_SCHEMA 一致）
const PLAN_SCHEMA = 1;
if (plan.schema === undefined) {
  console.warn('[!] 炉单没有 schema 字段（旧版格式），建议重跑 python 配料寻优.py');
} else if (Number(plan.schema) !== PLAN_SCHEMA) {
  console.error(`[x] 炉单 schema=${plan.schema}，本程序期望 ${PLAN_SCHEMA} —— 结构不兼容，请重跑 python 配料寻优.py`);
  process.exit(1);
}
const furnaces = plan.furnaces || [];

// 没显式指定账号时，跟随炉单里的账号（保证用对令牌）
if (!ACCT_TOKEN_NAME && plan.account && String(plan.account).trim() !== '2') {
  ACCT_TOKEN_NAME = String(plan.account).trim();
  TOKEN_FILE = `令牌_${ACCT_TOKEN_NAME}.json`;
  TOKEN_PATH = path.join(HERE, TOKEN_FILE);
}

if (LIST || !FURNACE) {
  console.log(`炉单：${PLAN_PATH}`);
  console.log(`生成于 ${plan.generatedAt}   账号 ${plan.account} / steamID ${plan.steamId}`);
  console.log(`上限=${plan.boundary}  τ=${plan.tau}  tol=${plan.tol}`);
  console.log(`可开炉 ${furnaces.length} 个：`);
  furnaces.forEach(f => {
    console.log(`  #${f.index}  ${f.label.padEnd(24)} recipe=${f.recipe}  Q=${f.Q.toFixed(9)}  gap=${f.gap.toFixed(9)}  产物 ${f.products.length} 种`);
  });
  process.exit(0);
}

const F = furnaces.find(x => x.index === FURNACE);
if (!F) {
  console.error(`[x] 炉单里没有 #${FURNACE}（共 ${furnaces.length} 炉，用 --list 看）`);
  process.exit(1);
}
if (!fs.existsSync(TOKEN_PATH)) {
  console.error(`[x] 找不到 ${TOKEN_FILE}，先跑：python steam_probe/steam.py login`
    + (ACCT_TOKEN_NAME ? `（账号 ${ACCT_TOKEN_NAME}，需 STEAM_TOKEN_NAME=${ACCT_TOKEN_NAME}）` : ''));
  process.exit(1);
}
const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8').replace(/^\uFEFF/, '')).refreshToken;
const RECIPE = F.recipe;

// ★ 材料成本：与 GC 无关，先算好（预演也写进日志，便于对账）
const 材料成本 = computeMaterialCost(F);
// 产物信息：GC 回报后填（itemAcquired）
let product = null;

function resolveProduct(it) {
  const name = skinName(it.paint_index);
  const rec = {
    id: String(it.id), 名字: name,
    paint_index: it.paint_index, def_index: it.def_index,
    paint_wear: it.paint_wear, paint_seed: it.paint_seed,
  };
  // 顺手对上炉单的候选表（给出概率与磨损档，便于事后核对是不是这一炉该出的东西）
  try {
    const hit = (F.products || []).find(p => p && p.name && name && p.name === name);
    if (hit) { rec.概率 = hit.p; rec.磨损档 = hit.tier; rec.收藏品 = hit.collection; }
  } catch (_) {}
  if (!name) rec.备注 = '名字反查失败（paint_index 不在 数据源/zh_CN_skins.json）';
  console.log(`  [产物] ${name || '(名字未解析)'}  wear=${it.paint_wear}  seed=${it.paint_seed}`);
  return rec;
}


console.log('='.repeat(100));
console.log(`炉 #${F.index}  ${F.label}`);
console.log(`材料 ${F['材料级别']} → 产物 ${F['产物级别']}   recipe=${RECIPE}   Q=${F.Q.toFixed(9)} (上限 ${F.Q_cap.toFixed(9)}, 余量 ${F.gap.toFixed(9)})`);
console.log(`模式：${GO ? '★真开炉' : '预演（不发请求）'}   steamID ${plan.steamId}`);
console.log('='.repeat(100));

const user = new SteamUser();
const csgo = new GlobalOffensive(user);
let done = false;
const events = [];
// ★ 日志 v2 运行态 —— 纯记账，不参与任何校验/发送决策
let sent = false;          // send 之后置 true → 区分「整库同步噪音」和「本炉真消耗」
let steamIdStr = null;     // 登录后回填，写日志用（比炉单里的 steamId 更可信）
let problems = [];         // 校验未通过原因（原来只是 connectedToGC 里的局部变量）
let invSnapshot = null;    // 库存快照：炉单 10 件在 Steam 侧的实测值

// ★ 累计记录：一炉一条精简记录。单炉日志有上百份时，对账不必遍历目录。
function appendRecord(rec, logName) {
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    let data = { schema: LOG_SCHEMA, furnaces: [] };
    if (fs.existsSync(RECORD_PATH)) {
      try {
        const old = JSON.parse(fs.readFileSync(RECORD_PATH, 'utf8').replace(/^\uFEFF/, ''));
        if (old && Array.isArray(old.furnaces)) data = { schema: LOG_SCHEMA, furnaces: old.furnaces };
      } catch (_) { data.备注 = '读旧累计记录失败，已从空开始重建（单炉日志未受影响）'; }
    }
    const mc = rec.材料成本 || {}, pd = rec.产物 || {}, st = rec.统计 || {};
    data.furnaces.push({
      炉号: rec.furnace, label: rec.label, 状态: rec.status, 退出码: rec.exitCode,
      at: rec.at, go: rec.go, account: rec.account, steamId: rec.steamId,
      recipe: rec.recipe, Q: rec.Q,
      材料合计: mc.合计 != null ? mc.合计 : null,
      材料已匹配: mc.共 ? `${mc.已匹配}/${mc.共}` : null,
      匹配来源: mc.匹配来源 || null,
      产物id: pd.id || null, 产物名: pd.名字 || null, 产物磨损: pd.paint_wear != null ? pd.paint_wear : null,
      事件数: st.事件数 || 0, 发送后消耗: st.发送后itemRemoved || 0, 有complete: !!st.有complete,
      日志: logName,
    });
    data.updatedAt = new Date().toISOString();
    const tmp = RECORD_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
    fs.renameSync(tmp, RECORD_PATH);
  } catch (e) { console.error('[!] 写累计记录失败（不影响开炉）:', e.message); }
}

function finish(code, status) {
  if (done) return;
  done = true;
  const st = status || (code === 0 ? (GO ? '成功' : '预演') : '失败');
  let logName = null;
  const rec = {
    schema: LOG_SCHEMA,
    furnace: F.index, label: F.label,
    // ★ v2 核心新增：退出码终于落盘了。老日志全是 161 字节，
    //   真开无事件 / 只有 send / 正常完成 三者长得一模一样，没法回溯。
    status: st, exitCode: code,
    at: new Date().toISOString(),
    go: GO,
    // ★ 炉单账号 == "2" 时 R9 不会切令牌（沿用 令牌.json），ACCT_TOKEN_NAME 反而是空
    //   → 回落到炉单账号，日志里必须能看出这是哪个号的炉
    account: ACCT_TOKEN_NAME || (plan.account != null ? String(plan.account) : null),
    steamId: steamIdStr || (plan.steamId != null ? String(plan.steamId) : null),
    recipe: RECIPE, Q: F.Q, Q_cap: F.Q_cap,
    材料成本,
    库存快照: invSnapshot,
    产物: product,
    校验问题: problems.length ? problems : null,
    统计: {
      事件数: events.length,
      发送前itemRemoved: events.filter(e => e.t === 'itemRemoved' && !e.afterSend).length,
      发送后itemRemoved: events.filter(e => e.t === 'itemRemoved' && e.afterSend).length,
      itemAcquired: events.filter(e => e.t === 'itemAcquired').length,
      有complete: events.some(e => e.t === 'craftingComplete'),
    },
    events,
  };
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    logName = `开炉日志_炉${F.index}_${Date.now()}.json`;
    fs.writeFileSync(path.join(OUT_DIR, logName), JSON.stringify(rec, null, 1));
  } catch (e) { console.error('[!] 写日志失败:', e.message); }
  appendRecord(rec, logName);
  try { user.logOff(); } catch (_) {}
  setTimeout(() => process.exit(code), 800);
}

user.on('refreshToken', (t) => {
  try { fs.writeFileSync(TOKEN_PATH, JSON.stringify({ refreshToken: t, savedAt: new Date().toISOString() }, null, 2)); } catch (_) {}
});
user.on('error', (e) => { console.error('[x] Steam 错误:', e.message); finish(1, '登录失败'); });
user.on('loggedOn', () => {
  steamIdStr = user.steamID ? user.steamID.toString() : null;
  console.log('[OK] 登录成功 steamID =', steamIdStr || '(?)');
  if (SteamUser.EPersonaState) user.setPersona(SteamUser.EPersonaState.Online);
  console.log('[*] 拉起 CS2(730) ...');
  user.gamesPlayed([730]);
});

// ★★ v2：itemRemoved 补 wear/seed/quality —— 这是本次修复的核心。
//   老日志只有 assetid，而 assetid 每换手重分配（BUFF 记录里的 ≠ Steam 库存里的），
//   于是「这一件材料被哪个炉消耗了」永远对不上。有了 (归一物品名 + wearKey(磨损)) 才配得上账本。
//   afterSend 用来剔除发送前的整库同步噪音（实测有一炉 121 条 itemRemoved，与本炉无关）。
csgo.on('itemRemoved', (it) => {
  const w = it.paint_wear != null ? it.paint_wear : null;
  console.log('  [消耗]', it.id, `def=${it.def_index} paint=${it.paint_index} wear=${w == null ? '?' : w}`);
  events.push({
    t: 'itemRemoved', id: it.id, def_index: it.def_index, paint_index: it.paint_index,
    wear: w, seed: it.paint_seed != null ? it.paint_seed : null,
    quality: it.quality != null ? it.quality : null,
    名字: skinName(it.paint_index),
    afterSend: sent,
  });
});
csgo.on('itemAcquired', (it) => {
  console.log('  [★获得]', it.id, `def=${it.def_index} paint=${it.paint_index} wear=${it.paint_wear} seed=${it.paint_seed}`);
  events.push({ t: 'itemAcquired', id: it.id, def_index: it.def_index, paint_index: it.paint_index, paint_wear: it.paint_wear, paint_seed: it.paint_seed, afterSend: sent });
  try { product = resolveProduct(it); } catch (e) { product = { id: String(it.id), 备注: '解析失败: ' + e.message }; }
});
csgo.on('craftingComplete', (rid, gained) => {
  console.log(`\n[OK] craftingComplete  recipe=${rid}  产物 ${gained.length} 件  id=${gained.join(',')}`);
  events.push({ t: 'craftingComplete', recipe: rid, gained });
  // ★ 2026-10-24：GC 假回包（recipe=-1 且 0 产物）= NO_SESSION 噪音（K10），材料一件未消耗，
  //   旧逻辑会把它当「成功」（实测号1 连续 4 炉假成功）。只有「带产物」的 complete 才判成功；
  //   假回包不 finish(0)，交给 60s 超时路径判失败（exit=3）。
  if (rid < 0 || !gained || gained.length === 0) {
    console.error('[!] 疑似 GC 假回包（recipe<0 或无产物）——不判成功，继续等待真回包/超时');
    return;
  }
  setTimeout(() => finish(0, '成功'), 2500);
});
csgo.on('error', (e) => { console.error('[x] GC 错误:', e.message); events.push({ t: 'gcError', msg: e.message }); });
csgo.on('disconnectedFromGC', (r) => {
  console.error('[!] 与 GC 断开 reason =', r);
  events.push({ t: 'disconnected', reason: r, afterSend: sent });
});

csgo.on('connectedToGC', () => {
  console.log('[OK] 已连接 GC\n');
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    const inv = csgo.inventory || [];
    if (!inv.length && tries < 30) return;
    clearInterval(timer);
    if (!inv.length) { console.error('[x] 库存为空，中止。'); finish(1, '库存为空'); return; }

    const idx = {};
    for (const it of inv) idx[String(it.id)] = it;
    const now = Date.now();
    problems = [];
    const ids = [];
    // ★ v2：库存快照 —— 把炉单 10 件在 Steam 侧的实测值落盘。
    //   事后想追「这炉到底炼的是哪一件」，这是唯一能拿到的确定性证据。
    invSnapshot = { at: new Date().toISOString(), 库存件数: inv.length, items: [] };

    console.log('--- 10 件材料校验 ---');
    F.items.forEach((p, i) => {
      const it = idx[p.id];
      const snap = {
        id: p.id, slot: p.slot, skin: p.skin,
        炉单磨损: p.wear, 实测磨损: null, quality: null, 名字: null,
        tradable_after: null, 锁定: false, 磨损差: null, 在库存: !!it,
      };
      invSnapshot.items.push(snap);
      if (!it) { problems.push(`#${i + 1} ${p.id} (${p.skin}) 不在库存`); return; }
      const ta = it.tradable_after ? new Date(it.tradable_after).getTime() : 0;
      const locked = ta > now;
      const wShown = it.paint_wear != null ? it.paint_wear : NaN;
      const wd = Math.abs((it.paint_wear ?? -1) - p.wear);
      snap.实测磨损 = isFinite(wShown) ? wShown : null;
      snap.quality = it.quality != null ? it.quality : null;
      snap.名字 = skinName(it.paint_index);
      snap.tradable_after = it.tradable_after || null;
      snap.锁定 = locked;
      snap.磨损差 = isFinite(wd) ? wd : null;
      console.log(`  ${String(i + 1).padStart(2)} ${p.slot}  ${p.skin.padEnd(24)} ${String(p.id).padEnd(12)} wear=${isFinite(wShown) ? wShown.toFixed(9) : '(无磨损)'} q=${it.quality}${it.quality === 12 ? '★纪念品' : ''}${locked ? ' ★锁' : ''}`);
      if (!OK_QUALITY.includes(it.quality)) {
        problems.push(`${p.id} quality=${it.quality}(${QUALITY_CN[it.quality] || '未知'}) 不可炼，只收 普通(4)/纪念品(12)`);
      }
      if (locked) problems.push(`${p.id} 仍在保护期`);
      if (wd > 1e-6) problems.push(`${p.id} 磨损与炉单不符 (库存${it.paint_wear} vs 炉单${p.wear})`);
      ids.push(String(it.id));
    });
    if (ids.length !== 10) problems.push(`件数 ${ids.length} != 10`);
    if (new Set(ids).size !== ids.length) problems.push('有重复 assetid');

    const tot = F.items.reduce((s, x) => s + x.n, 0);
    console.log(`\n  Σn = ${tot.toFixed(9)}  →  Q = ${(tot / 10).toFixed(9)}  (炉单记录 ${F.Q.toFixed(9)})`);
    console.log(`  材料成本：${材料成本.合计 != null ? '¥' + 材料成本.合计.toFixed(2) : '未齐（已匹配 ' + 材料成本.已匹配 + '/' + 材料成本.共 + '，已匹配小计 ¥' + (材料成本.已匹配合计 || 0).toFixed(2) + '）'}`);
    if (材料成本.备注) console.log(`            ${材料成本.备注}`);

    console.log('\n  产物可能：');
    F.products.forEach(p => {
      console.log(`    ${(p.p * 100).toFixed(2).padStart(6)}%  ${p.name.padEnd(26)} wear=${p.wear.toFixed(9)}  ${p.tier}`);
    });

    if (problems.length) {
      console.error('\n[x] 校验未通过，中止（不发请求）：');
      problems.forEach(s => console.error('    -', s));
      finish(1, '校验未通过');
      return;
    }
    console.log('\n[OK] 10 件全部通过校验。');

    if (!GO) {
      console.log('\n[*] 预演结束。加 --go 真开炉。');
      finish(0, '预演');
      return;
    }
    console.log('\n[*] 发送开炉请求 craft(items=[10], recipe=' + RECIPE + ') ...');
    events.push({ t: 'send', recipe: RECIPE, ids });
    sent = true;                 // ★ 此后收到的 itemRemoved 才算本炉消耗
    try { craftProtobuf(csgo, ids, RECIPE); }
    catch (e) { console.error('[x] 发送失败:', e.message); finish(1, '发送失败'); return; }
    console.log('[*] 已发出，等待 GC 响应（最多 60s）...');
    setTimeout(() => { console.error('[!] 60s 内没收到 craftingComplete。'); finish(3, '60s无响应'); }, 60000);
  }, 1000);
});

setTimeout(() => { console.error('[!] 总超时 180s。'); finish(2, '总超时'); }, 180000);
user.logOn({ refreshToken: token });
