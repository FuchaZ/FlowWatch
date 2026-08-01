// 日历按钮线性图标（lucide calendar，跟随 currentColor）
const CAL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

let state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  viewMode: 'month',
  chartMode: 'bar',
  chartDates: null, // 当前视图的日期数组（近7/30天视图用）
  trackedDays: 0,   // 追踪总天数（从开始统计至今）
  selectedDay: null,
  dailyData: {},
  monthlyData: {},
  downloadDailyData: {},
  downloadMonthlyData: {},
  trafficType: 'all',
  selectedDomain: null,
  searchQuery: '',
  excludedDomains: new Set(),
  showExcluded: false
};

function formatBytesFull(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = (bytes / Math.pow(1024, i)).toFixed(1);
  const precise = (bytes / Math.pow(1024, i)).toFixed(2);
  return `${val} ${units[i]}`;
}

function formatDateLabel(dateStr) {
  const parts = dateStr.split('-');
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getMonthDates(year, month) {
  const dates = [];
  const days = daysInMonth(year, month);
  for (let d = 1; d <= days; d++) {
    dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return dates;
}

// 图表入场动画：柱/点淡入上移、折线描线生长（CSS transition 驱动，尊重 prefers-reduced-motion）
function applyChartAnimations(svg) {
  const bars = svg.querySelectorAll('.bar-anim');
  const dots = svg.querySelectorAll('.dot-anim');
  const area = svg.querySelector('.area-anim');
  if (area) area.style.opacity = '0';
  bars.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transitionDelay = `${Math.min(i * 4, 320)}ms`;
  });
  dots.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transitionDelay = `${Math.min(i * 4, 320)}ms`;
  });
  const line = svg.querySelector('.line-anim');
  if (line) {
    const len = line.getTotalLength();
    line.style.strokeDasharray = len;
    line.style.strokeDashoffset = len;
  }
  // 下一帧统一播放，确保初始状态先被应用
  requestAnimationFrame(() => {
    if (area) area.style.opacity = '';
    bars.forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; });
    dots.forEach(el => { el.style.opacity = '1'; });
    if (line) {
      line.style.transition = 'stroke-dashoffset 0.6s ease';
      line.style.strokeDashoffset = '0';
    }
  });
}

/**
 * 绘制 SVG 趋势图（主图与域名详情图共用）
 * 颜色全部由 CSS 变量控制（.grid-line / .axis-label / stop / .line-anim / .dot-anim），
 * 主题切换时图表自动跟随。
 * @param {SVGSVGElement} svg 目标 SVG 元素
 * @param {number[]} values 每日流量值（长度需等于 allDates.length）
 * @param {string[]} allDates 日期数组，格式 'YYYY-MM-DD'
 * @param {'bar'|'line'} mode 图表类型（line 仅主图使用）
 * @param {Object} [opts] 可选参数
 * @param {number} [opts.H=300] 画布高度
 * @param {Object} [opts.pad] 内边距 {top,right,bottom,left}
 * @param {number} [opts.ySteps=5] Y 轴刻度数
 * @param {number} [opts.barWidthMax=20] 柱宽上限
 * @param {boolean} [opts.interactive=true] 是否带 data-day 点击跳转与 tooltip
 * @param {number} [opts.fontSize=11] 坐标轴文字字号
 * @param {{browse:number[], download:number[]}} [opts.stackValues] 堆叠模式：浏览(底)/下载(顶)两组每日值，仅 bar 模式生效
 */
function drawChart(svg, values, allDates, mode, opts = {}) {
  const {
    H = 300,
    pad = { top: 20, right: 20, bottom: 45, left: 65 },
    ySteps = 5,
    barWidthMax = 20,
    interactive = true,
    fontSize = 11,
    stackValues = null
  } = opts;
  const W = 900;
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  const maxVal = Math.max(...values, 1);
  const step = Math.pow(10, Math.floor(Math.log10(maxVal)));
  const niceMax = Math.ceil(maxVal / step) * step;
  const yStepVal = niceMax / ySteps;
  const barCount = allDates.length;
  const barGap = interactive ? 2 : 1;
  const barWidth = Math.min((chartW - barGap * (barCount + 1)) / barCount, barWidthMax);
  // 峰值日（用于金色高亮，借鉴 GlassWire 峰值标识；全 0 时无峰值）
  const maxValAll = Math.max(...values);
  const peakIndex = maxValAll > 0 ? values.indexOf(maxValAll) : -1;

  const gradId = 'barGrad' + Date.now();
  const dlGradId = 'dlGrad' + Date.now();
  const useStack = !!(stackValues && stackValues.browse);
  // 浏览柱渐变由 CSS 变量控制（#trendChart stop:first-child 等）；下载柱渐变用 inline style 避免被结构选择器误伤
  let svgContent = `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%"/><stop offset="100%"/></linearGradient>`;
  if (useStack) {
    svgContent += `<linearGradient id="${dlGradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style="stop-color:var(--dl-grad-from)"/><stop offset="100%" style="stop-color:var(--dl-grad-to)"/></linearGradient>`;
  }
  svgContent += '</defs>';

  // Y 轴网格与刻度（颜色由 CSS .grid-line / .axis-label 控制）
  for (let i = 0; i <= ySteps; i++) {
    const y = pad.top + chartH - (chartH * i / ySteps);
    svgContent += `<line class="grid-line" x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke-width="1"/>`;
    svgContent += `<text class="axis-label" x="${pad.left - 8}" y="${y}" font-size="${fontSize}" text-anchor="end" dominant-baseline="middle">${formatBytes(yStepVal * i)}</text>`;
  }

  if (mode === 'bar') {
    values.forEach((val, i) => {
      if (val === 0) return;
      const day = allDates[i];
      const x = pad.left + (chartW / barCount) * i + (chartW / barCount - barWidth) / 2;
      const bottomY = pad.top + chartH;
      const selCls = interactive && day === state.selectedDay ? ' selected-day' : '';
      const dayAttr = interactive ? ` data-day="${day}"` : '';

      if (useStack) {
        // 堆叠柱：底=浏览(主渐变)，顶=下载(橙渐变)；柱总高即峰值，天然可见，不加 peak-day
        const browseBytes = stackValues.browse[i] || 0;
        const dlBytes = stackValues.download[i] || 0;
        const browseH = Math.max((browseBytes / niceMax) * chartH, browseBytes > 0 ? 2 : 0);
        const dlH = Math.max((dlBytes / niceMax) * chartH, dlBytes > 0 ? 2 : 0);
        const browseY = bottomY - browseH;
        const title = interactive
          ? `<title>${formatDateLabel(day)}: 总 ${formatBytes(val)}（浏览 ${formatBytes(browseBytes)} / 下载 ${formatBytes(dlBytes)}）</title>`
          : '';
        svgContent += `<rect class="bar-anim${selCls}"${dayAttr} x="${x}" y="${browseY}" width="${barWidth}" height="${browseH}" fill="url(#${gradId})" rx="2" ry="2">${title}</rect>`;
        if (dlH > 0) {
          svgContent += `<rect class="bar-anim" x="${x}" y="${browseY - dlH}" width="${barWidth}" height="${dlH}" fill="url(#${dlGradId})" rx="2" ry="2"/>`;
        }
      } else {
        const barH = Math.max((val / niceMax) * chartH, 2);
        const y = bottomY - barH;
        const peakCls = i === peakIndex ? ' peak-day' : '';
        const title = interactive ? `<title>${formatDateLabel(day)}: ${formatBytes(val)}</title>` : '';
        svgContent += `<rect class="bar-anim${selCls}${peakCls}"${dayAttr} x="${x}" y="${y}" width="${barWidth}" height="${barH}" fill="url(#${gradId})" rx="2" ry="2">${title}</rect>`;
      }
    });
  } else {
    // 折线图（仅主图使用）
    const points = values.map((val, i) => {
      const x = pad.left + (chartW / (barCount - 1 || 1)) * i;
      const y = pad.top + chartH - (val / niceMax) * chartH;
      return { x, y, val };
    });
    // 渐变面积填充（借鉴 GlassWire 波形设计，直观展示流量起伏）
    if (points.length > 1) {
      const bottomY = pad.top + chartH;
      const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
      const areaD = `${lineD} L${points[points.length - 1].x},${bottomY} L${points[0].x},${bottomY} Z`;
      svgContent += `<path class="area-anim" d="${areaD}" fill="url(#${gradId})"/>`;
    }
    svgContent += `<polyline class="line-anim" points="${points.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    points.forEach((p, i) => {
      if (values[i] === 0) return;
      const day = allDates[i];
      const isSel = day === state.selectedDay;
      const isPeak = i === peakIndex;
      const r = isSel ? 5 : (isPeak ? 6 : 3);
      const cls = `${isSel ? 'dot-anim selected-day' : 'dot-anim'}${isPeak ? ' peak-day' : ''}`;
      svgContent += `<circle class="${cls}" data-day="${day}" cx="${p.x}" cy="${p.y}" r="${r}"><title>${formatDateLabel(day)}: ${formatBytes(values[i])}</title></circle>`;
    });
  }

  // X 轴日期标签（按密度抽样；近7/30天视图跨月时用 M/D 格式）
  const isRecent = state.viewMode === 'recent7' || state.viewMode === 'recent30';
  const labelStep = Math.max(1, Math.floor(barCount / 15));
  allDates.forEach((d, i) => {
    if (i % labelStep !== 0 && i !== allDates.length - 1) return;
    const x = pad.left + (chartW / barCount) * i + (chartW / barCount) / 2;
    const label = isRecent ? formatDateLabel(d) : `${parseInt(d.split('-')[2])}日`;
    svgContent += `<text class="axis-label" x="${x}" y="${H - pad.bottom + 12}" font-size="${fontSize}" text-anchor="middle">${label}</text>`;
  });

  svg.innerHTML = svgContent;
  applyChartAnimations(svg);
}

// 域名详情图参数（小尺寸、不可点击）
const DETAIL_CHART_OPTS = {
  H: 200,
  pad: { top: 15, right: 20, bottom: 35, left: 65 },
  ySteps: 4,
  barWidthMax: 15,
  interactive: false,
  fontSize: 10
};

function updateSummary(dailyData, monthlyData, dlDailyData, dlMonthlyData) {
  let browseTotal, dlTotal, allDaily;

  if (state.selectedDay) {
    // 选中某一天：浏览/下载分别取当日 {domain: bytes}
    const dayBrowse = state.dailyData[state.selectedDay] || {};
    const dayDl = state.downloadDailyData[state.selectedDay] || {};
    const dayData = {};
    for (const [domain, bytes] of Object.entries(dayBrowse)) {
      dayData[domain] = (dayData[domain] || 0) + bytes;
    }
    for (const [domain, bytes] of Object.entries(dayDl)) {
      dayData[domain] = (dayData[domain] || 0) + bytes;
    }
    browseTotal = Object.values(dayBrowse).reduce((a, b) => a + b, 0);
    dlTotal = Object.values(dayDl).reduce((a, b) => a + b, 0);
    allDaily = { [state.selectedDay]: dayData };
  } else {
    browseTotal = Object.values(monthlyData).reduce((a, b) => a + b, 0);
    dlTotal = Object.values(dlMonthlyData).reduce((a, b) => a + b, 0);
    allDaily = {};
    for (const [date, data] of Object.entries(dailyData)) {
      allDaily[date] = { ...(allDaily[date] || {}), ...data };
    }
    for (const [date, data] of Object.entries(dlDailyData)) {
      for (const [domain, bytes] of Object.entries(data)) {
        allDaily[date] = allDaily[date] || {};
        allDaily[date][domain] = (allDaily[date][domain] || 0) + bytes;
      }
    }
  }

  const total = browseTotal + dlTotal;
  const activeDays = Object.keys(allDaily).length;
  const avg = activeDays > 0 ? total / activeDays : 0;

  let peakDate = '';
  let peakVal = 0;
  for (const [date, data] of Object.entries(allDaily)) {
    const dayTotal = Object.values(data).reduce((a, b) => a + b, 0);
    if (dayTotal > peakVal) {
      peakVal = dayTotal;
      peakDate = date;
    }
  }

  animateNumber(document.getElementById('totalTraffic'), total, formatBytes);
  animateNumber(document.getElementById('browseTraffic'), browseTotal, formatBytes);
  animateNumber(document.getElementById('downloadTraffic'), dlTotal, formatBytes);
  // "追踪天数"与窗口无关（从开始统计至今）；窗口内活跃天数仅用于日均计算
  animateNumber(document.getElementById('activeDays'), state.trackedDays, v => Math.round(v) + ' 天');
  animateNumber(document.getElementById('avgDaily'), avg, v => formatBytes(v) + '/天');
  document.getElementById('peakDay').textContent = peakDate ? `${peakDate} (${formatBytes(peakVal)})` : '-';
}

/**
 * 获取当前视图（选中日或整月/年）下每个域名的 {browse, download} 合并数据
 * @returns {Object<string, {browse:number, download:number}>} domain -> 浏览/下载字节数
 */
function getMergedDomainData() {
  let browse, download;
  if (state.selectedDay) {
    browse = state.dailyData[state.selectedDay] || {};
    download = state.downloadDailyData[state.selectedDay] || {};
  } else {
    browse = state.monthlyData;
    download = state.downloadMonthlyData;
  }
  const merged = {};
  const allDomains = new Set([...Object.keys(browse), ...Object.keys(download)]);
  for (const domain of allDomains) {
    merged[domain] = {
      browse: browse[domain] || 0,
      download: download[domain] || 0
    };
  }
  return merged;
}

// ── 域名占比环形图（Top 7 + 其他，点击扇区/图例联动表格） ──
const DONUT_MAX_SLICES = 7;

/** 极坐标 → 直角坐标（0° 指向 12 点方向，顺时针） */
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** 生成环形图弧线 path（stroke 方式绘制，颜色由 CSS 变量 --donut-N 控制） */
function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

/**
 * 绘制域名占比环形图 + 图例，点击扇区/图例选中该域名（表格高亮 + 详情）
 */
function drawDonut() {
  const svg = document.getElementById('domainDonut');
  const legend = document.getElementById('donutLegend');
  const merged = getMergedDomainData();
  const entries = Object.entries(merged)
    .filter(([d]) => !state.excludedDomains.has(d))
    .sort((a, b) => (b[1].browse + b[1].download) - (a[1].browse + a[1].download));
  const grandTotal = entries.reduce((s, [, v]) => s + v.browse + v.download, 0);

  if (grandTotal === 0) {
    svg.innerHTML = '';
    legend.innerHTML = '';
    return;
  }

  const slices = entries.slice(0, DONUT_MAX_SLICES).map(([domain, v]) => ({
    domain, bytes: v.browse + v.download
  }));
  const restBytes = entries.slice(DONUT_MAX_SLICES).reduce((s, [, v]) => s + v.browse + v.download, 0);
  if (restBytes > 0) slices.push({ domain: '其他', bytes: restBytes });

  const cx = 100, cy = 100, r = 80, strokeW = 22;
  let angle = -90;
  let svgContent = '';
  slices.forEach((s, i) => {
    const frac = s.bytes / grandTotal;
    const sweep = frac * 360;
    svgContent += `<path class="donut-seg" d="${describeArc(cx, cy, r, angle, angle + sweep)}" fill="none" stroke="var(--donut-${i + 1})" stroke-width="${strokeW}" data-domain="${s.domain}"><title>${s.domain}: ${formatBytes(s.bytes)}（${(frac * 100).toFixed(1)}%）</title></path>`;
    angle += sweep;
  });
  svgContent += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" class="donut-total-text">${formatBytes(grandTotal)}</text>`;
  svgContent += `<text x="${cx}" y="${cy + 14}" text-anchor="middle" class="donut-total-label">总流量</text>`;
  svg.innerHTML = svgContent;

  legend.innerHTML = slices.map((s, i) => `
    <div class="donut-legend-item${state.selectedDomain === s.domain ? ' active' : ''}" data-domain="${s.domain}">
      <span class="donut-dot" style="background:var(--donut-${i + 1})"></span>
      <span class="donut-legend-name">${s.domain}</span>
      <span class="donut-legend-pct">${(s.bytes / grandTotal * 100).toFixed(1)}%</span>
    </div>`).join('');

  // 点击联动：扇区 / 图例 → 选中该域名（表格高亮 + 详情 + 滚动到表格）
  const selectDomain = (domain) => {
    if (!domain || domain === '其他') return;
    state.selectedDomain = domain;
    updateDomainTable(state.monthlyData, state.downloadMonthlyData);
    showDomainDetail(domain);
    document.getElementById('domainTable').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    drawDonut(); // 刷新图例 active 状态
  };
  svg.querySelectorAll('.donut-seg').forEach(seg => {
    seg.addEventListener('click', () => selectDomain(seg.dataset.domain));
  });
  legend.querySelectorAll('.donut-legend-item').forEach(item => {
    item.addEventListener('click', () => selectDomain(item.dataset.domain));
  });
}

function updateDomainTable(browseMonthly, dlMonthly) {
  const tbody = document.getElementById('domainBody');

  let entries = Object.entries(getMergedDomainData());

  if (!state.showExcluded) {
    entries = entries.filter(([d]) => !state.excludedDomains.has(d));
  }

  if (state.searchQuery) {
    entries = entries.filter(([d]) => d.includes(state.searchQuery));
  }

  if (state.trafficType === 'browse') {
    entries = entries.filter(([, v]) => v.browse > 0);
  } else if (state.trafficType === 'download') {
    entries = entries.filter(([, v]) => v.download > 0);
  }

  entries.sort((a, b) => ((b[1].browse + b[1].download) - (a[1].browse + a[1].download)));
  if (entries.length > 50) entries = entries.slice(0, 50);

  const grandTotal = entries.reduce((s, [, v]) => s + v.browse + v.download, 0);

  if (entries.length === 0) {
    const hasFilter = state.searchQuery || state.trafficType !== 'all' || state.excludedDomains.size > 0;
    const msg = hasFilter ? '没有匹配的域名' : '还没有流量记录，浏览网页后会自动统计';
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:30px">${msg}</td></tr>`;
    return;
  }

  tbody.innerHTML = entries.map(([domain, v], idx) => {
    const total = v.browse + v.download;
    const pct = grandTotal > 0 ? (total / grandTotal * 100) : 0;
    const isSelected = state.selectedDomain === domain;
    const isExcluded = state.excludedDomains.has(domain);
    let typeLabel = '';
    if (v.browse > 0 && v.download === 0) typeLabel = '<span class="tag-browse">浏览</span>';
    else if (v.download > 0 && v.browse === 0) typeLabel = '<span class="tag-download">下载</span>';
    else typeLabel = '<span class="tag-mixed">混合</span>';
    return `<tr class="${isSelected ? 'selected' : ''}${isExcluded ? ' excluded' : ''}" data-domain="${domain}">
      <td class="col-rank">${isExcluded ? '—' : idx + 1}</td>
      <td class="col-type">${typeLabel}</td>
      <td class="col-domain">
        ${domain}${isExcluded ? ' <span style="color:var(--red);font-size:11px">(已排除)</span>' : ''}
        <div class="domain-row-bar"><div class="domain-row-fill" style="width:${pct}%"></div></div>
      </td>
      <td class="col-bytes">${formatBytes(total)}</td>
      <td class="col-breakdown">
        ${v.download > 0 ? `<span class="dl-part">下载 ${formatBytes(v.download)}</span>` : ''}
        ${v.browse > 0 && v.download > 0 ? `<span class="browse-part">浏览 ${formatBytes(v.browse)}</span>` : ''}
      </td>
      <td class="col-action">
        ${isExcluded
          ? `<button class="restore-domain-btn" data-action="restore" data-domain="${domain}">恢复</button>`
          : `<button class="exclude-domain-btn" data-action="exclude" data-domain="${domain}">排除</button>`}
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.col-domain').forEach(cell => {
    const tr = cell.closest('tr');
    if (tr && tr.dataset.domain) {
      cell.insertBefore(createFavicon(tr.dataset.domain), cell.firstChild);
    }
  });

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      state.selectedDomain = tr.dataset.domain;
      showDomainDetail(state.selectedDomain);
      document.querySelectorAll('#domainBody tr').forEach(r => r.classList.remove('selected'));
      tr.classList.add('selected');
    });
  });

  tbody.querySelectorAll('[data-action="exclude"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const domain = btn.dataset.domain;
      await addExclusion(domain);
      state.excludedDomains.add(domain);
      updateDomainTable(state.monthlyData, state.downloadMonthlyData);
      if (state.selectedDomain === domain) {
        state.selectedDomain = null;
        document.getElementById('domainDetailSection').style.display = 'none';
      }
      updateExcludedBtn();
    });
  });

  tbody.querySelectorAll('[data-action="restore"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const domain = btn.dataset.domain;
      await removeExclusion(domain);
      state.excludedDomains.delete(domain);
      updateDomainTable(state.monthlyData, state.downloadMonthlyData);
      updateExcludedBtn();
    });
  });
}

function updateExcludedBtn() {
  const btn = document.getElementById('toggleExcludedBtn');
  if (state.excludedDomains.size > 0) {
    btn.style.display = '';
    btn.textContent = state.showExcluded ? '隐藏已排除' : `显示已排除 (${state.excludedDomains.size})`;
  } else {
    btn.style.display = 'none';
  }
}

/**
 * 合并浏览+下载的按日数据
 * @returns {Object<string, Object<string, number>>} date -> {domain: bytes}
 */
function getMergedDailyData() {
  const merged = {};
  for (const [date, data] of Object.entries(state.dailyData)) {
    merged[date] = { ...data };
  }
  for (const [date, data] of Object.entries(state.downloadDailyData)) {
    if (!merged[date]) merged[date] = {};
    for (const [domain, bytes] of Object.entries(data)) {
      merged[date][domain] = (merged[date][domain] || 0) + bytes;
    }
  }
  return merged;
}

/**
 * 指定域名在当月每天的流量值（浏览+下载合并，按日期对齐）
 * @param {string} domain 域名
 * @returns {number[]} 当月每天字节数（无数据日为 0）
 */
function getDomainDailyValues(domain) {
  const domainDaily = {};
  for (const [date, data] of Object.entries(state.dailyData)) {
    if (data[domain]) domainDaily[date] = data[domain];
  }
  for (const [date, data] of Object.entries(state.downloadDailyData)) {
    if (data[domain]) domainDaily[date] = (domainDaily[date] || 0) + data[domain];
  }
  return state.chartDates.map(d => domainDaily[d] || 0);
}

function updateTrendChart() {
  const svg = document.getElementById('trendChart');
  const allDates = state.chartDates;
  const merged = getMergedDailyData();
  const values = allDates.map(d => {
    const data = merged[d];
    return data ? Object.values(data).reduce((a, b) => a + b, 0) : 0;
  });
  // 浏览/下载分离，供堆叠柱状图使用
  const browseValues = allDates.map(d => {
    const data = state.dailyData[d];
    return data ? Object.values(data).reduce((a, b) => a + b, 0) : 0;
  });
  const downloadValues = allDates.map(d => {
    const data = state.downloadDailyData[d];
    return data ? Object.values(data).reduce((a, b) => a + b, 0) : 0;
  });
  drawChart(svg, values, allDates, state.chartMode, {
    stackValues: { browse: browseValues, download: downloadValues }
  });
}

async function showDomainDetail(domain) {
  if (!domain || !state.dailyData) return;
  const section = document.getElementById('domainDetailSection');
  section.style.display = 'block';
  document.getElementById('detailDomainName').textContent = `域名详情: ${domain}`;

  // 该域名每日流量（浏览+下载合并），只取需要的字段，避免整表复制
  const domainDaily = {};
  for (const [date, data] of Object.entries(state.dailyData)) {
    if (data[domain]) domainDaily[date] = data[domain];
  }
  for (const [date, data] of Object.entries(state.downloadDailyData)) {
    if (data[domain]) domainDaily[date] = (domainDaily[date] || 0) + data[domain];
  }

  let total = 0;
  let peakDay = '';
  let peakVal = 0;
  let activeCount = 0;
  for (const [date, bytes] of Object.entries(domainDaily)) {
    if (bytes > 0) activeCount++;
    total += bytes;
    if (bytes > peakVal) {
      peakVal = bytes;
      peakDay = date;
    }
  }
  const avg = activeCount > 0 ? total / activeCount : 0;

  const browseBytes = state.monthlyData[domain] || 0;
  const dlBytes = state.downloadMonthlyData[domain] || 0;

  document.getElementById('detailTotal').textContent = formatBytes(total);
  document.getElementById('detailBreakdown').innerHTML = `
    <span style="color:var(--accent)">浏览 ${formatBytes(browseBytes)}</span>
    ${dlBytes > 0 ? `<span style="color:var(--orange);margin-left:12px">下载 ${formatBytes(dlBytes)}</span>` : ''}
  `;
  document.getElementById('detailAvg').textContent = formatBytes(avg) + '/天';
  document.getElementById('detailPeak').textContent = peakDay ? `${peakDay} (${formatBytes(peakVal)})` : '-';

  const svg = document.getElementById('detailChart');
  drawChart(svg, getDomainDailyValues(domain), state.chartDates, 'bar', DETAIL_CHART_OPTS);

  const rawData = await loadRawDataForMonth(state.year, state.month);
  const subdomains = Object.entries(rawData)
    .filter(([hostname]) => hostname === domain || hostname.endsWith('.' + domain))
    .sort((a, b) => b[1] - a[1]);
  const subList = document.getElementById('subdomainList');
  if (subdomains.length === 0) {
    subList.innerHTML = '<div style="color:var(--text-secondary);font-size:12px">无细分数据</div>';
  } else {
    const subTotal = subdomains.reduce((a, b) => a + b[1], 0);
    subList.innerHTML = subdomains.map(([hostname, bytes]) => {
      const pct = (bytes / subTotal * 100).toFixed(1);
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-lighter);font-size:13px">
        <span style="color:var(--text-weak);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${hostname}</span>
        <span style="font-weight:600;color:var(--accent);margin:0 12px;white-space:nowrap">${formatBytes(bytes)}</span>
        <span style="color:var(--text-secondary);font-size:12px;width:48px;text-align:right">${pct}%</span>
      </div>`;
    }).join('');
  }
}

async function refresh() {
  state.excludedDomains = await getExcludedDomains();
  state.trackedDays = (await getTrackedDates()).length;

  // 根据视图模式选择聚合数据源 + 图表日期数组
  let browseP, downloadP;
  if (state.viewMode === 'month') {
    browseP = getBrowseAggregated(state.year, state.month);
    downloadP = getDownloadAggregated(state.year, state.month);
    state.chartDates = getMonthDates(state.year, state.month);
  } else if (state.viewMode === 'year') {
    browseP = getBrowseAggregated(state.year);
    downloadP = getDownloadAggregated(state.year);
    state.chartDates = getMonthDates(state.year, state.month);
  } else {
    const days = state.viewMode === 'recent7' ? 7 : 30;
    browseP = getRecentBrowseAggregated(days);
    downloadP = getRecentDownloadAggregated(days);
    state.chartDates = getRecentDateKeys(days);
  }

  const [data, dlData] = await Promise.all([browseP, downloadP]);
  state.dailyData = data.daily;
  state.monthlyData = data.monthly;
  state.downloadDailyData = dlData.daily;
  state.downloadMonthlyData = dlData.monthly;
  if (state.selectedDomain && !state.monthlyData[state.selectedDomain] && !state.downloadMonthlyData[state.selectedDomain]) {
    state.selectedDomain = null;
    document.getElementById('domainDetailSection').style.display = 'none';
  }
  updateSummary(data.daily, data.monthly, dlData.daily, dlData.monthly);
  updateDomainTable(data.monthly, dlData.monthly);
  drawDonut();
  updateTrendChart();
  if (state.selectedDomain) showDomainDetail(state.selectedDomain);
  updateExcludedBtn();
  updateDayPicker();
}

function initMonthSelect() {
  const sel = document.getElementById('monthSelect');
  sel.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m + ' 月';
    sel.appendChild(opt);
  }
  sel.value = state.month;
  sel.addEventListener('change', () => {
    state.month = parseInt(sel.value);
    state.selectedDay = null;
    refresh(); // 修复：不再重复 initDayPicker()（避免日历事件重复绑定）
  });
}

// ── 日历选择器 ──────────────────────────────────────────────
function initDayPicker() {
  const btn = document.getElementById('dayPickerBtn');
  const panel = document.getElementById('dayPickerPanel');

  // 按钮点击：切换弹窗（class 控制，配合 CSS 过渡动画）
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const showing = panel.classList.contains('open');
    if (showing) {
      panel.classList.remove('open');
    } else {
      panel.classList.add('open');
      renderDayPicker(state.year, state.month);
    }
  });

  // 点击弹窗外关闭
  document.addEventListener('click', (e) => {
    const picker = document.getElementById('dayPicker');
    if (!picker.contains(e.target)) {
      panel.classList.remove('open');
    }
  });

  // 上/下月（修复：翻月后同步下拉框值并触发数据刷新）
  document.getElementById('dpPrev').addEventListener('click', () => {
    state.month--;
    if (state.month < 1) { state.month = 12; state.year--; }
    renderDayPicker(state.year, state.month);
    document.getElementById('monthSelect').value = state.month;
    document.getElementById('yearSelect').value = state.year;
    refresh();
  });
  document.getElementById('dpNext').addEventListener('click', () => {
    state.month++;
    if (state.month > 12) { state.month = 1; state.year++; }
    renderDayPicker(state.year, state.month);
    document.getElementById('monthSelect').value = state.month;
    document.getElementById('yearSelect').value = state.year;
    refresh();
  });

  // 显示全部
  document.getElementById('dpClear').addEventListener('click', () => {
    state.selectedDay = null;
    panel.classList.remove('open');
    btn.innerHTML = CAL_SVG + '<span>全部</span>';
    btn.classList.remove('active');
    refresh();
  });

  // 默认按钮文字——定位到今天
  const todayStr = getDateKey(new Date());
  state.selectedDay = todayStr;
  btn.innerHTML = CAL_SVG + `<span>${todayStr.slice(5)}</span>`;
  btn.classList.add('active');
}

function renderDayPicker(year, month) {
  const title = document.getElementById('dpTitle');
  const grid = document.getElementById('dpGrid');
  const btn = document.getElementById('dayPickerBtn');

  title.textContent = `${year}年${month}月`;

  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=周日
  const daysIn = daysInMonth(year, month);
  const todayStr = getDateKey(new Date());

  // 收集当月有数据的日期 + 流量强度（热力分档 1~5，借鉴 GitHub 风格色阶）
  const mergedData = getMergedDailyData();
  const dayTotals = {};
  for (const [date, data] of Object.entries(mergedData)) {
    dayTotals[date] = Object.values(data).reduce((a, b) => a + b, 0);
  }
  const maxDayTotal = Math.max(...Object.values(dayTotals), 0);
  const heatLevel = (bytes) => {
    if (bytes <= 0 || maxDayTotal <= 0) return 0;
    const ratio = bytes / maxDayTotal;
    if (ratio > 0.8) return 5;
    if (ratio > 0.6) return 4;
    if (ratio > 0.4) return 3;
    if (ratio > 0.2) return 2;
    return 1;
  };

  let html = '';
  // 上月补齐空白
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="dp-cell other-month"></div>';
  }
  // 当月日期
  for (let d = 1; d <= daysIn; d++) {
    const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    let cls = 'dp-cell';
    if (dayStr === todayStr) cls += ' today';
    const heat = heatLevel(dayTotals[dayStr] || 0);
    if (heat > 0) cls += ` has-data heat-${heat}`;
    if (state.selectedDay === dayStr) cls += ' selected';
    html += `<div class="${cls}" data-day="${dayStr}">${d}</div>`;
  }

  grid.innerHTML = html;

  // 点击日期
  grid.querySelectorAll('.dp-cell').forEach(cell => {
    if (cell.classList.contains('other-month')) return;
    cell.addEventListener('click', () => {
      const day = cell.dataset.day;
      state.selectedDay = day;
      document.getElementById('dayPickerPanel').classList.remove('open');
      btn.innerHTML = CAL_SVG + `<span>${day.slice(5)}</span>`; // MM-DD
      btn.classList.add('active');
      refresh();
    });
  });

  // 同步 month 下拉菜单的值
  document.getElementById('monthSelect').value = month;
}

// 从 refresh 调用更新日历高亮
function updateDayPicker() {
  const btn = document.getElementById('dayPickerBtn');
  if (state.viewMode === 'month') {
    document.getElementById('dayPicker').style.display = '';
    if (state.selectedDay) {
      btn.innerHTML = CAL_SVG + `<span>${state.selectedDay.slice(5)}</span>`;
      btn.classList.add('active');
    } else {
      btn.innerHTML = CAL_SVG + '<span>全部</span>';
      btn.classList.remove('active');
    }
    // 弹窗开着就重绘
    const panel = document.getElementById('dayPickerPanel');
    if (panel.classList.contains('open')) renderDayPicker(state.year, state.month);
  } else {
    document.getElementById('dayPicker').style.display = 'none';
  }
}

function initYearSelect() {
  const sel = document.getElementById('yearSelect');
  const currentYear = new Date().getFullYear();
  // 支持去年/今年两个选项（日历翻月跨年时能对上）
  for (let y = currentYear - 1; y <= currentYear; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + ' 年';
    sel.appendChild(opt);
  }
  sel.value = state.year;
  sel.addEventListener('change', () => {
    state.year = parseInt(sel.value);
    refresh();
  });
}

async function renderExcludedList() {
  const section = document.getElementById('excludedSection');
  const list = document.getElementById('excludedList');
  section.style.display = 'block';
  if (state.excludedDomains.size === 0) {
    list.innerHTML = '<div style="color:var(--text-secondary);padding:12px">暂无排除的域名</div>';
    return;
  }
  const sorted = [...state.excludedDomains].sort();
  list.innerHTML = sorted.map(domain => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-lighter)">
      <span style="color:var(--text-body)">${domain}</span>
      <button class="restore-domain-btn" data-domain="${domain}">恢复统计</button>
    </div>
  `).join('');
  list.querySelectorAll('.restore-domain-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.domain;
      await removeExclusion(domain);
      state.excludedDomains.delete(domain);
      renderExcludedList();
      updateDomainTable(state.monthlyData);
      updateExcludedBtn();
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // 主题初始化 + 切换按钮（三态：自动 → 浅色 → 深色）
  initTheme();
  const themeBtn = document.getElementById('themeToggle');
  const syncThemeBtn = () => {
    const eff = currentEffectiveTheme();
    themeBtn.textContent = eff === 'dark' ? '☀️' : '🌙';
    const mode = getStoredTheme();
    themeBtn.title = `主题：${mode === 'auto' ? '跟随系统' : mode === 'dark' ? '深色' : '浅色'}（左键切换，右键恢复跟随系统）`;
  };
  syncThemeBtn();
  themeBtn.addEventListener('click', () => { toggleTheme(); syncThemeBtn(); });
  themeBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    localStorage.setItem(THEME_KEY, 'auto');
    applyTheme('auto');
    syncThemeBtn();
  });

  initYearSelect();
  initMonthSelect();
  initDayPicker();

  // 视图切换：近7天 / 近30天 / 月度 / 年度
  const viewButtons = [
    ['viewRecent7Btn', 'recent7', '近7天域名排行'],
    ['viewRecent30Btn', 'recent30', '近30天域名排行'],
    ['viewMonthBtn', 'month', '域名排行'],
    ['viewYearBtn', 'year', '年度域名排行']
  ];
  for (const [btnId, mode, listTitle] of viewButtons) {
    document.getElementById(btnId).addEventListener('click', () => {
      if (state.viewMode === mode) return;
      state.viewMode = mode;
      state.selectedDay = null;
      state.selectedDomain = null;
      document.getElementById('domainDetailSection').style.display = 'none';
      document.querySelectorAll('.view-toggle').forEach(b => b.classList.remove('active'));
      document.getElementById(btnId).classList.add('active');
      const isMonth = mode === 'month';
      const isRecent = mode === 'recent7' || mode === 'recent30';
      document.getElementById('yearSelect').style.display = isRecent ? 'none' : '';
      document.getElementById('monthSelect').style.display = isMonth ? '' : 'none';
      document.getElementById('dayPicker').style.display = isMonth ? '' : 'none';
      document.getElementById('domainListTitle').textContent = listTitle;
      refresh();
    });
  }

  // 点击趋势图柱/点 → 跳转到对应日期的统计数据
  document.getElementById('trendChart').addEventListener('click', (e) => {
    const el = e.target.closest('[data-day]');
    if (!el || !el.dataset.day) return;
    if (state.viewMode !== 'month') {
      // 年度视图下点击 → 先切回月度视图再定位到该日
      state.viewMode = 'month';
      document.getElementById('viewMonthBtn').classList.add('active');
      document.getElementById('viewYearBtn').classList.remove('active');
      document.getElementById('monthSelect').style.display = '';
      document.getElementById('dayPicker').style.display = '';
      document.getElementById('domainListTitle').textContent = '域名排行';
      state.selectedDomain = null;
      document.getElementById('domainDetailSection').style.display = 'none';
    }
    state.selectedDay = el.dataset.day;
    refresh();
  });

  document.getElementById('chartViewBar').addEventListener('click', () => {
    state.chartMode = 'bar';
    document.getElementById('chartViewBar').classList.add('active');
    document.getElementById('chartViewLine').classList.remove('active');
    updateTrendChart();
    if (state.selectedDomain) {
      const svg = document.getElementById('detailChart');
      drawChart(svg, getDomainDailyValues(state.selectedDomain), state.chartDates, 'bar', DETAIL_CHART_OPTS);
    }
  });

  document.getElementById('chartViewLine').addEventListener('click', () => {
    state.chartMode = 'line';
    document.getElementById('chartViewLine').classList.add('active');
    document.getElementById('chartViewBar').classList.remove('active');
    updateTrendChart();
    if (state.selectedDomain) {
      const svg = document.getElementById('detailChart');
      drawChart(svg, getDomainDailyValues(state.selectedDomain), state.chartDates, 'bar', DETAIL_CHART_OPTS);
    }
  });

  document.getElementById('closeDetail').addEventListener('click', () => {
    state.selectedDomain = null;
    document.getElementById('domainDetailSection').style.display = 'none';
    document.querySelectorAll('#domainBody tr').forEach(r => r.classList.remove('selected'));
  });

  document.getElementById('toggleExcludedBtn').addEventListener('click', () => {
    state.showExcluded = !state.showExcluded;
    updateDomainTable(state.monthlyData);
    updateExcludedBtn();
  });

  document.getElementById('manageExclusionsBtn').addEventListener('click', async () => {
    renderExcludedList();
  });

  document.getElementById('closeExcludedBtn').addEventListener('click', () => {
    document.getElementById('excludedSection').style.display = 'none';
  });

  document.getElementById('typeAllBtn').addEventListener('click', () => {
    state.trafficType = 'all';
    document.querySelectorAll('.type-filter-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('typeAllBtn').classList.add('active');
    updateDomainTable(state.monthlyData, state.downloadMonthlyData);
  });
  document.getElementById('typeBrowseBtn').addEventListener('click', () => {
    state.trafficType = 'browse';
    document.querySelectorAll('.type-filter-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('typeBrowseBtn').classList.add('active');
    updateDomainTable(state.monthlyData, state.downloadMonthlyData);
  });
  document.getElementById('typeDownloadBtn').addEventListener('click', () => {
    state.trafficType = 'download';
    document.querySelectorAll('.type-filter-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('typeDownloadBtn').classList.add('active');
    updateDomainTable(state.monthlyData, state.downloadMonthlyData);
  });

  let searchTimer;
  document.getElementById('domainSearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchQuery = e.target.value.toLowerCase();
      updateDomainTable(state.monthlyData);
    }, 200);
  });

  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    const merged = getMergedDomainData();
    if (Object.keys(merged).length === 0) return;
    const sorted = Object.entries(merged).sort((a, b) => ((b[1].browse + b[1].download) - (a[1].browse + a[1].download)));
    const grandTotal = sorted.reduce((s, [, v]) => s + v.browse + v.download, 0);
    const label = state.viewMode === 'month'
      ? `${state.year}-${String(state.month).padStart(2, '0')}`
      : state.viewMode === 'year'
        ? String(state.year)
        : state.viewMode; // recent7 / recent30
    let csv = '排名,域名,浏览流量(B),下载流量(B),总流量(B),总流量(可读),占比(%)\n';
    sorted.forEach(([domain, v], i) => {
      const total = v.browse + v.download;
      const pct = (total / grandTotal * 100).toFixed(1);
      csv += `${i + 1},${domain},${v.browse},${v.download},${total},${formatBytes(total)},${pct}\n`;
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `traffic_${label}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  document.getElementById('resetDataBtn').addEventListener('click', () => {
    if (confirm('确定要删除所有流量数据？此操作不可恢复。')) {
      if (confirm('再次确认：这将清除所有已记录的流量数据。')) {
        clearAllData().then(() => {
          state.dailyData = {};
          state.monthlyData = {};
          state.selectedDomain = null;
          document.getElementById('domainDetailSection').style.display = 'none';
          updateSummary({}, {});
          updateDomainTable({});
          updateTrendChart();
        });
      }
    }
  });

  getStorageUsage().then(u => {
    document.getElementById('storageUsed').textContent = formatBytes(u.used) + ' / ' + formatBytes(u.quota);
    const fill = document.getElementById('storageFill');
    fill.style.width = (u.pct * 100).toFixed(1) + '%';
    if (u.pct > 0.8) fill.style.background = 'var(--red)';
    else if (u.pct > 0.6) fill.style.background = 'var(--orange)';
    if (u.pct > 0.8) {
      pruneOldData(30).then(pruned => {
        if (pruned > 0) console.log(`存储空间不足，已自动清理 ${pruned} 天前的旧数据`);
      });
    }
  });
  refresh();
});

window.addEventListener('resize', () => {
  updateTrendChart();
  if (state.selectedDomain) showDomainDetail(state.selectedDomain);
});
