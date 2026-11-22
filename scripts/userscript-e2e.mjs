/**
 * 「自动取票」用户脚本的端到端冒烟（桌面 Edge，无头）。
 *
 * 不碰学校服务器、不要真账号：本地起两个静态源——
 *   - 假学校（:SCHOOL_PORT）：对任何路径都回一屏 CSS，就像真实的 uniapp.s 落地页；
 *   - PWA（:WEB_PORT）：dist/ 的真实产物。
 * 真实用户脚本里写死了线上域名，这里在读入时把三处地址换成本地的再注入页面，
 * 脚本逻辑本身一字不改。
 *
 * 验证四件事：
 *   1. 落地页带 ticket → 脚本跳到 PWA 的 #token=…&auto=1
 *   2. PWA 把票导入进去，并记下 autoTicket 标记
 *   3. 没有 ticket 的页面，脚本什么都不做
 *   4. 没 auto 标记的设备，票过期时 App 不会自己跳走（不会把人卡在 CSS 页上）
 *
 * 用法：node scripts/userscript-e2e.mjs（先 npm run build）
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const abs = (p) => new globalThis.URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIST = abs('../dist/');
const PROFILE = abs('../.userscript-profile/');
const SCRIPT = abs('../public/userscript/zzu-info-ticket.user.js');
const CDP_PORT = 9341;
const WEB_PORT = 8911;
const SCHOOL_PORT = 8912;
const WEB = `http://127.0.0.1:${WEB_PORT}`;
const SCHOOL = `http://127.0.0.1:${SCHOOL_PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 一张 8 小时的假票：payload 里只放我们解析要用的字段 */
function fakeTicket(hours = 8) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + hours * 3600;
  const inner = [
    b64({ alg: 'HS512' }),
    b64({ exp, iat: exp - hours * 3600, iss: 'https://cas.s.zzu.edu.cn/cas', name: '测试' }),
    'sig-sig-sig-sig-sig-sig',
  ].join('.');
  return [b64({ alg: 'HS512' }), b64({ idToken: inner }), 'outer-sig'].join('.');
}

async function waitForHttp(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* 还没起来 */
    }
    await sleep(250);
  }
  throw new Error(`等不到 ${url}`);
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }
  ready() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(undefined));
      this.ws.addEventListener('error', () => reject(new Error('ws error')));
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expression) {
    const out = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (out.exceptionDetails) {
      const d = out.exceptionDetails;
      throw new Error(d.exception?.description ?? d.text ?? 'eval failed');
    }
    return out.result?.value;
  }
  close() {
    this.ws.close();
  }
}

let passed = 0;
function check(ok, message) {
  if (!ok) throw new Error(`✗ ${message}`);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

/** 读入真实脚本，只把线上地址换成本地；逻辑一字不动 */
function localScript() {
  return readFileSync(SCRIPT, 'utf8')
    .replace('https://rebeca-aa.github.io/zzu-info/pwa/index.html', `${WEB}/pwa/index.html`);
}

async function main() {
  if (!existsSync(DIST)) throw new Error('没找到 dist/，先 npm run build');
  if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });

  const ticket = fakeTicket();

  /* 假学校：任何路径都回 CSS，带不带 ticket 都一样 */
  const school = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/css' });
    res.end('.uni-tabbar{display:block}');
  });
  await new Promise((r) => school.listen(SCHOOL_PORT, '127.0.0.1', r));

  const web = spawn(process.execPath, [abs('./serve-pwa.mjs')], {
    stdio: 'ignore',
    env: { ...process.env, PORT: String(WEB_PORT) },
  });

  let edge;
  try {
    await waitForHttp(`${WEB}/pwa/index.html`);

    edge = spawn(
      EDGE,
      [
        `--user-data-dir=${PROFILE}`,
        `--remote-debugging-port=${CDP_PORT}`,
        '--headless=new',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=Translate,MediaRouter',
        'about:blank',
      ],
      { stdio: 'ignore', env: { ...process.env } },
    );

    let version;
    for (let i = 0; i < 60; i++) {
      try {
        version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
        break;
      } catch {
        await sleep(250);
      }
    }
    if (!version) throw new Error('CDP 没起来');
    console.log('edge:', version['Browser']);

    const page = await (
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })
    ).json();
    const cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    /* 脚本在每个新文档一创建就注入，等价于 @run-at document-start。
       真实脚本自己没有判断域名（那是 @match 的活），所以只对「假学校」这个源注入。 */
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `if (location.origin === ${JSON.stringify(SCHOOL)}) { ${localScript()} }`,
    });

    const where = () => cdp.eval('location.href');
    const waitUrl = async (pred, label, tries = 60) => {
      for (let i = 0; i < tries; i++) {
        const href = await where();
        if (pred(href)) return href;
        await sleep(250);
      }
      throw new Error(`等不到：${label}（当前 ${await where()}）`);
    };

    /* ---------- 1) 带 ticket 的落地页 → 跳到 PWA ---------- */
    console.log('\n1) 学校落地页带 ticket');
    await cdp.send('Page.navigate', {
      url: `${SCHOOL}/static/index.a5c69d49.css?redirect=true&ticket=${encodeURIComponent(ticket)}`,
    });
    /* 跳过去之后 PWA 会马上用 replaceState 抹掉 hash，所以只认「已经到了 PWA 的源」 */
    await waitUrl((h) => h.startsWith(WEB), '跳回 PWA');
    check(true, '脚本把页面从学校落地页跳回了 PWA');

    /* ---------- 2) PWA 导入并记下 auto 标记 ---------- */
    console.log('\n2) PWA 导入票并记下 auto 标记');
    let stored = null;
    for (let i = 0; i < 40 && !stored; i++) {
      stored = await cdp.eval(`localStorage.getItem('zzu-info:tokens')`);
      if (!stored) await sleep(250);
    }
    check(Boolean(stored), '本机已存下登录票（zzu-info:tokens）');
    const hashLeft = await cdp.eval('location.hash');
    check(hashLeft === '', `地址栏里的 hash 已被抹掉（现在是 ${JSON.stringify(hashLeft)}）`);
    let auto = null;
    for (let i = 0; i < 40 && auto === null; i++) {
      auto = await cdp.eval(`localStorage.getItem('zzu-info:autoTicket')`);
      if (auto === null) await sleep(250);
    }
    check(auto === 'true', `autoTicket 标记为 true（实际 ${JSON.stringify(auto)}）`);

    /* ---------- 3) 没有 ticket 的页面：脚本不动 ---------- */
    console.log('\n3) 没有 ticket 的页面');
    await cdp.send('Page.navigate', { url: `${SCHOOL}/static/other.css?foo=bar` });
    await sleep(1200);
    const stay = await where();
    check(stay.startsWith(SCHOOL), `脚本没有乱跳（停在 ${stay.slice(0, 48)}…）`);

    /* ---------- 4) 没装脚本的设备：票过期也不自己跳走 ---------- */
    console.log('\n4) 没有 auto 标记的设备，票过期不跳走');
    await cdp.send('Page.navigate', { url: `${WEB}/pwa/index.html` });
    await waitUrl((h) => h.startsWith(WEB), '回到 PWA');
    await sleep(800);
    /* 清掉 auto 标记，并把票换成一张已过期的 */
    const expired = fakeTicket(-1);
    await cdp.eval(`(() => {
      localStorage.removeItem('zzu-info:autoTicket');
      localStorage.removeItem('zzu-info:tokens');
      return true;
    })()`);
    /* 先去空白页再进来：只改 hash 的同页跳转不会重新加载，import 的 effect 就不会跑 */
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await cdp.send('Page.navigate', { url: `${WEB}/pwa/index.html#token=${encodeURIComponent(expired)}` });

    /* 先等「过期票确实被导入了」：hash 被抹掉 + 票落盘，才说明走到了判断续期的那一步 */
    let imported = null;
    for (let i = 0; i < 40 && !imported; i++) {
      imported = await cdp.eval(`localStorage.getItem('zzu-info:tokens')`);
      if (!imported) await sleep(250);
    }
    check(Boolean(imported), '过期的票已导入（说明走到了续期判断）');
    for (let i = 0; i < 40 && (await cdp.eval('location.hash')) !== ''; i++) await sleep(250);
    check((await cdp.eval('location.hash')) === '', 'hash 已被抹掉，导入流程跑完');

    /* 续期判断发生在 statuses 更新之后；多等一会儿，确认没有任何跳转 */
    await sleep(4000);
    const afterExpired = await where();
    check(afterExpired.startsWith(WEB), `没装脚本的设备留在 App 里（${afterExpired.slice(0, 40)}）`);
    check(!afterExpired.includes('cas.s.zzu.edu.cn'), '没有被带去 CAS');
    check(
      (await cdp.eval(`localStorage.getItem('zzu-info:autoTicket')`)) === null,
      '没有 auto 标记（这台设备没装脚本）',
    );

    /* ---------- 5) 对照组：有 auto 标记的设备，票过期会跳去 CAS ---------- */
    console.log('\n5) 对照：有 auto 标记的设备，票过期会跳去 CAS');
    /* 拦掉去 CAS 的请求（headless 里没网/不该真去学校），只记录「它想去」 */
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'https://cas.s.zzu.edu.cn/*' }] });
    let wentToCas = false;
    cdp.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Fetch.requestPaused') {
        wentToCas = true;
        void cdp.send('Fetch.fulfillRequest', {
          requestId: msg.params.requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'content-type', value: 'text/html' }],
          body: Buffer.from('<p>fake cas</p>').toString('base64'),
        });
      }
    });
    await cdp.eval(`(() => {
      localStorage.setItem('zzu-info:autoTicket', 'true');
      localStorage.removeItem('zzu-info:tokens');
      return true;
    })()`);
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await cdp.send('Page.navigate', { url: `${WEB}/pwa/index.html#token=${encodeURIComponent(expired)}` });
    for (let i = 0; i < 40 && !wentToCas; i++) await sleep(250);
    check(wentToCas, '装了脚本的设备，票过期时 App 自己去了 CAS');

    console.log(`\n全部通过：${passed} 项`);
  } finally {
    edge?.kill();
    web.kill();
    school.close();
    await sleep(300);
    try {
      rmSync(PROFILE, { recursive: true, force: true });
    } catch {
      /* Edge 还没放手，留着也无妨 */
    }
  }
}

main().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
