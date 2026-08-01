// FlowWatch favicon 解析逻辑回归测试（纯 node，无浏览器依赖）
// 运行: npm test
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8');

// ── mock 浏览器环境（规则化：rule(url) 返回 true=加载成功） ──
const calls = [];
let rule = () => false;   // 默认全失败
let fetchHtml = () => null; // url -> html 或 null

class MockImage {
  set src(url) {
    this._src = url;
    calls.push(url);
    setTimeout(() => {
      if (rule(url)) this.onload && this.onload();
      else this.onerror && this.onerror();
    }, 5);
  }
  get src() { return this._src; }
}
global.Image = MockImage;
global.fetch = async (url) => {
  calls.push('FETCH ' + url);
  const html = fetchHtml(url);
  if (html === undefined) throw new Error('no mock for ' + url);
  if (html === null) return { ok: false };
  const enc = new TextEncoder();
  const buf = enc.encode(html);
  return {
    ok: true,
    body: { getReader: () => {
      let done = false;
      return { read: async () => {
        if (done) return { done: true, value: undefined };
        done = true;
        return { done: false, value: buf };
      }, cancel: () => {} };
    }}
  };
};

const loader = new Function(code + '\nreturn { resolveFaviconUrl, extractIconHref, getRootDomain };');
const api = loader();

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name); }
}

(async () => {
  console.log('--- 测试 1: 直连 /favicon.ico 成功即返回 ---');
  calls.length = 0;
  rule = u => u === 'https://example.com/favicon.ico';
  const r1 = await api.resolveFaviconUrl('example.com');
  check('返回直连 URL', r1 === 'https://example.com/favicon.ico');
  check('只探测 1 个 URL', calls.filter(c => !c.startsWith('FETCH')).length === 1);

  console.log('--- 测试 2: 子域直连失败 → 根域直连成功 ---');
  calls.length = 0;
  rule = u => u === 'https://example.com/favicon.ico';
  const r2 = await api.resolveFaviconUrl('cdn.example.com');
  check('返回根域直连 URL', r2 === 'https://example.com/favicon.ico');
  check('探测了子域+根域 2 个 URL', calls.filter(c => !c.startsWith('FETCH')).length === 2);

  console.log('--- 测试 3: 直连全败 → HTML 解析救回（无映射普通域名） ---');
  calls.length = 0;
  rule = u => u === 'https://i0.somesite.com/icon.png'; // 只有 HTML 声明的 icon 能加载
  fetchHtml = (url) => url === 'https://somesite.com/' ? '<html><head><link rel="icon" href="https://i0.somesite.com/icon.png"></head></html>' : null;
  const r3 = await api.resolveFaviconUrl('somesite.com');
  check('返回 HTML 声明的 icon URL', r3 === 'https://i0.somesite.com/icon.png');
  check('发生了 1 次 HTML fetch', calls.filter(c => c.startsWith('FETCH')).length === 1);
  check('HTML icon 也被探测过', calls.includes('https://i0.somesite.com/icon.png'));

  console.log('--- 测试 4: 缓存去重（同域名不重复解析） ---');
  calls.length = 0;
  const r4a = await api.resolveFaviconUrl('somesite.com');
  const r4b = await api.resolveFaviconUrl('somesite.com');
  check('两次结果一致', r4a === r4b && r4a === 'https://i0.somesite.com/icon.png');
  check('缓存命中，无新增请求', calls.length === 0);

  console.log('--- 测试 5: 全败域名走 favicon.im 兜底 ---');
  calls.length = 0;
  fetchHtml = () => null;
  rule = u => u.includes('favicon.im'); // 只有 favicon.im 成功
  const r5 = await api.resolveFaviconUrl('nofavicon.com');
  check('返回 favicon.im URL', r5 === 'https://favicon.im/nofavicon.com');

  console.log('--- 测试 6: favicon.im 熔断（失败一次后不再尝试） ---');
  calls.length = 0;
  rule = () => false; // 全失败
  const r6 = await api.resolveFaviconUrl('nofavicon2.com');
  check('favicon.im 失败后返回 null（灰块）', r6 === null);
  calls.length = 0;
  rule = u => u.includes('favicon.im'); // 现在 favicon.im 通了
  const r6b = await api.resolveFaviconUrl('nofavicon3.com');
  check('熔断生效：不再请求 favicon.im', !calls.some(c => c.includes('favicon.im')));
  check('熔断后直接返回 null', r6b === null);

  console.log('--- 测试 7: extractIconHref 属性顺序无关 ---');
  const h = '<link href="/a.ico" rel="shortcut icon"><link href="https://cdn.x.com/b.svg" rel="icon"><link rel="apple-touch-icon" href="/apple.png">';
  check('href 在前也能提取', api.extractIconHref(h, 'https://x.com/') === 'https://x.com/a.ico');
  check('getRootDomain 正常', api.getRootDomain('a.b.bilibili.com') === 'bilibili.com');

  console.log('--- 测试 8: CDN 映射表（hdslb.com → 主站 bilibili.com） ---');
  calls.length = 0;
  rule = u => u === 'https://bilibili.com/favicon.ico'; // 只有主站直连成功
  fetchHtml = () => null;
  const r8 = await api.resolveFaviconUrl('hdslb.com');
  check('返回主站 bilibili.com 的 favicon', r8 === 'https://bilibili.com/favicon.ico');
  check('候选顺序：先试原域再试主站', calls.filter(c => !c.startsWith('FETCH'))[0] === 'https://hdslb.com/favicon.ico');

  console.log('--- 测试 9: 无映射的普通域名不受影响 ---');
  calls.length = 0;
  rule = u => u === 'https://example.com/favicon.ico';
  const r9 = await api.resolveFaviconUrl('example.com');
  check('正常直连返回', r9 === 'https://example.com/favicon.ico');

  console.log('--- 测试 10: 映射表命中时 HTML 用主站（owner）解析 ---');
  calls.length = 0;
  rule = u => u === 'https://i0.hdslb.com/bfs/512.png';
  fetchHtml = (url) => url === 'https://bilibili.com/'
    ? '<html><head><link rel="icon" href="https://i0.hdslb.com/bfs/512.png"></head></html>'
    : null;
  const r10 = await api.resolveFaviconUrl('bilivideo.cn');
  check('HTML 层用主站解析并返回图标', r10 === 'https://i0.hdslb.com/bfs/512.png');

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
