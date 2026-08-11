# FlowWatch 流量监控 — 项目概况

Chromium MV3 扩展，按域名统计浏览/下载流量，按月/年查看趋势、域名排名、细分域名和 SVG 图表。

## 技术栈

- Manifest V3 (service worker 作为后台)
- `chrome.webRequest` / `chrome.downloads` API 采集流量
- `chrome.storage.local` (5MB 配额) + `chrome.storage.session` (崩溃恢复)
- 纯前端：无框架，原生 JS + CSS + 内联 SVG 图表
- 所有 HTML 以 `<script src="shared.js">` + `<script src="dataService.js">` 开头，再加载页面逻辑

## 文件职责

| 文件 | 职责 |
|---|---|
| `manifest.json` | 权限: webRequest, downloads, storage, unlimitedStorage, alarms; host_permissions: `<all_urls>` |
| `background.js` | service worker: webRequest 拦截、downloads 监听、域名归一化、批量 flush、崩溃恢复 |
| `dataService.js` | 所有 `chrome.storage.local` 读写操作：日期管理、浏览/下载聚合、排除管理、存储用量、自动剪枝 |
| `shared.js` | 共享函数：`createFavicon(domain)`（三级解析）、`animateNumber`、`formatBytes(bytes)`、`DEFAULT_FAVICON` |
| `popup.js` + `.html` + `.css` | 弹出面板：今日/本月 Top 10 排名 + 排除按钮 |
| `dashboard.js` + `.html` + `.css` | 完整仪表盘：年月切换、摘要卡片、SVG 趋势图、域名排行、域名详情、SVG 细分柱状图、排除管理、CSV 导出、数据重置、存储条 |
| `generate_icon.ps1` | PowerShell 脚本生成深海蓝色系图标（渐变底 + 白色环形图 + 琥珀金数据点），16~128px 多尺寸 |

## 数据模型

### chrome.storage.local 键

```
traffic_daily_YYYY-MM-DD        → { "domain": bytes, ... }  浏览聚合
traffic_raw_YYYY-MM-DD          → { "hostname": bytes, ... } 浏览细分
download_daily_YYYY-MM-DD      → { "domain": bytes, ... }  下载聚合
download_raw_YYYY-MM-DD        → [ { url, hostname, root, fileName, fileSize, mime, time }, ... ]
tracked_dates                   → [ "YYYY-MM-DD", ... ]     日期索引（有序）
excluded_domains                → [ "domain", ... ]         排除列表
```

### chrome.storage.session 键（崩溃恢复）

```
pending_data         → { "domain": bytes, ... }    未 flush 的浏览
pending_data_raw     → { "hostname": bytes, ... }  未 flush 的浏览细分
pending_downloads    → { "domain": bytes, ... }    未 flush 的下载
pending_downloads_raw → [ ... ]                    未 flush 的下载明细
```

### 关键设计

- **Flush 策略**：每秒 `chrome.alarms` 触发一次 + 积累 100 条强制 flush。每 10 条写一次 `chrome.storage.session` 做崩溃恢复。
- **域名归一化**：`getRootDomain(hostname)` 识别 ~120 个多段 TLD（国家域名 + `github.io`/`vercel.app`/`s3.amazonaws.com` 等平台域名）。会去掉尾部点、转小写、去掉 `www.`。
- **下载采集**：`chrome.downloads.onChanged` 检测 `state:'complete'`，用 `chrome.downloads.search({id})` 补全 `fileSize` 和 URL。
- **排除机制**：`background.js` 维护内存 `excludedDomains` Set，`chrome.storage.onChanged` 同步。Popup/Dashboard 通过 dataService 读写。
- **Favicon**：`createFavicon(domain)` 三级解析 —— ① 直连 `/favicon.ico`（原域 → 根域 → CDN 映射主站）；② 抓主站主页 HTML 前 64KB 解析 `<link rel=icon>`；③ `favicon.im` 兜底（Cloudflare，国内可达，带熔断）。**CDN 映射表 `CDN_OWNER_MAP`**（shared.js）：hdslb.com / bilivideo.* / githubassets.com / aliyuncs.com 等 ~35 个平台 CDN 域名映射到主站取图标。带会话级缓存（`faviconCache` Map，Promise 去重）+ 并发信号量（≤6）。全部失败 → 灰色 SVG base64 占位。**新遇到没图标的 CDN 域名：在 `CDN_OWNER_MAP` 补一条即可覆盖整类。**
- **SVG 图表**：`drawChart()` / `drawDetailChart()` 生成 `<rect>`/`<polyline>`/`<circle>` SVG，使用 `viewBox` 自适应缩放，`Date.now()` 后缀防 gradiant id 冲突。趋势图柱/点带 `data-day` 属性 + `<title>` 原生 tooltip，点击可跳转到对应日期的统计数据（自动切回月度视图并选中该日）。主图柱状图支持**浏览/下载堆叠**（`opts.stackValues`），折线模式带渐变面积填充，峰值日金色高亮。**配色系统**：石墨黑金（浅色暖灰白底 #fafaf9 + 石墨黑主色 #1f2937 + 金色下载 #d97706；暗色近黑底 #0c0c0d + 金色激活 #f59e0b；浏览=石墨/亮灰、下载=金），全部 CSS 变量控制（dashboard.css / popup.css `:root` + `[data-theme=dark]`），图表颜色由 CSS 变量接管。域名占比环形图 `drawDonut()`（Top 5 + 其他，点击扇区/图例联动表格）。
- **自动剪枝**：存储占用 >80% 时删除最旧 30 天数据。
- **年份选择**：支持去年 + 今年（跨年日历翻月可同步）。

## 流程图

```
用户浏览网页
  ↓
chrome.webRequest.onCompleted
  → background.js 累加到 pendingData/pendingRawData
  → 每秒 alarm flush → chrome.storage.local (traffic_daily_*/traffic_raw_*)

用户下载文件
  ↓
chrome.downloads.onChanged (state:complete)
  → background.js 累加到 pendingDownloads/pendingDownloadItems
  → 每秒 alarm flush → chrome.storage.local (download_daily_*/download_raw_*)

Popup 或 Dashboard 打开
  → dataService.js 从 local storage 读取 → 合并、显示
```

## 限制与非目标

- 5MB `chrome.storage.local` 配额（`unlimitedStorage` 权限不影响 `QUOTA_BYTES`，实测 ~5MB）
- 无服务器端，不上传任何数据
- 不拦截/修改请求，只读监听
- 无实时 WebSocket 推送
- SVG 图表是每日批量渲染，非实时更新
- 下载文件本身的 URL 可能为空（如 `blob:` URL），此时跳过
- 域名归一化是本地启发式规则，不依赖公共后缀列表


