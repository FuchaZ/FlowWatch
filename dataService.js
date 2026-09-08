// 常量已在 shared.js 中定义
// ── 域名分组（同一主站的关联域名合并统计，如 bilivideo.com → bilibili.com）──
// 预置映射只覆盖明确的平台自有域名；用户自定义规则存在 storage（DOMAIN_GROUP_KEY），优先级更高。
const PRESET_GROUP_MAP = {
  // 哔哩哔哩
  'hdslb.com': 'bilibili.com',
  'bilivideo.cn': 'bilibili.com',
  'bilivideo.com': 'bilibili.com',
  'biliimg.com': 'bilibili.com',
  'biliapi.net': 'bilibili.com',
  'biliapi.com': 'bilibili.com',
  'acgvideo.com': 'bilibili.com',
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

/** 内存缓存的分组规则（预置 + 用户自定义合并），由 initDomainGroups 加载 */
let domainGroupMap = null;

/**
 * 加载分组规则（预置 + 用户自定义合并）。dashboard/popup 启动时调用一次。
 */
async function initDomainGroups() {
  const result = await chrome.storage.local.get(DOMAIN_GROUP_KEY);
  domainGroupMap = Object.assign({}, PRESET_GROUP_MAP, result[DOMAIN_GROUP_KEY] || {});
}

/**
 * 域名归组：命中映射则返回主站域名，否则原样返回。
 * 数据层不动，仅在聚合/显示时归组。
 * @param {string} domain 已归一化的根域名
 * @returns {string}
 */
function resolveGroup(domain) {
  if (domainGroupMap === null) return domain; // 未初始化时安全降级
  return domainGroupMap[domain] || domain;
}

/**
 * 读取用户自定义分组规则（原始存储内容，管理界面用）
 * @returns {Promise<Object>}
 */
async function getDomainGroupMap() {
  const result = await chrome.storage.local.get(DOMAIN_GROUP_KEY);
  return result[DOMAIN_GROUP_KEY] || {};
}

/**
 * 设置用户自定义分组规则（整体覆盖）
 * @param {Object} map domain → 主站
 */
async function setDomainGroupMap(map) {
  await chrome.storage.local.set({ [DOMAIN_GROUP_KEY]: map || {} });
  domainGroupMap = Object.assign({}, PRESET_GROUP_MAP, map || {});
}

/** 读取有流量记录的日期列表（升序） */
async function getTrackedDates() {
  const result = await chrome.storage.local.get(STORAGE_DATES);
  return result[STORAGE_DATES] || [];
}

/**
 * 批量读取浏览流量原始数据
 * @param {string[]} dates 日期数组 'YYYY-MM-DD'
 * @returns {Promise<Object<string, Object<string, number>>>} date -> {domain: bytes}
 */
async function getBrowseData(dates) {
  const keys = dates.map(d => DAILY_PREFIX + d);
  const items = await chrome.storage.local.get(keys);
  const result = {};
  for (const date of dates) {
    result[date] = items[DAILY_PREFIX + date] || {};
  }
  return result;
}

/**
 * 批量读取下载流量原始数据
 * @param {string[]} dates 日期数组 'YYYY-MM-DD'
 * @returns {Promise<Object<string, Object<string, number>>>} date -> {domain: bytes}
 */
async function getDownloadData(dates) {
  const keys = dates.map(d => DL_DAILY_PREFIX + d);
  const items = await chrome.storage.local.get(keys);
  const result = {};
  for (const date of dates) {
    result[date] = items[DL_DAILY_PREFIX + date] || {};
  }
  return result;
}

/**
 * 把日期数组聚合成 {daily, monthly}：daily=按天明细，monthly=跨天按域名求和
 * @param {string[]} dates 日期数组 'YYYY-MM-DD'
 * @param {(dates:string[])=>Promise<Object>} dailyGetter 批量读取函数
 * @returns {Promise<{daily: Object, monthly: Object}>}
 */
async function aggregateDates(dates, dailyGetter) {
  if (dates.length === 0) return { daily: {}, monthly: {} };
  const daily = await dailyGetter(dates);
  const monthly = {};
  for (const [dateStr, data] of Object.entries(daily)) {
    for (const [domain, bytes] of Object.entries(data)) {
      // 域名分组：关联域名（如 bilivideo.com）并入主站（bilibili.com）统计
      const group = resolveGroup(domain);
      monthly[group] = (monthly[group] || 0) + bytes;
    }
  }
  return { daily, monthly };
}

/**
 * 获取某月/某年浏览流量聚合（dashboard 主数据源）
 * @param {number} year 年份
 * @param {number} [month] 月份（缺省=整年）
 * @returns {Promise<{daily: Object, monthly: Object}>} daily: date->{domain:bytes}，monthly: {domain:bytes}
 */
async function getBrowseAggregated(year, month) {
  const prefix = month !== undefined
    ? `${year}-${String(month).padStart(2, '0')}`
    : String(year);
  const tracked = await getTrackedDates();
  return aggregateDates(tracked.filter(d => d.startsWith(prefix)), getBrowseData);
}

/** 最近 N 天浏览流量聚合（近7天/近30天视图） */
async function getRecentBrowseAggregated(days) {
  return aggregateDates(getRecentDateKeys(days), getBrowseData);
}

/**
 * 获取某月/某年下载流量聚合（dashboard 主数据源）
 * @param {number} year 年份
 * @param {number} [month] 月份（缺省=整年）
 * @returns {Promise<{daily: Object, monthly: Object}>} 结构与 getBrowseAggregated 一致
 */
async function getDownloadAggregated(year, month) {
  const prefix = month !== undefined
    ? `${year}-${String(month).padStart(2, '0')}`
    : String(year);
  const tracked = await getTrackedDates();
  return aggregateDates(tracked.filter(d => d.startsWith(prefix)), getDownloadData);
}

/** 最近 N 天下载流量聚合（近7天/近30天视图） */
async function getRecentDownloadAggregated(days) {
  return aggregateDates(getRecentDateKeys(days), getDownloadData);
}

/**
 * 合并某一天浏览+下载（popup「今日」数据源）
 * @param {string} dateKey 'YYYY-MM-DD'
 * @returns {Promise<Object<string, number>>} domain -> bytes
 */
async function getMergedDayData(dateKey) {
  const [browse, dl] = await Promise.all([
    chrome.storage.local.get(DAILY_PREFIX + dateKey),
    chrome.storage.local.get(DL_DAILY_PREFIX + dateKey)
  ]);
  // 域名分组：关联域名并入主站
  const merged = {};
  for (const [domain, bytes] of Object.entries(browse[DAILY_PREFIX + dateKey] || {})) {
    const g = resolveGroup(domain);
    merged[g] = (merged[g] || 0) + bytes;
  }
  for (const [domain, bytes] of Object.entries(dl[DL_DAILY_PREFIX + dateKey] || {})) {
    const g = resolveGroup(domain);
    merged[g] = (merged[g] || 0) + bytes;
  }
  return merged;
}

/**
 * 合并某月浏览+下载（popup「本月」数据源）
 * @param {string} monthKey 'YYYY-MM'
 * @returns {Promise<Object<string, number>>} domain -> bytes
 */
async function getMergedMonthData(monthKey) {
  const dates = (await getTrackedDates()).filter(d => d.startsWith(monthKey));
  if (dates.length === 0) return {};
  const [browseItems, dlItems] = await Promise.all([
    getBrowseData(dates),
    getDownloadData(dates)
  ]);
  const aggregated = {};
  for (const date of dates) {
    const browseData = browseItems[date] || {};
    for (const [domain, bytes] of Object.entries(browseData)) {
      // 域名分组：关联域名并入主站
      const g = resolveGroup(domain);
      aggregated[g] = (aggregated[g] || 0) + bytes;
    }
    const dlData = dlItems[date] || {};
    for (const [domain, bytes] of Object.entries(dlData)) {
      const g = resolveGroup(domain);
      aggregated[g] = (aggregated[g] || 0) + bytes;
    }
  }
  return aggregated;
}

/**
 * 计算浏览/下载分开的总量（popup 顶部 breakdown）
 * @param {string} dateKey 'YYYY-MM-DD' 或 'YYYY-MM'
 * @param {boolean} isMonth 是否为月粒度
 * @returns {Promise<{browse: number, download: number}>}
 */
async function getBreakdownTotals(dateKey, isMonth) {
  if (isMonth) {
    const dates = (await getTrackedDates()).filter(d => d.startsWith(dateKey));
    if (dates.length === 0) return { browse: 0, download: 0 };
    const [browseItems, dlItems] = await Promise.all([
      getBrowseData(dates),
      getDownloadData(dates)
    ]);
    let browseTotal = 0;
    for (const date of dates) {
      for (const v of Object.values(browseItems[date] || {})) { browseTotal += v; }
    }
    let dlTotal = 0;
    for (const date of dates) {
      for (const v of Object.values(dlItems[date] || {})) { dlTotal += v; }
    }
    return { browse: browseTotal, download: dlTotal };
  }
  const [bRow, dlRow] = await Promise.all([
    chrome.storage.local.get(DAILY_PREFIX + dateKey),
    chrome.storage.local.get(DL_DAILY_PREFIX + dateKey)
  ]);
  const browseTotal = Object.values(bRow[DAILY_PREFIX + dateKey] || {}).reduce((a, b) => a + b, 0);
  const dlTotal = Object.values(dlRow[DL_DAILY_PREFIX + dateKey] || {}).reduce((a, b) => a + b, 0);
  return { browse: browseTotal, download: dlTotal };
}

/**
 * 获取某月细分域名数据（dashboard 域名详情）
 * @returns {Promise<Object<string, number>>} hostname -> bytes
 */
async function getRawDataForMonth(year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const tracked = (await getTrackedDates()).filter(d => d.startsWith(prefix));
  if (tracked.length === 0) return {};
  const keys = tracked.map(d => RAW_PREFIX + d);
  const items = await chrome.storage.local.get(keys);
  const aggregated = {};
  for (const dateStr of tracked) {
    for (const [hostname, bytes] of Object.entries(items[RAW_PREFIX + dateStr] || {})) {
      aggregated[hostname] = (aggregated[hostname] || 0) + bytes;
    }
  }
  return aggregated;
}

/** @returns {Promise<Set<string>>} 已排除域名集合 */
async function getExcludedDomains() {
  const result = await chrome.storage.local.get(EXCLUDED_KEY);
  return new Set(result[EXCLUDED_KEY] || []);
}

/** 将域名加入排除列表（不再统计） */
async function addExclusion(domain) {
  const result = await chrome.storage.local.get(EXCLUDED_KEY);
  const list = result[EXCLUDED_KEY] || [];
  if (!list.includes(domain)) {
    list.push(domain);
    await chrome.storage.local.set({ [EXCLUDED_KEY]: list });
  }
}

/** 将域名移出排除列表 */
async function removeExclusion(domain) {
  const result = await chrome.storage.local.get(EXCLUDED_KEY);
  let list = result[EXCLUDED_KEY] || [];
  list = list.filter(d => d !== domain);
  await chrome.storage.local.set({ [EXCLUDED_KEY]: list });
}

/** 清空所有统计数据（不可恢复） */
async function clearAllData() {
  await chrome.storage.local.clear();
}

/**
 * 获取存储用量
 * @returns {Promise<{used: number, quota: number, pct: number}>}
 */
async function getStorageUsage() {
  const used = await chrome.storage.local.getBytesInUse(null);
  const quota = chrome.storage.local.QUOTA_BYTES || 5242880;
  return { used, quota, pct: used / quota };
}

/**
 * 删除 daysToKeep 天之前的所有流量数据（存储压力自动清理）
 * @param {number} daysToKeep 保留天数
 * @returns {Promise<number>} 清理的天数
 */
async function pruneOldData(daysToKeep) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const dates = await getTrackedDates();
  const toDelete = dates.filter(d => d < cutoffStr);
  if (toDelete.length === 0) return 0;
  const keys = toDelete.flatMap(d => [
    DAILY_PREFIX + d, DL_DAILY_PREFIX + d, RAW_PREFIX + d, DL_RAW_PREFIX + d
  ]);
  await chrome.storage.local.remove(keys);
  const remaining = dates.filter(d => d >= cutoffStr);
  await chrome.storage.local.set({ [STORAGE_DATES]: remaining });
  return toDelete.length;
}
