// ── 共享常量 ────────────────────────────────────────────────
const DAILY_PREFIX = 'traffic_daily_';
const DL_DAILY_PREFIX = 'download_daily_';
const RAW_PREFIX = 'traffic_raw_';
const DL_RAW_PREFIX = 'download_raw_';
const STORAGE_DATES = 'tracked_dates';
const EXCLUDED_KEY = 'excluded_domains';

const DEFAULT_FAVICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2Ij48cmVjdCB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHJ4PSIzIiBmaWxsPSIjZThlY2Y0Ii8+PGNpcmNsZSBjeD0iOCIgY3k9IjYiIHI9IjMiIGZpbGw9IiNkMGQ1ZGQiLz48cGF0aCBkPSJNNCAxMiBRIDggMTQgMTIgMTIiIHN0cm9rZT0iI2QwZDVkZCIgc3Ryb2tlLXdpZHRoPSIxLjUiIGZpbGw9Im5vbmUiLz48L3N2Zz4=';

// ── 域名归一化 ────────────────────────────────────────────────
/**
 * 域名归一化：去掉 www、识别多段 TLD，返回注册域
 * @param {string} hostname 完整主机名
 * @returns {string} 根域名（IP/localhost 原样返回）
 */
function getRootDomain(hostname) {
  hostname = hostname.toLowerCase().replace(/\.+$/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || /^\[/.test(hostname)) return hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return hostname;
  let parts = hostname.split('.');
  if (parts[0] === 'www') parts = parts.slice(1);
  if (parts.length <= 2) return parts.join('.');
  const multiPartTLDs = new Set([
    'com.cn','net.cn','org.cn','gov.cn','edu.cn','mil.cn',
    'co.jp','ne.jp','or.jp','ac.jp','go.jp','ed.jp',
    'co.uk','org.uk','ac.uk','gov.uk','me.uk','net.uk','ltd.uk','plc.uk',
    'com.tw','org.tw','gov.tw','net.tw','edu.tw',
    'com.hk','org.hk','gov.hk','edu.hk','net.hk',
    'co.kr','or.kr','ne.kr','go.kr','ac.kr','pe.kr','re.kr',
    'com.au','net.au','org.au','edu.au','gov.au',
    'co.nz','org.nz','net.nz','ac.nz','govt.nz',
    'co.in','org.in','net.in','gov.in','ac.in','edu.in','firm.in','gen.in','ind.in',
    'co.za','org.za','net.za','gov.za','ac.za','alt.za',
    'com.br','org.br','net.br','gov.br','edu.br',
    'com.mx','org.mx','net.mx','gob.mx','edu.mx',
    'com.ar','org.ar','net.ar','gov.ar','edu.ar',
    'co.il','org.il','net.il','ac.il','gov.il',
    'co.th','or.th','go.th','ac.th','in.th','net.th',
    'com.sg','org.sg','gov.sg','edu.sg','net.sg',
    'co.id','or.id','ac.id','go.id','net.id','sch.id',
    'com.tr','org.tr','net.tr','gov.tr','edu.tr','biz.tr',
    'co.at','or.at','ac.at','gv.at',
    'co.hu','info.hu','org.hu','priv.hu',
    'co.ve','com.ve','edu.ve','gob.ve','info.ve','net.ve','org.ve','web.ve',
    'co.ug','ac.ug','go.ug','ne.ug','or.ug','org.ug','sc.ug',
    'com.ua','edu.ua','gov.ua','net.ua','org.ua',
    'com.eg','edu.eg','eg','gov.eg','net.eg','org.eg',
    'com.ng','edu.ng','gov.ng','net.ng','org.ng','sch.ng',
    'com.pk','edu.pk','gob.pk','gov.pk','net.pk','org.pk','web.pk',
    'com.ph','edu.ph','gov.ph','net.ph','org.ph',
    'co.ke','ac.ke','go.ke','ne.ke','or.ke','org.ke',
    'nom.ad','co.ma','net.ma','gov.ma','org.ma','press.ma',
    'co.bn','com.bn','edu.bn','gov.bn','net.bn','org.bn',
    'co.cr','ac.cr','ed.cr','fi.cr','go.cr','or.cr','sa.cr',
    'com.do','edu.do','gob.do','gov.do','mil.do','net.do','org.do',
    'com.gt','edu.gt','gob.gt','ind.gt','mil.gt','net.gt','org.gt',
    'com.sv','edu.sv','gob.sv','net.sv','org.sv','red.sv',
    'com.pe','edu.pe','gob.pe','mil.pe','net.pe','org.pe','nom.pe',
    'com.ec','edu.ec','fin.ec','gob.ec','info.ec','med.ec','net.ec','org.ec','pro.ec',
    'com.py','coop.py','edu.py','gov.py','mil.py','net.py','org.py',
    'com.uy','edu.uy','gub.uy','mil.uy','net.uy','org.uy',
    'net.au','com.au','org.au',
    'blogspot.com','blogspot.co.uk','wordpress.com','github.io','firebaseapp.com',
    'netlify.app','vercel.app','pages.dev','fly.dev','railway.app',
    's3.amazonaws.com','cloudfront.net','azurewebsites.net',
    'herokuapp.com','herokussl.com','onrender.com',
    'r2.dev','workers.dev','deno.dev','pages.dev'
  ]);
  const lastTwo = parts.slice(-2).join('.');
  const lastThree = parts.slice(-3).join('.');
  const lastFour = parts.slice(-4).join('.');
  if (multiPartTLDs.has(lastFour) && parts.length >= 5) return parts.slice(-5).join('.');
  if (multiPartTLDs.has(lastThree) && parts.length >= 4) return parts.slice(-4).join('.');
  if (multiPartTLDs.has(lastTwo) && parts.length >= 3) return parts.slice(-3).join('.');
  return parts.slice(-2).join('.');
}

// ── CDN/资源域名 → 主站映射（领域知识：CDN 域名自身无图标，取主站图标）──
// 这些是各大平台的静态资源/CDN 域名，自身没有 favicon，但主站有。
// 遇到新没图标的 CDN 域名时，查出所属平台，在这里补一条即可覆盖整类。
const CDN_OWNER_MAP = {
  // 哔哩哔哩
  'hdslb.com': 'bilibili.com',
  'bilivideo.cn': 'bilibili.com',
  'bilivideo.com': 'bilibili.com',
  'biliimg.com': 'bilibili.com',
  'biliapi.net': 'bilibili.com',
  // GitHub
  'githubassets.com': 'github.com',
  'githubusercontent.com': 'github.com',
  'github.io': 'github.com',
  // 阿里 / 淘宝
  'aliyuncs.com': 'aliyun.com',
  'alicdn.com': 'aliyun.com',
  'taobaocdn.com': 'taobao.com',
  'tbcdn.cn': 'taobao.com',
  'mmstat.com': 'taobao.com',
  // 腾讯 / QQ
  'qpic.cn': 'qq.com',
  'qlogo.cn': 'qq.com',
  'gtimg.cn': 'qq.com',
  'gtimg.com': 'qq.com',
  'myqcloud.com': 'tencent.com',
  'qcloud.com': 'tencent.com',
  'tencentcs.com': 'tencent.com',
  // 字节跳动 / 抖音 / 头条
  'volccdn.com': 'volcengine.com',
  'byteimg.com': 'douyin.com',
  'bytecdn.cn': 'douyin.com',
  'douyinstatic.com': 'douyin.com',
  'pstatp.com': 'toutiao.com',
  'byteacctimg.com': 'toutiao.com',
  // CSDN
  'csdnimg.cn': 'csdn.net',
  // 京东 / 拼多多
  '360buyimg.com': 'jd.com',
  'pddpic.com': 'yangkeduo.com',
  // 网易 / 百度 / 华为 / 小米
  '126.net': '163.com',
  'ws126.net': '163.com',
  'bdstatic.com': 'baidu.com',
  'bcebos.com': 'baidu.com',
  'myhuaweicloud.com': 'huawei.com',
  'mi-img.com': 'xiaomi.com',
  // 微博 / 知乎
  'sinaimg.cn': 'weibo.com',
  'sinajs.cn': 'weibo.com',
  'zhimg.com': 'zhihu.com'
};

// ── Favicon：三级解析 + 缓存 + 并发控制 ──────────────────────
// 1) 直连 https://{domain}/favicon.ico（原域 → 根域 → CDN 映射主站）
// 2) 抓取主站主页 HTML，解析 <link rel="icon"> 声明（解决 favicon 不在标准路径的站点）
// 3) favicon.im 兜底（Cloudflare，国内可达；不可达时自动熔断，之后不再尝试）
// 全部失败 → 灰色 SVG 占位
const faviconCache = new Map();     // domain -> Promise<url|null>，会话内去重
const FAVICON_MAX_CONCURRENCY = 6;  // 同时最多 6 个解析任务，避免一次渲染打爆网络
let faviconActive = 0;
const faviconQueue = [];
let faviconImDown = false;          // favicon.im 熔断开关

function faviconAcquire() {
  return new Promise(resolve => {
    if (faviconActive < FAVICON_MAX_CONCURRENCY) { faviconActive++; resolve(); }
    else faviconQueue.push(resolve);
  });
}
function faviconRelease() {
  const next = faviconQueue.shift();
  if (next) next(); else faviconActive--;
}

// 用隐藏 Image 探测 URL 能否真实加载（与最终展示一致的判定）
/**
 * 用隐藏 Image 探测 URL 能否真实加载（与最终展示一致的判定）
 * @param {string} url 图片地址
 * @param {number} [timeoutMs=4000] 超时时间
 * @returns {Promise<boolean>}
 */
function probeImageUrl(url, timeoutMs = 4000) {
  return new Promise(resolve => {
    const img = new Image();
    let settled = false;
    const finish = ok => { if (!settled) { settled = true; clearTimeout(timer); resolve(ok); } };
    const timer = setTimeout(() => finish(false), timeoutMs);
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  });
}

// 从 HTML 提取第一个 rel 含 icon 的 <link> href（属性顺序无关，兼容 rel="shortcut icon" / apple-touch-icon）
/**
 * 从 HTML 提取第一个 rel 含 icon 的 <link> href
 * @param {string} html HTML 文本
 * @param {string} baseUrl 用于解析相对路径
 * @returns {string|null} 图标绝对 URL
 */
function extractIconHref(html, baseUrl) {
  const linkRe = /<link\b[^>]*>/gi;
  let m;
  while ((m = linkRe.exec(html))) {
    const rel = /rel=["']([^"']*)["']/i.exec(m[0]);
    if (!rel || !/\bicon\b/i.test(rel[1])) continue;
    const href = /href=["']([^"']+)["']/i.exec(m[0]);
    if (href) {
      try { return new URL(href[1], baseUrl).href; } catch { /* 非法 URL 跳过 */ }
    }
  }
  return null;
}

// 抓取域名主页前 64KB，提取 icon 声明（扩展页面有 host_permissions，不受 CORS 限制）
/**
 * 抓取域名主页前 64KB，解析 <link rel="icon"> 声明
 * @param {string} domain 域名
 * @returns {Promise<string|null>} 图标 URL 或 null
 */
async function parseIconFromHtml(domain) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch(`https://${domain}/`, { signal: controller.signal, redirect: 'follow' });
    if (!resp.ok) return null;
    let text = '';
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > 65536) break;
    }
    reader.cancel();
    return extractIconHref(text, `https://${domain}/`);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * favicon 三级解析主流程：直连(原域→根域→CDN主站) → HTML 解析 → favicon.im 兜底
 * @param {string} domain 域名
 * @returns {Promise<string|null>} 图标 URL 或 null（灰块）
 */
async function doResolveFavicon(domain) {
  const root = getRootDomain(domain);
  const owner = CDN_OWNER_MAP[domain] || CDN_OWNER_MAP[root] || null;
  const primary = owner || root; // HTML 解析与第三方兜底优先用主站

  // 候选直连列表：原域 → 根域 → CDN 映射主站，去重保序
  const candidates = [...new Set([domain, root, owner].filter(Boolean))];

  // 1) 直连 /favicon.ico
  for (const cand of candidates) {
    const url = `https://${cand}/favicon.ico`;
    await faviconAcquire();
    try {
      if (await probeImageUrl(url, 3000)) return url;
    } finally { faviconRelease(); }
  }

  // 2) 主站主页 HTML 解析（兼容 favicon 不在标准路径的站点）
  await faviconAcquire();
  try {
    const iconUrl = await parseIconFromHtml(primary);
    if (iconUrl && await probeImageUrl(iconUrl, 3000)) return iconUrl;
  } finally { faviconRelease(); }

  // 3) favicon.im 兜底（熔断：网络不可达时试一次就关，避免每次渲染都白等）
  if (!faviconImDown) {
    await faviconAcquire();
    try {
      const im = `https://favicon.im/${primary}`;
      if (await probeImageUrl(im, 4000)) return im;
      faviconImDown = true;
    } finally { faviconRelease(); }
  }
  return null;
}

/**
 * favicon URL 解析入口（会话级缓存，Promise 去重）
 * @param {string} domain 域名
 * @returns {Promise<string|null>}
 */
function resolveFaviconUrl(domain) {
  if (!faviconCache.has(domain)) {
    faviconCache.set(domain, doResolveFavicon(domain));
  }
  return faviconCache.get(domain);
}

/**
 * 创建 favicon <img> 元素：先显示灰色占位，异步解析成功后替换为真实图标
 * @param {string} domain 域名
 * @returns {HTMLImageElement}
 */
function createFavicon(domain) {
  const img = new Image();
  img.className = 'domain-favicon';
  img.alt = '';
  img.loading = 'lazy';
  img.src = DEFAULT_FAVICON;
  resolveFaviconUrl(domain).then(url => {
    if (url) img.src = url; // 解析完成时若元素已被移除，设置 src 无害
  });
  return img;
}

// ── 主题（暗色模式）────────────────────────────────────────
const THEME_KEY = 'flowwatch-theme'; // 'auto' | 'light' | 'dark'

/** @returns {'auto'|'light'|'dark'} 用户存储的主题设置 */
function getStoredTheme() {
  const v = localStorage.getItem(THEME_KEY);
  return (v === 'light' || v === 'dark') ? v : 'auto';
}

/**
 * 应用主题到 <html data-theme>：auto 时按系统偏好解析为 light/dark 显式设置
 * @param {'auto'|'light'|'dark'} theme
 */
function applyTheme(theme) {
  const effective = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.dataset.theme = effective;
}

/** 页面加载时初始化主题；auto 模式下系统主题变化时实时跟随 */
function initTheme() {
  applyTheme(getStoredTheme());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'auto') applyTheme('auto');
  });
}

/** 两态切换：在当前生效主题上取反（浅 ⇄ 深），持久化为显式主题。恢复跟随系统用右键（见页面绑定） */
function toggleTheme() {
  const next = currentEffectiveTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
  return next;
}

/** @returns {'light'|'dark'} 当前实际生效的主题（含系统偏好） */
function currentEffectiveTheme() {
  const t = getStoredTheme();
  if (t !== 'auto') return t;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// ── 数字滚动动画（popup/dashboard 共用）──────────────────────
/**
 * 数字滚动动画：从 0 缓动到目标值（easeOutCubic）
 * @param {HTMLElement} el 目标元素
 * @param {number} target 目标数值
 * @param {(v:number)=>string} formatFn 格式化函数
 * @param {number} [duration=500] 动画时长 ms
 */
function animateNumber(el, target, formatFn, duration = 500) {
  const startTime = performance.now();
  function tick(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    el.textContent = formatFn(target * eased);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/**
 * 字节数格式化为可读字符串
 * @param {number} bytes 字节数
 * @returns {string} 如 "1.2 GB"
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

/**
 * 最近 N 天（含今天）的日期 key 数组，按时间升序（日历日，无数据日也在内）
 * @param {number} days 天数（如 7 / 30）
 * @returns {string[]} 'YYYY-MM-DD' 数组
 */
function getRecentDateKeys(days) {
  const dates = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dates.push(getDateKey(d));
  }
  return dates;
}

function getDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}