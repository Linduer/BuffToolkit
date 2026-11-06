/**
 * 令牌验证器登录（手机 App 的 30s 动态码；邮箱验证码同样兼容）。
 *
 * 为什么单独写一个：
 *   动态码 30 秒一换，如果"先要码再启动脚本"根本来不及。
 *   所以这个脚本**先把登录发起、停在等验证码那一步**，
 *   然后不断轮询同目录的 验证码.txt —— 你把码写进去，它 1 秒内提交。
 *   提交失败（码过期/输错）会自动重新等下一次，最多 3 次。
 *
 * 登录成功后拿 refreshToken → 存 令牌.json → 再跑 probe.js 只读探测（连 GC + 读库存）。
 * ★全程只读，不调用 craft()。
 *
 * 凭据：环境变量 STEAM_ACCOUNT / STEAM_PASSWORD（不落盘）。
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const SteamUser = require('steam-user');

const HERE = __dirname;
// ★多账号：令牌按账号分文件。设 STEAM_TOKEN_NAME=1 → 令牌_1.json；不设则沿用 令牌.json（号2 兼容）
const ACCT_TOKEN_NAME = (process.env.STEAM_TOKEN_NAME || '').trim();
const TOKEN_FILE = ACCT_TOKEN_NAME ? `令牌_${ACCT_TOKEN_NAME}.json` : '令牌.json';
const TOKEN_PATH = path.join(HERE, TOKEN_FILE);
const CODE_PATH = path.join(HERE, '验证码.txt');   // 固定文件名，方便用户写码（启动时会先删旧的）
const PROBE = path.join(HERE, 'probe.js');

const NODE = process.execPath;
const NODE_MODULES = process.env.NODE_PATH || '';
// 总超时（含等码 + probe 之前），可用 STEAM_TOTAL_TIMEOUT_MS 覆盖
const TOTAL_MS = parseInt(process.env.STEAM_TOTAL_TIMEOUT_MS || '300000', 10);

const accountName = process.env.STEAM_ACCOUNT;
const password = process.env.STEAM_PASSWORD;

if (!accountName || !password) {
  console.error('[x] 需要环境变量 STEAM_ACCOUNT / STEAM_PASSWORD');
  process.exit(1);
}

// 清掉可能残留的旧验证码
try { fs.unlinkSync(CODE_PATH); } catch (_) {}

const user = new SteamUser();
let token = null;
let finished = false;

function finish(code) {
  if (finished) return;
  finished = true;
  try { user.logOff(); } catch (_) {}
  setTimeout(() => process.exit(code), 500);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForCode(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(CODE_PATH)) {
      let t = fs.readFileSync(CODE_PATH, 'utf8').replace(/^\uFEFF/, '').replace(/\s+/g, '');
      if (t) {
        try { fs.unlinkSync(CODE_PATH); } catch (_) {} // 用掉就删，避免复用
        return t;
      }
    }
    await sleep(800);
  }
  return '';
}

user.on('refreshToken', (t) => {
  token = t;
  try {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ refreshToken: t, savedAt: new Date().toISOString() }, null, 2));
    console.log(`[OK] 长期令牌已保存 → ${TOKEN_FILE}（以后免密码免动态码）`);
  } catch (e) { console.error('[!] 保存令牌失败:', e.message); }
});

let guardAttempts = 0;
user.on('steamGuard', async (domain, callback, lastCodeWrong) => {
  guardAttempts++;
  if (guardAttempts > 3) {
    console.error('[x] 连续 3 次验证码不通过，放弃（避免触发登录限流）。');
    finish(1);
    return;
  }
  if (lastCodeWrong) console.log('[!] 上一次的码不对/已过期，重新等新码。');
  const what = domain ? `邮箱验证码（已发到 ${domain}）` : '动态码（手机 App → Steam 令牌 → 令牌验证器）';
  console.log(`[*] 需要验证码 · ${what}（第 ${guardAttempts} 次）。请把码写进：`);
  console.log(`    ${CODE_PATH}`);
  console.log('[*] 正在等待（最多 3 分钟，1 秒轮询）...');
  const code = await waitForCode(180000);
  if (!code) { console.error('[x] 等待超时，没拿到验证码。'); finish(1); return; }
  console.log('[*] 收到验证码，提交中 ...');
  callback(code);
});

user.on('loggedOn', async () => {
  console.log('[OK] 登录成功。steamID =', user.steamID ? user.steamID.toString() : '(?)');
  // 等 refreshToken 落盘
  for (let i = 0; i < 20 && !token; i++) await sleep(200);
  if (token) {
    console.log('\n' + '='.repeat(60));
    console.log('[*] 用令牌跑只读探测（连 GC + 读库存，不开炉）');
    console.log('='.repeat(60) + '\n');
    const env = Object.assign({}, process.env, { STEAM_REFRESH_TOKEN: token });
    if (NODE_MODULES) env.NODE_PATH = NODE_MODULES;
    const r = spawnSync(NODE, [PROBE], { cwd: HERE, env, stdio: 'inherit' });
    finish(r.status === null ? 1 : r.status);
  } else {
    console.error('[!] 登录成功但没拿到 refreshToken，无法继续探测。');
    finish(1);
  }
});

user.on('error', (e) => {
  console.error('[x] Steam 错误:', e.message, '| eresult =', e.eresult);
  if (e.eresult === SteamUser.EResult.AccountLoginDeniedThrottle) {
    console.error('    ★ 登录限流中（失败次数过多），通常需等约 30 分钟再试。');
  }
  if (e.eresult === SteamUser.EResult.InvalidPassword) console.error('    ★ 密码错误。');
  finish(1);
});

console.log(`[*] 发起登录：accountName = ${accountName}`);
user.logOn({ accountName, password });

setTimeout(() => { console.error('[!] 总超时，退出。'); finish(2); }, TOTAL_MS);
