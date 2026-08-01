importScripts('shared.js');

const STORAGE_PENDING = 'pending_data';
const STORAGE_PENDING_RAW = 'pending_data_raw';
const STORAGE_PENDING_DL = 'pending_downloads';
const STORAGE_PENDING_DL_RAW = 'pending_downloads_raw';
const FLUSH_COUNT = 100;

let pendingData = {};
let pendingRawData = {};
let pendingTotal = 0;
let pendingDownloads = {};
let pendingDownloadItems = [];
let pendingDownloadCount = 0;
let excludedDomains = new Set();

/**
 * 从 URL 提取主机名与根域名（非 http 协议返回 null）
 * @param {string} url 请求 URL
 * @returns {{hostname: string, root: string}|null}
 */
function getDomainInfo(url) {
  try {
    const u = new URL(url);
    if (!u.protocol.startsWith('http')) return null;
    const hostname = u.hostname;
    const root = getRootDomain(hostname);
    return { hostname, root };
  } catch {
    return null;
  }
}

/** 将积累的浏览流量 flush 到 chrome.storage.local（失败回填 pending 下次重试） */
async function flushData() {
  if (pendingTotal === 0) return;
  const data = pendingData;
  const rawData = pendingRawData;
  const total = pendingTotal;
  pendingData = {};
  pendingRawData = {};
  pendingTotal = 0;
  await chrome.storage.session.remove(STORAGE_PENDING);
  await chrome.storage.session.remove(STORAGE_PENDING_RAW);
  const todayKey = getDateKey(new Date());
  const aggKey = DAILY_PREFIX + todayKey;
  const rawKey = RAW_PREFIX + todayKey;
  try {
    const result = await chrome.storage.local.get([aggKey, rawKey, STORAGE_DATES]);
    const storedAgg = result[aggKey] || {};
    for (const [domain, bytes] of Object.entries(data)) {
      storedAgg[domain] = (storedAgg[domain] || 0) + bytes;
    }
    const storedRaw = result[rawKey] || {};
    for (const [hostname, bytes] of Object.entries(rawData)) {
      storedRaw[hostname] = (storedRaw[hostname] || 0) + bytes;
    }
    const toSet = { [aggKey]: storedAgg, [rawKey]: storedRaw };
    let dates = result[STORAGE_DATES] || [];
    if (!dates.includes(todayKey)) {
      dates = [...dates, todayKey].sort();
      toSet[STORAGE_DATES] = dates;
    }
    await chrome.storage.local.set(toSet);
  } catch (e) {
    pendingData = { ...pendingData, ...data };
    pendingRawData = { ...pendingRawData, ...rawData };
    pendingTotal += total;
  }
}

/** 将积累的下载流量 flush 到 chrome.storage.local（失败回填 pending 下次重试） */
async function flushDownloads() {
  if (pendingDownloadCount === 0) return;
  const data = pendingDownloads;
  const items = pendingDownloadItems;
  const count = pendingDownloadCount;
  pendingDownloads = {};
  pendingDownloadItems = [];
  pendingDownloadCount = 0;
  await chrome.storage.session.remove(STORAGE_PENDING_DL);
  await chrome.storage.session.remove(STORAGE_PENDING_DL_RAW);
  const todayKey = getDateKey(new Date());
  const aggKey = DL_DAILY_PREFIX + todayKey;
  const rawKey = DL_RAW_PREFIX + todayKey;
  try {
    const result = await chrome.storage.local.get([aggKey, rawKey, STORAGE_DATES]);
    const storedAgg = result[aggKey] || {};
    for (const [domain, bytes] of Object.entries(data)) {
      storedAgg[domain] = (storedAgg[domain] || 0) + bytes;
    }
    const storedRaw = result[rawKey] || [];
    storedRaw.push(...items);
    const toSet = { [aggKey]: storedAgg, [rawKey]: storedRaw };
    let dates = result[STORAGE_DATES] || [];
    if (!dates.includes(todayKey)) {
      dates = [...dates, todayKey].sort();
      toSet[STORAGE_DATES] = dates;
    }
    await chrome.storage.local.set(toSet);
  } catch (e) {
    pendingDownloads = { ...pendingDownloads, ...data };
    pendingDownloadItems = [...pendingDownloadItems, ...items];
    pendingDownloadCount += count;
  }
}

chrome.runtime.onStartup.addListener(async () => {
  // loadExcludedDomains inlined — ponytail: one-call, not worth a function
  try {
    const ex = await chrome.storage.local.get(EXCLUDED_KEY);
    excludedDomains = new Set(ex[EXCLUDED_KEY] || []);
  } catch (e) {
    excludedDomains = new Set();
  }
  try {
    const result = await chrome.storage.session.get([STORAGE_PENDING, STORAGE_PENDING_RAW, STORAGE_PENDING_DL, STORAGE_PENDING_DL_RAW]);
    if (result[STORAGE_PENDING]) {
      pendingData = result[STORAGE_PENDING];
      pendingTotal = Object.values(pendingData).reduce((a, b) => a + b, 0);
    }
    if (result[STORAGE_PENDING_RAW]) {
      pendingRawData = result[STORAGE_PENDING_RAW];
    }
    if (result[STORAGE_PENDING_DL]) {
      pendingDownloads = result[STORAGE_PENDING_DL];
      pendingDownloadCount = Object.values(pendingDownloads).reduce((a, b) => a + b, 0);
    }
    if (result[STORAGE_PENDING_DL_RAW]) {
      pendingDownloadItems = result[STORAGE_PENDING_DL_RAW];
    }
  } catch (e) {
    pendingData = {};
    pendingRawData = {};
    pendingTotal = 0;
    pendingDownloads = {};
    pendingDownloadItems = [];
    pendingDownloadCount = 0;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[EXCLUDED_KEY]) {
    excludedDomains = new Set(changes[EXCLUDED_KEY].newValue || []);
  }
});

chrome.alarms.create('trafficFlush', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'trafficFlush') {
    if (pendingTotal > 0) flushData();
    if (pendingDownloadCount > 0) flushDownloads();
  }
});

let requestCounter = 0;

chrome.webRequest.onCompleted.addListener(
  (details) => {
    let bytes = details.responseSize;
    if (!bytes || bytes <= 0) {
      if (details.responseHeaders) {
        const cl = details.responseHeaders.find(
          h => h.name.toLowerCase() === 'content-length'
        );
        if (cl) bytes = parseInt(cl.value, 10);
      }
      if (!bytes || bytes <= 0) return;
    }
    const info = getDomainInfo(details.url);
    if (!info) return;
    if (excludedDomains.has(info.root)) return;
    pendingData[info.root] = (pendingData[info.root] || 0) + bytes;
    pendingRawData[info.hostname] = (pendingRawData[info.hostname] || 0) + bytes;
    pendingTotal++;
    requestCounter++;
    if (requestCounter >= 10) {
      requestCounter = 0;
      chrome.storage.session.set({
        [STORAGE_PENDING]: pendingData,
        [STORAGE_PENDING_RAW]: pendingRawData,
        [STORAGE_PENDING_DL]: pendingDownloads,
        [STORAGE_PENDING_DL_RAW]: pendingDownloadItems
      });
    }
    if (pendingTotal >= FLUSH_COUNT) {
      flushData();
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders', 'extraHeaders']
);

chrome.downloads.onChanged.addListener(async (delta) => {
  if (!delta.state || delta.state.current !== 'complete') return;
  try {
    const items = await chrome.downloads.search({ id: delta.id });
    if (!items || items.length === 0) return;
    const item = items[0];
    const fileSize = (delta.fileSize && delta.fileSize.current) || item.fileSize;
    if (!fileSize || fileSize <= 0) return;
    if (!item.url) return;
    const info = getDomainInfo(item.url);
    if (!info) return;
    if (excludedDomains.has(info.root)) return;
    pendingDownloads[info.root] = (pendingDownloads[info.root] || 0) + fileSize;
    pendingDownloadItems.push({
      url: item.url,
      hostname: info.hostname,
      root: info.root,
      fileName: item.filename || '',
      fileSize: fileSize,
      mime: item.mime || '',
      time: new Date().toISOString()
    });
    pendingDownloadCount++;
    if (pendingDownloadCount >= FLUSH_COUNT) {
      flushDownloads();
    }
  } catch (e) {
    // Silently handle errors
  }
});
