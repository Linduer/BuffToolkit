/**
 * 扫码登录 → 拿长期令牌 → 顺手跑一次只读 GC 探测。
 *
 * 为什么用扫码而不是账号密码：
 *   - 免密码、免 2FA 动态码（动态码 30s 就过期，脚本抢码几乎不可能稳）
 *   - 一次扫码换来 refreshToken，之后长期免密登录 → 这是"能自动化"的前提
 *
 * ★全程只读，不调用 craft()。
 *
 * 流程：
 *   1) 生成 Steam 登录二维码 → 存成 登录二维码.png
 *   2) 用手机 Steam App 扫码确认
 *   3) 拿到 refreshToken → 存 令牌.json
 *   4) 用该令牌跑 probe.js 做只读探测（连 GC + 读库存）
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { LoginSession, EAuthTokenPlatformType } = require('steam-session');
const QRCode = require('qrcode');

const HERE = __dirname;
// ★多账号：令牌按账号分文件。设 STEAM_TOKEN_NAME=1 → 令牌_1.json；不设则沿用 令牌.json（号2 兼容）
const ACCT_TOKEN_NAME = (process.env.STEAM_TOKEN_NAME || '').trim();
const TOKEN_FILE = ACCT_TOKEN_NAME ? `令牌_${ACCT_TOKEN_NAME}.json` : '令牌.json';
const TOKEN_PATH = path.join(HERE, TOKEN_FILE);
const QR_PNG = path.join(HERE, '登录二维码.png');
const PROBE = path.join(HERE, 'probe.js');

const NODE = process.execPath;
const NODE_MODULES = process.env.NODE_PATH || '';

async function main() {
  // 复用已有令牌就不必重新扫
  if (!process.argv.includes('--force') && fs.existsSync(TOKEN_PATH)) {
    try {
      const t = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8').replace(/^\uFEFF/, ''));
      if (t && t.refreshToken) {
        console.log(`[*] 已有 ${TOKEN_FILE}，跳过扫码，直接用令牌探测。`);
        return runProbe(t.refreshToken);
      }
    } catch (_) { /* 坏文件，重新扫 */ }
  }

  const session = new LoginSession(EAuthTokenPlatformType.SteamClient);
  session.loginTimeout = 300000; // 单位毫秒！给 5 分钟扫码（默认仅 30000）

  // 诊断日志：看清 Steam 每一步回了什么
  session.on('debug', (msg, ...rest) => {
    const s = String(msg);
    if (/poll response|session|qr/i.test(s)) console.log('[dbg]', s, rest.length ? JSON.stringify(rest).slice(0, 240) : '');
  });
  session.on('polling', () => console.log('[*] 二维码就绪，开始轮询授权状态 ...'));
  session.on('remoteInteraction', () => console.log('[!] Steam 要求在手机 App 里交互确认（remoteInteraction）'));

  console.log('[*] 正在向 Steam 申请登录二维码 ...');
  const start = await session.startWithQR();
  const url = start.qrChallengeUrl || start.qrChallengeURL || start;
  console.log('[i] 二维码内容:', String(url).slice(0, 60) + '...');

  await QRCode.toFile(QR_PNG, String(url), { width: 560, margin: 2, errorCorrectionLevel: 'M' });
  console.log('[OK] 二维码已保存：', QR_PNG);
  console.log('[*] 请用手机 Steam App →「扫一扫 / 登录」扫描该图并确认。等待中（最多 5 分钟）...');

  await new Promise((resolve, reject) => {
    session.on('authenticated', () => { console.log('[OK] 手机已确认，登录成功。'); resolve(); });
    session.on('timeout', () => reject(new Error('二维码超时未确认')));
    session.on('error', (e) => {
      console.error('[x] session error:', (e && e.message) || e, '| eresult =', (e && e.eresult) !== undefined ? e.eresult : '(?）');
      if (e && e.eresult === 9) {
        console.error('    EResult 9 = FileNotFound：这个二维码在 Steam 侧已失效 —— 常见原因：');
        console.error('    ① 在手机 App 里点了「拒绝/取消」；② 二维码提交后超时作废；③ 扫的是已过期的旧码。');
      }
      reject(e);
    });
  });

  const token = session.refreshToken;
  if (!token) throw new Error('授权成功但没拿到 refreshToken');
  fs.writeFileSync(TOKEN_PATH, JSON.stringify({ refreshToken: token, savedAt: new Date().toISOString() }, null, 2));
  console.log(`[OK] 长期令牌已保存 → ${TOKEN_FILE}（下次免扫码免密码）`);
  console.log('[i] steamID =', session.steamID ? session.steamID.toString() : '(?)');

  return runProbe(token);
}

function runProbe(token) {
  console.log('\n' + '='.repeat(60));
  console.log('[*] 用令牌跑只读探测（连 GC + 读库存，不开炉）');
  console.log('='.repeat(60) + '\n');
  const env = Object.assign({}, process.env, { STEAM_REFRESH_TOKEN: token });
  if (NODE_MODULES) env.NODE_PATH = NODE_MODULES;
  const r = spawnSync(NODE, [PROBE], { cwd: HERE, env, stdio: 'inherit' });
  process.exit(r.status === null ? 1 : r.status);
}

main().catch((e) => {
  console.error('[x] 失败:', e && e.message ? e.message : e);
  process.exit(1);
});
