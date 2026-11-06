/**
 * 只读探测脚本：验证"自建 steam-user + globaloffensive 走 GC 开炉"这条路线能不能跑通。
 *
 * ★本脚本绝不调用 craft()。只做登录 + 连 GC + 读库存。
 *
 * 用法：
 *   node probe.js --dry             # 免登录自检（打印环境 + recipe 表）
 *   node probe.js                   # 真实登录探测（只读）
 *   node probe.js --force-password  # 忽略已存的令牌，强制走 账号+密码+令牌
 *
 * 凭据来源优先级：
 *   1) 环境变量 STEAM_REFRESH_TOKEN   → 用刷新令牌登录（免密免令牌，自动化首选）
 *   2) 同目录 令牌.json 里的 refreshToken → 同上
 *   3) 环境变量 STEAM_ACCOUNT / STEAM_PASSWORD / STEAM_GUARD_CODE
 *   4) 同目录 配置.json（{ accountName, password, steamGuardCode }）
 *
 * 登录成功后会拿到 refreshToken 并自动存到 令牌.json（下次免密免令牌）。
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SteamUser = require('steam-user');
const GlobalOffensive = require('globaloffensive');

const CFG_PATH = path.join(__dirname, '配置.json');
// ★多账号：令牌按账号分文件。设 STEAM_TOKEN_NAME=1 → 令牌_1.json；不设则沿用 令牌.json（号2 兼容）
const ACCT_TOKEN_NAME = (process.env.STEAM_TOKEN_NAME || '').trim();
const TOKEN_FILE = ACCT_TOKEN_NAME ? `令牌_${ACCT_TOKEN_NAME}.json` : '令牌.json';
const TOKEN_PATH = path.join(__dirname, TOKEN_FILE);

// recipe id → 含义（库文档口径，截至 2022 底；2025 后可能扩充，实跑时以实际为准）
const RECIPES = {
  0: '10x 消费级(Consumer)   → 1x 工业级(Industrial)',
  1: '10x 工业级(Industrial) → 1x 军规级(Mil-Spec)',
  2: '10x 军规级(Mil-Spec)   → 1x 受限(Restricted)',
  3: '10x 受限(Restricted)   → 1x 保密(Classified)',
  4: '10x 保密(Classified)   → 1x 隐秘(Covert)',
  10: '10x 消费级 StatTrak   → 1x 工业级 StatTrak',
  11: '10x 工业级 StatTrak   → 1x 军规级 StatTrak',
  12: '10x 军规级 StatTrak   → 1x 受限 StatTrak',
  13: '10x 受限 StatTrak     → 1x 保密 StatTrak',
  14: '10x 保密 StatTrak     → 1x 隐秘 StatTrak',
};

function printEnv() {
  console.log('=== 环境 ===');
  console.log('node                =', process.version);
  console.log('steam-user          =', require('steam-user/package.json').version);
  console.log('globaloffensive     =', require('globaloffensive/package.json').version);
  console.log('typeof csgo.craft   =', typeof GlobalOffensive.prototype.craft);
  console.log('Craft/CraftResponse =', require('globaloffensive/language.js').Craft,
    '/', require('globaloffensive/language.js').CraftResponse);
  console.log('\n=== recipe 对照表（文档口径，实跑需复核）===');
  for (const [k, v] of Object.entries(RECIPES)) console.log(`  ${k.padStart(2)} = ${v}`);
}

// ---- --dry：免登录自检 ----
if (process.argv.includes('--dry')) {
  printEnv();
  console.log('\n[*] --dry 自检结束（未登录、未开炉）。');
  process.exit(0);
}

const FORCE_PASSWORD = process.argv.includes('--force-password');

function loadConfig() {
  // 1) 刷新令牌（环境变量 → 令牌.json）
  if (!FORCE_PASSWORD) {
    if (process.env.STEAM_REFRESH_TOKEN) {
      console.log('[*] 凭据来源：环境变量 STEAM_REFRESH_TOKEN');
      return { refreshToken: process.env.STEAM_REFRESH_TOKEN };
    }
    if (fs.existsSync(TOKEN_PATH)) {
      try {
        const t = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8').replace(/^\uFEFF/, ''));
        if (t && t.refreshToken) {
          console.log(`[*] 凭据来源：${TOKEN_FILE}（免密免令牌）`);
          return { refreshToken: t.refreshToken };
        }
      } catch (e) { console.error(`[!] ${TOKEN_FILE} 解析失败，忽略:`, e.message); }
    }
  }
  // 2) 账号密码
  if (process.env.STEAM_ACCOUNT && process.env.STEAM_PASSWORD) {
    console.log('[*] 凭据来源：环境变量 STEAM_ACCOUNT/PASSWORD');
    return {
      accountName: process.env.STEAM_ACCOUNT,
      password: process.env.STEAM_PASSWORD,
      steamGuardCode: process.env.STEAM_GUARD_CODE || '',
    };
  }
  if (!fs.existsSync(CFG_PATH)) {
    console.error('[x] 没有可用凭据。请设 STEAM_ACCOUNT/STEAM_PASSWORD 环境变量，或填 配置.json。');
    process.exit(1);
  }
  console.log('[*] 凭据来源：配置.json');
  const c = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8').replace(/^\uFEFF/, ''));
  if (process.env.STEAM_GUARD_CODE) c.steamGuardCode = process.env.STEAM_GUARD_CODE;
  return c;
}

function ask(q) {
  if (!process.stdin.isTTY) { // 非交互环境：不能卡住等输入
    console.error('[!] 非交互环境，无法输入验证码。');
    return Promise.resolve('');
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(String(a).trim()); }));
}

printEnv();
console.log('');
const cfg = loadConfig();

const user = new SteamUser();
const csgo = new GlobalOffensive(user);

let done = false;
function finish(code) {
  if (done) return;
  done = true;
  try { user.logOff(); } catch (_) {}
  setTimeout(() => process.exit(code), 800);
}

// ★ 只读：任何地方都不调用 csgo.craft()

// 拿到刷新令牌 → 存盘，下次免密免令牌
user.on('refreshToken', (token) => {
  try {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ refreshToken: token, savedAt: new Date().toISOString() }, null, 2));
    console.log(`[OK] 已保存登录令牌 → ${TOKEN_FILE}（下次可免密免令牌登录）`);
  } catch (e) {
    console.error('[!] 保存令牌失败:', e.message);
  }
});

user.on('loggedOn', () => {
  console.log('[OK] 登录成功。steamID =', user.steamID ? user.steamID.toString() : '(?)');
  if (SteamUser.EPersonaState) user.setPersona(SteamUser.EPersonaState.Online);
  console.log('[*] 拉起 CS2(730)，等待连接 Game Coordinator ...');
  user.gamesPlayed([730]);
});

let guardAttempts = 0;
user.on('steamGuard', async (domain, callback, lastCodeWrong) => {
  guardAttempts++;
  const kind = domain ? `邮箱验证（域: ${domain}）` : '手机令牌（Mobile Authenticator）';
  console.log(`[!] 需要 Steam 令牌验证：${kind}  lastCodeWrong = ${!!lastCodeWrong}`);
  if (guardAttempts > 3) { console.error('[x] 连续多次无效验证码，放弃（不再重试，避免触发限流）。'); finish(1); return; }
  if (cfg.steamGuardCode && !lastCodeWrong) { console.log('    使用凭据里的验证码。'); callback(cfg.steamGuardCode); return; }
  const code = await ask('请输入 Steam 令牌验证码: ');
  if (!code) { console.error('[x] 没拿到验证码，放弃（不空转重试，避免 AccountLoginDeniedThrottle）。'); finish(1); return; }
  callback(code);
});

user.on('error', (e) => {
  console.error('[x] Steam 错误:', e.message, '| EResult =', e.eresult);
  if (e.eresult === SteamUser.EResult.AccountLoginDeniedThrottle) {
    console.error('    这是登录失败次数过多导致的限流，需等一段时间（通常 ~30 分钟）再试。');
  }
  if (e.eresult === SteamUser.EResult.InvalidPassword) {
    console.error('    密码错误。');
  }
  finish(1);
});
user.on('disconnected', (e, msg) => console.error('[!] 与 Steam 断线:', msg));

csgo.on('connectedToGC', () => {
  console.log('[OK] 已连接 CS2 Game Coordinator。haveGCSession =', csgo.haveGCSession);

  console.log('\n--- 探测 craft 能力（只查有无，不调用）---');
  const names = new Set();
  let proto = Object.getPrototypeOf(csgo);
  while (proto && proto !== Object.prototype) {
    for (const n of Object.getOwnPropertyNames(proto)) names.add(n);
    proto = Object.getPrototypeOf(proto);
  }
  for (const n of Object.getOwnPropertyNames(csgo)) names.add(n);
  const craftLike = [...names].filter((n) => /craft|recipe|tradeup|trade_up|combine|upgrade|contract|redeem/i.test(n));
  console.log('[i] 疑似 craft 相关成员:', craftLike.length ? craftLike.join(', ') : '(无)');
  console.log('[i] typeof csgo.craft =', typeof csgo.craft);

  const inv = csgo.inventory || [];
  console.log('\n--- 库存 ---');
  console.log('[i] 件数:', inv.length);

  // ---- 落盘完整库存（只读产物）----
  try {
    const outDir = path.join(__dirname, '..', '输出', 'steam');
    fs.mkdirSync(outDir, { recursive: true });
    const steamId = user.steamID ? user.steamID.toString() : 'unknown';
    const outFile = path.join(outDir, `steam库存_${steamId}.json`);
    const dump = inv.map((it) => ({
      id: it.id,
      def_index: it.def_index,
      paint_index: it.paint_index,
      paint_seed: it.paint_seed,
      paint_wear: it.paint_wear,
      rarity: it.rarity,
      quality: it.quality,
      origin: it.origin,
      level: it.level,
      quantity: it.quantity,
      tradable_after: it.tradable_after ? new Date(it.tradable_after).toISOString() : null,
      casket_id: it.casket_id || null,
      position: it.position,
      custom_name: it.custom_name || null,
      // ★贴花/涂鸦：武器身上贴的印花，或「印花/涂鸦」这件物品自己的身份
      //   （印花件 def_index=1209、涂鸦件 def_index=1348，其身份存在 stickers[0].sticker_id）
      stickers: it.stickers || null,
    }));
    fs.writeFileSync(outFile, JSON.stringify({
      steamId,
      capturedAt: new Date().toISOString(),
      count: dump.length,
      items: dump,
    }, null, 1));
    console.log('[OK] 完整库存已落盘:', outFile);
  } catch (e) {
    console.error('[!] 库存落盘失败:', e.message);
  }

  if (inv.length) {
    const now = Date.now();
    let locked = 0, inCasket = 0;
    for (const it of inv) {
      const ta = it.tradable_after ? new Date(it.tradable_after).getTime() : 0;
      if (ta > now) locked++;
      if (it.casket_id) inCasket++;
    }
    console.log('[i] 仍在保护期(tradable_after 在未来)的件数:', locked);
    console.log('[i] 存在仓库(casket)里的件数:', inCasket);
    console.log('[i] 单件可用字段:', Object.keys(inv[0]).sort().join(', '));

    const byWeapon = {};
    for (const it of inv) {
      const n = it.market_hash_name || it.name || '(无名)';
      const prefix = n.split('|')[0].trim();
      byWeapon[prefix] = (byWeapon[prefix] || 0) + 1;
    }
    const top = Object.entries(byWeapon).sort((a, b) => b[1] - a[1]).slice(0, 15);
    console.log('[i] 按武器分类(前15):');
    for (const [w, c] of top) console.log(`    ${String(c).padStart(4)}  ${w}`);

    const sample = inv.slice(0, 8).map((it) => ({
      id: it.id,
      name: it.market_hash_name || it.name || '(无名)',
      paint_wear: it.paint_wear,
      paint_seed: it.paint_seed,
      tradable_after: it.tradable_after ? new Date(it.tradable_after).toISOString() : null,
    }));
    console.log('[i] 样例(前8件):');
    for (const s of sample) console.log('   ', JSON.stringify(s));
  }

  console.log('\n[*] 探测结束（未做任何开炉动作）。');
  finish(0);
});

csgo.on('disconnectedFromGC', (reason) => console.error('[!] 与 GC 断开, reason =', reason));

// ---- 开始登录 ----
if (cfg.refreshToken) {
  console.log('[*] 用刷新令牌登录 Steam ...');
  user.logOn({ refreshToken: cfg.refreshToken });
} else {
  console.log(`[*] 开始登录 Steam，accountName = ${cfg.accountName} ...`);
  user.logOn({ accountName: cfg.accountName, password: cfg.password });
}

// 兜底超时
setTimeout(() => { console.error('[!] 超时 120s，未连上 GC，退出。'); finish(2); }, 120000);
