/**
 * 渲染域名 Top 列表（含 favicon、比例条、排除按钮）
 * @param {HTMLElement} container 列表容器
 * @param {Object<string, number>} data domain -> bytes
 * @param {number} total 总流量（计算比例）
 * @param {Set<string>} excluded 已排除域名
 */
async function renderDomainList(container, data, total, excluded) {
  if (Object.keys(data).length === 0) {
    container.innerHTML = '<div class="loading">还没有流量记录，浏览网页后会自动统计</div>';
    return;
  }
  const sorted = Object.entries(data)
    .filter(([d]) => !excluded.has(d))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (sorted.length === 0) {
    container.innerHTML = '<div class="loading">所有域名已被排除</div>';
    return;
  }

  container.innerHTML = sorted.map(([domain, bytes]) => {
    const pct = total > 0 ? (bytes / total * 100).toFixed(1) : 0;
    return `
      <div class="domain-item" data-domain="${domain}">
        <div style="flex:1;min-width:0">
          <div class="domain-name">
            ${domain}
          </div>
          <div class="bar-bg"><div class="bar-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="domain-bytes">${formatBytes(bytes)}</div>
        <button class="domain-exclude-btn" title="排除此域名不再统计">✕</button>
      </div>`;
  }).join('');

  // 列表项入场动画（交错淡入）
  container.querySelectorAll('.domain-item').forEach((item, i) => {
    item.style.animationDelay = `${Math.min(i * 30, 300)}ms`;
    item.classList.add('enter');
  });

  container.querySelectorAll('.domain-name').forEach(nameEl => {
    const item = nameEl.closest('.domain-item');
    if (item && item.dataset.domain) {
      nameEl.insertBefore(createFavicon(item.dataset.domain), nameEl.firstChild);
    }
  });

  container.querySelectorAll('.domain-exclude-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = btn.closest('.domain-item');
      const domain = item.dataset.domain;
      await addExclusion(domain);
      item.remove();
      if (container.children.length === 0) {
        container.innerHTML = '<div class="loading">所有域名已被排除</div>';
      }
    });
  });
}



/** 更新顶部浏览/下载 breakdown 文案 */
function updateBreakdown(browseTotal, dlTotal) {
  const el = document.getElementById('totalBreakdown');
  const parts = [];
  if (browseTotal > 0) parts.push(`浏览 ${formatBytes(browseTotal)}`);
  if (dlTotal > 0) parts.push(`下载 ${formatBytes(dlTotal)}`);
  el.textContent = parts.join(' | ') || '暂无数据';
}

/** 加载今日数据并渲染 */
async function loadToday() {
  const todayKey = getDateKey(new Date());
  const data = await getMergedDayData(todayKey);
  const excluded = await getExcludedDomains();
  const filtered = Object.fromEntries(Object.entries(data).filter(([d]) => !excluded.has(d)));
  const total = Object.values(filtered).reduce((a, b) => a + b, 0);
  animateNumber(document.getElementById('totalValue'), total, formatBytes);
  renderDomainList(document.getElementById('domainList'), data, total, excluded);
  const bd = await getBreakdownTotals(todayKey, false);
  updateBreakdown(bd.browse, bd.download);
}

/** 加载本月数据并渲染 */
async function loadMonth() {
  const monthKey = getMonthKey(new Date());
  const data = await getMergedMonthData(monthKey);
  const excluded = await getExcludedDomains();
  const filtered = Object.fromEntries(Object.entries(data).filter(([d]) => !excluded.has(d)));
  const total = Object.values(filtered).reduce((a, b) => a + b, 0);
  animateNumber(document.getElementById('totalValue'), total, formatBytes);
  renderDomainList(document.getElementById('domainList'), data, total, excluded);
  const bd = await getBreakdownTotals(monthKey, true);
  updateBreakdown(bd.browse, bd.download);
}

document.addEventListener('DOMContentLoaded', () => {
  // 主题初始化 + 切换按钮（与 dashboard 共用 localStorage 设置）
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

  loadToday();
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.period === 'today') loadToday();
      else loadMonth();
    });
  });
  document.getElementById('openDashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });
});
