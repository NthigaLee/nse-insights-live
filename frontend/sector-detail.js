// ═══════════════════════════════════════════════════════════════
// Sector Detail Dashboard — Banking-first, template for others
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  let _activeTab = 'overview';
  let _yearView = '2024';
  let _sectorCompanies = [];
  let _charts = {};

  // ── Public entry point ──────────────────────────────────────
  window.renderSectorDetail = function (sectorName) {
    const wrap = document.getElementById('sector-detail');
    if (!wrap) return;

    // Gather sector companies
    _sectorCompanies = Object.entries(NSE_COMPANIES)
      .filter(([, co]) => normalizeSector(co.sector) === sectorName)
      .map(([ticker, co]) => ({ ticker, ...co }));

    // Show the detail panel, hide grid, old table & heatmap
    document.getElementById('sector-grid').style.display = 'none';
    document.getElementById('sector-table-wrap').classList.add('hidden');
    const heatmap = document.querySelector('.sector-heatmap-wrap');
    if (heatmap) heatmap.style.display = 'none';
    wrap.classList.remove('hidden');

    // Discover all years present in this sector's data
    const allYearsSet = new Set();
    _sectorCompanies.forEach(co => {
      (co.annuals || []).forEach(a => { if (a.year) allYearsSet.add(a.year); });
    });
    const allYears = Array.from(allYearsSet).sort((a, b) => b - a); // newest first
    const latestYear = allYears[0] || 2024;
    _yearView = String(latestYear);

    // Dynamically build year toggle buttons from actual data
    const yearToggleEl = wrap.querySelector('.sd-year-toggle');
    if (yearToggleEl) {
      yearToggleEl.innerHTML = allYears.map((y, i) =>
        `<label><input type="radio" name="sd-year" value="${y}"${i === 0 ? ' checked' : ''}> FY ${y}</label>`
      ).join('');
    }

    // Set hero
    document.getElementById('sd-hero-title').textContent =
      sectorName + ' Sector: The Full Story';
    const prevYear = allYears[1] || (latestYear - 1);
    document.getElementById('sd-hero-subtitle').textContent =
      `${_sectorCompanies.length} NSE-listed companies · FY ${latestYear} vs FY ${prevYear} · ${allYears.length} years of data`;

    // Wire tabs
    wrap.querySelectorAll('.sd-tab').forEach(btn => {
      btn.onclick = () => switchTab(btn.dataset.tab);
    });

    // Wire year radio (now dynamic)
    wrap.querySelectorAll('input[name="sd-year"]').forEach(r => {
      r.onchange = () => { _yearView = r.value; renderActiveTab(); };
    });

    // Wire back button
    document.getElementById('sd-back-btn').onclick = () => {
      wrap.classList.add('hidden');
      document.getElementById('sector-grid').style.display = '';
      const heatmap = document.querySelector('.sector-heatmap-wrap');
      if (heatmap) heatmap.style.display = '';
      destroyCharts();
    };

    // Wire profitability metric radio
    wrap.querySelectorAll('input[name="sd-profit-metric"]').forEach(r => {
      r.onchange = () => { if (_activeTab === 'profitability') renderProfitability(); };
    });

    // Wire deep-dive bank selector
    const sel = document.getElementById('sd-bank-select');
    if (sel) {
      sel.innerHTML = _sectorCompanies
        .sort((a, b) => getAnnual(b, 'pat') - getAnnual(a, 'pat'))
        .map(c => `<option value="${c.ticker}">${c.name}</option>`)
        .join('');
      sel.onchange = () => renderDeepDive();
    }

    switchTab('overview');
  };

  window.hideSectorDetail = function () {
    const wrap = document.getElementById('sector-detail');
    if (wrap) wrap.classList.add('hidden');
    const heatmap = document.querySelector('.sector-heatmap-wrap');
    if (heatmap) heatmap.style.display = '';
    destroyCharts();
  };

  // ── Helpers ─────────────────────────────────────────────────
  function getAnnual(co, field, year) {
    const yr = year || (_yearView === 'both' ? pickLatestSectorYear() : parseInt(_yearView));
    const a = (co.annuals || []).find(a => a.year === yr);
    return a ? (a[field] || 0) : 0;
  }

  // Pick the most-recent fiscal year where the SECTOR has meaningful coverage.
  // Sectors with calendar Dec year-ends (Manufacturing, Media, Diversified) have
  // their latest audited results as FY2023 not FY2024.
  function pickLatestSectorYear() {
    if (!_sectorCompanies || !_sectorCompanies.length) return 2024;
    // Pass 1: pick latest year where ≥40% have totalAssets (full audit)
    for (const y of [2025, 2024, 2023, 2022, 2021]) {
      const have = _sectorCompanies.filter(c => {
        const a = (c.annuals||[]).find(a => a.year === y);
        return a && a.totalAssets;
      }).length;
      if (have / _sectorCompanies.length >= 0.4) return y;
    }
    // Pass 2: relax to revenue-only
    for (const y of [2025, 2024, 2023, 2022, 2021]) {
      const have = _sectorCompanies.filter(c => {
        const a = (c.annuals||[]).find(a => a.year === y);
        return a && a.revenue;
      }).length;
      if (have / _sectorCompanies.length >= 0.4) return y;
    }
    return 2024;
  }

  function getLatest(co, field) {
    return co.latestPeriod ? (co.latestPeriod[field] || 0) : getAnnual(co, field, pickLatestSectorYear());
  }

  function fmt(n, decimals) {
    if (n === 0 || n == null) return '-';
    const abs = Math.abs(n);
    const d = decimals != null ? decimals : 1;
    if (abs >= 1e9) return 'Shs ' + (n / 1e9).toFixed(d) + 'Tn';
    if (abs >= 1e6) return 'Shs ' + (n / 1e6).toFixed(d) + 'Bn';
    if (abs >= 1e3) return 'Shs ' + (n / 1e3).toFixed(d) + 'Mn';
    return n.toFixed(d);
  }

  // KShs'000 to Shs Bn display
  function fmtBn(n) {
    if (!n) return '-';
    const bn = n / 1e6; // KShs'000 → billions
    return 'Shs ' + bn.toFixed(1) + 'Bn';
  }

  function fmtPct(n) {
    if (n == null || isNaN(n)) return '-';
    return n.toFixed(1) + '%';
  }

  function yoyChange(co, field) {
    const v24 = getAnnual(co, field, 2024);
    const v23 = getAnnual(co, field, 2023);
    if (!v23 || !v24) return null;
    return ((v24 - v23) / Math.abs(v23)) * 100;
  }

  function sectorSum(field, year) {
    return _sectorCompanies.reduce((s, c) => s + getAnnual(c, field, year), 0);
  }

  function sectorAvg(field, year) {
    const vals = _sectorCompanies
      .map(c => getAnnual(c, field, year))
      .filter(v => v !== 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }

  function computeROE(co, year) {
    const pat = getAnnual(co, 'pat', year);
    const eq = getAnnual(co, 'totalEquity', year);
    return eq ? (pat / eq) * 100 : 0;
  }

  function computeROA(co, year) {
    const pat = getAnnual(co, 'pat', year);
    const ta = getAnnual(co, 'totalAssets', year);
    return ta ? (pat / ta) * 100 : 0;
  }

  function computeNIM(co, year) {
    const nii = getAnnual(co, 'nii', year);
    const ta = getAnnual(co, 'totalAssets', year);
    return ta ? (nii / ta) * 100 : 0;
  }

  function computeCIR(co, year) {
    const cir = getAnnual(co, 'costToIncomeRatio', year);
    if (cir) return cir;
    const opex = getAnnual(co, 'totalOpex', year);
    const rev = getAnnual(co, 'revenue', year);
    return rev ? (opex / rev) * 100 : 0;
  }

  function shortName(name) {
    return name.replace(/ (Holdings|Group|Plc|Ltd|Limited|Kenya|Bank of Kenya)/gi, '').trim();
  }

  // ── Chart management ────────────────────────────────────────
  function destroyCharts() {
    Object.values(_charts).forEach(c => { try { c.destroy(); } catch (e) {} });
    _charts = {};
  }

  function makeChart(canvasId, config) {
    if (_charts[canvasId]) { try { _charts[canvasId].destroy(); } catch (e) {} }
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    _charts[canvasId] = new Chart(ctx, config);
    return _charts[canvasId];
  }

  // Theme-aware chart colors — explicit values for dark/light modes
  function COLORS() {
    const isDark = document.body.classList.contains('dark');
    return isDark ? {
      bars2024:   'rgba(75,163,255,0.80)',
      bars2023:   'rgba(201,169,97,0.70)',
      accent:     '#c9a961',
      grid:       'rgba(255,255,255,0.07)',
      text:       'rgba(232,237,245,0.60)',
      textStrong: '#e8edf5',
      title:      '#82bfff',
      axisLabel:  'rgba(232,237,245,0.60)',
    } : {
      bars2024:   '#1565c0',
      bars2023:   '#4ba3ff',
      accent:     '#c9a961',
      grid:       'rgba(15,23,42,0.08)',
      text:       '#475569',
      textStrong: '#0f172a',
      title:      '#0a3d7a',
      axisLabel:  '#475569',
    };
  }

  // Ranking bar colors — navy → gold gradient-ish ordering
  const BANK_COLORS = [
    '#0a3d7a', '#0e4a96', '#1565c0', '#1976d2', '#1e88ff',
    '#4ba3ff', '#82bfff', '#c9a961', '#a8872f', '#8a6f2b',
    '#d9bd7c', '#e6cf9d', '#f1e3c2',
  ];

  function chartDefaults() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: COLORS().text, font: { size: 11 } } },
      },
      scales: {
        x: { ticks: { color: COLORS().text, font: { size: 10 } }, grid: { color: COLORS().grid } },
        y: { ticks: { color: COLORS().text, font: { size: 10 } }, grid: { color: COLORS().grid } },
      },
    };
  }

  // ── Tab switching ───────────────────────────────────────────
  function switchTab(tab) {
    _activeTab = tab;
    document.querySelectorAll('.sd-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab)
    );
    document.querySelectorAll('.sd-panel').forEach(p =>
      p.classList.toggle('hidden', p.id !== 'sd-tab-' + tab)
    );
    renderActiveTab();
  }

  function renderActiveTab() {
    destroyCharts();
    switch (_activeTab) {
      case 'overview':      renderOverview(); break;
      case 'profitability': renderProfitability(); break;
      case 'efficiency':    renderEfficiency(); break;
      case 'balance-sheet': renderBalanceSheet(); break;
      case 'income-mix':    renderIncomeMix(); break;
      case 'deep-dive':     renderDeepDive(); break;
      case 'head-to-head':  renderHeadToHead(); break;
      case 'dividends':     renderDividends(); break;
      case 'insights':      renderInsights(); break;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TAB 1: OVERVIEW
  // ═══════════════════════════════════════════════════════════
  function renderOverview() {
    const yr = _yearView === 'both' ? pickLatestSectorYear() : parseInt(_yearView);
    const yr2 = yr - 1;

    // KPI calculations
    const totalPAT = sectorSum('pat', yr);
    const totalPATPrev = sectorSum('pat', yr2);
    const patYoY = totalPATPrev ? ((totalPAT - totalPATPrev) / Math.abs(totalPATPrev)) * 100 : 0;

    const totalAssets = sectorSum('totalAssets', yr);
    const totalAssetsPrev = sectorSum('totalAssets', yr2);
    const assetsYoY = totalAssetsPrev ? ((totalAssets - totalAssetsPrev) / Math.abs(totalAssetsPrev)) * 100 : 0;

    const totalDeposits = sectorSum('deposits', yr);
    const totalLoans = sectorSum('loans', yr);

    const roeVals = _sectorCompanies.map(c => computeROE(c, yr)).filter(v => v > 0);
    const avgROE = roeVals.length ? roeVals.reduce((a, b) => a + b, 0) / roeVals.length : 0;

    const nimVals = _sectorCompanies.map(c => computeNIM(c, yr)).filter(v => v > 0);
    const avgNIM = nimVals.length ? nimVals.reduce((a, b) => a + b, 0) / nimVals.length : 0;

    const cirVals = _sectorCompanies.map(c => computeCIR(c, yr)).filter(v => v > 0);
    const avgCIR = cirVals.length ? cirVals.reduce((a, b) => a + b, 0) / cirVals.length : 0;

    // Detect whether this is the Banking sector (have deposits/NIM/NPL signals)
    const isBanking = totalDeposits > 0 || avgNIM > 0;
    const isInsurance = _sectorCompanies.some(c => /Insurance/i.test(c.sector || ''))
      && _sectorCompanies.some(c => (c.annuals||[]).some(a => a.insuranceContractLiab || a.serviceResult));
    const totalTechReserves = sectorSum('insuranceContractLiab', yr);
    const totalServiceResult = sectorSum('serviceResult', yr);
    const totalServiceResultPrev = sectorSum('serviceResult', yr2);
    const techReservesPrev = sectorSum('insuranceContractLiab', yr2);
    const techYoY = techReservesPrev > 0 ? ((totalTechReserves - techReservesPrev) / techReservesPrev) * 100 : null;
    const serviceYoY = totalServiceResultPrev > 0 ? ((totalServiceResult - totalServiceResultPrev) / totalServiceResultPrev) * 100 : null;

    // Avg NPL proxy from nplRatio field or 0
    const nplVals = _sectorCompanies.map(c => getAnnual(c, 'nplRatio', yr)).filter(v => v > 0);
    const avgNPL = nplVals.length ? nplVals.reduce((a, b) => a + b, 0) / nplVals.length : 0;

    // Compute generic metrics for non-banking sectors
    const totalRevenue = sectorSum('revenue', yr);
    const totalRevenuePrev = sectorSum('revenue', yr2);
    const revenueYoY = totalRevenuePrev ? ((totalRevenue - totalRevenuePrev) / Math.abs(totalRevenuePrev)) * 100 : 0;
    const roaVals = _sectorCompanies.map(c => computeROA ? computeROA(c, yr) : 0).filter(v => v > 0);
    const avgROA = roaVals.length ? roaVals.reduce((a, b) => a + b, 0) / roaVals.length : 0;

    const kpi1 = document.getElementById('sd-kpi-row-1');
    const kpi2 = document.getElementById('sd-kpi-row-2');

    if (isBanking) {
      kpi1.innerHTML = kpiCard('SECTOR PAT', fmtBn(totalPAT), patYoY, `FY ${yr} combined`) +
        kpiCard('TOTAL ASSETS', fmtBn(totalAssets), assetsYoY, `${_sectorCompanies.length} banks`) +
        kpiCard('CUSTOMER DEPOSITS', fmtBn(totalDeposits), null, 'Total sector') +
        kpiCard('TOTAL LOANS', fmtBn(totalLoans), null, 'Net advances');

      kpi2.innerHTML = kpiCard('AVG RETURN ON EQUITY', fmtPct(avgROE), null, 'Sector average') +
        kpiCard('AVG NET INTEREST MARGIN', fmtPct(avgNIM), null, 'Sector average') +
        kpiCard('AVG COST-TO-INCOME', fmtPct(avgCIR), null, 'Lower = better') +
        (avgNPL > 0
          ? kpiCard('AVG NPL RATIO', fmtPct(avgNPL), null, 'Sector average')
          : kpiCard('COMPANIES', String(_sectorCompanies.length), null, 'NSE-listed'));
    } else if (isInsurance) {
      // Insurance-specific KPIs — IFRS 17 metrics where available
      kpi1.innerHTML = kpiCard('INSURANCE REVENUE', totalRevenue > 0 ? fmtBn(totalRevenue) : '—',
                                totalRevenue > 0 ? revenueYoY : null, `FY ${yr} combined`) +
        kpiCard('SECTOR PAT', totalPAT !== 0 ? fmtBn(totalPAT) : '—',
                totalPAT !== 0 ? patYoY : null, `FY ${yr} combined`) +
        kpiCard('TOTAL ASSETS', fmtBn(totalAssets), assetsYoY, `${_sectorCompanies.length} insurers`) +
        kpiCard('TECHNICAL RESERVES', totalTechReserves > 0 ? fmtBn(totalTechReserves) : '—',
                techYoY, 'Insurance contract liab.');

      kpi2.innerHTML = kpiCard('UNDERWRITING RESULT', totalServiceResult !== 0 ? fmtBn(totalServiceResult) : '—',
                                serviceYoY, 'Net of service expense') +
        kpiCard('AVG RETURN ON EQUITY', avgROE > 0 ? fmtPct(avgROE) : '—', null, 'Sector average') +
        kpiCard('AVG RETURN ON ASSETS', avgROA !== 0 ? fmtPct(avgROA) : '—', null, 'Sector average') +
        kpiCard('COMPANIES', String(_sectorCompanies.length), null, 'NSE-listed');
    } else {
      // Generic sector — revenue, PAT, total assets, companies
      kpi1.innerHTML = kpiCard('SECTOR REVENUE', totalRevenue > 0 ? fmtBn(totalRevenue) : '—',
                                totalRevenue > 0 ? revenueYoY : null, `FY ${yr} combined`) +
        kpiCard('SECTOR PAT', totalPAT > 0 ? fmtBn(totalPAT) : '—',
                totalPAT > 0 ? patYoY : null, `FY ${yr} combined`) +
        kpiCard('TOTAL ASSETS', totalAssets > 0 ? fmtBn(totalAssets) : '—',
                totalAssets > 0 ? assetsYoY : null, `${_sectorCompanies.length} companies`) +
        kpiCard('COMPANIES', String(_sectorCompanies.length), null, 'NSE-listed');

      kpi2.innerHTML = kpiCard('AVG RETURN ON EQUITY', avgROE > 0 ? fmtPct(avgROE) : '—', null, 'Sector average') +
        kpiCard('AVG RETURN ON ASSETS', avgROA > 0 ? fmtPct(avgROA) : '—', null, 'Sector average') +
        kpiCard('AVG COST-TO-INCOME', avgCIR > 0 ? fmtPct(avgCIR) : '—', null, 'Lower = better') +
        kpiCard('YEAR', String(yr), null, 'Reporting period');
    }

    // PAT Ranking chart
    const sorted = [..._sectorCompanies]
      .sort((a, b) => getAnnual(b, 'pat', yr) - getAnnual(a, 'pat', yr));

    makeChart('sd-chart-pat-ranking', {
      type: 'bar',
      data: {
        labels: sorted.map(c => shortName(c.name)),
        datasets: [{
          label: `PAT FY ${yr} (Shs Mn)`,
          data: sorted.map(c => getAnnual(c, 'pat', yr) / 1000), // KShs'000 → millions
          backgroundColor: sorted.map((_, i) => BANK_COLORS[i % BANK_COLORS.length]),
          borderRadius: 3,
        }],
      },
      options: {
        ...chartDefaults(),
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => 'Shs ' + (ctx.raw / 1000).toFixed(1) + 'Bn',
            },
          },
        },
        scales: {
          x: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: 'Shs Millions', color: COLORS().text } },
          y: { ticks: { color: COLORS().axisLabel, font: { size: 11 } }, grid: { display: false } },
        },
      },
    });

    // Top Earners callout
    const topEl = document.getElementById('sd-top-earners');
    if (topEl) {
      const top3 = sorted.slice(0, 3);
      topEl.innerHTML = '<h4>Top Earners</h4>' + top3.map((c, i) =>
        `<p><strong>${i + 1}. ${shortName(c.name)}</strong> — ${fmtBn(getAnnual(c, 'pat', yr))}</p>`
      ).join('');
    }

    // Asset treemap (simplified as stacked bar since Chart.js doesn't have treemap by default)
    const assetSorted = [..._sectorCompanies]
      .sort((a, b) => getAnnual(b, 'totalAssets', yr) - getAnnual(a, 'totalAssets', yr))
      .filter(c => getAnnual(c, 'totalAssets', yr) > 0);

    const treemapEl = document.getElementById('sd-asset-treemap');
    if (treemapEl) {
      treemapEl.innerHTML = assetSorted.map((c, i) => {
        const assets = getAnnual(c, 'totalAssets', yr);
        const pct = (assets / totalAssets) * 100;
        const roe = computeROE(c, yr);
        const opacity = Math.min(0.3 + (roe / 30) * 0.7, 1);
        return `<div class="sd-treemap-tile" style="flex:${Math.max(pct, 3)};opacity:${opacity.toFixed(2)}">
          <span class="sd-treemap-name">${shortName(c.name)}</span>
          <span class="sd-treemap-val">${(assets / 1e6).toFixed(0)}Bn</span>
          <span class="sd-treemap-roe">ROE ${roe.toFixed(1)}%</span>
        </div>`;
      }).join('');
    }
  }

  function kpiCard(label, value, yoy, sublabel) {
    const yoyHtml = yoy != null
      ? `<span class="sd-kpi-yoy ${yoy >= 0 ? 'pos' : 'neg'}">${yoy >= 0 ? '&#9650;' : '&#9660;'} ${Math.abs(yoy).toFixed(1)}% YoY</span>`
      : '';
    return `<div class="sd-kpi-card">
      <div class="sd-kpi-label">${label}</div>
      <div class="sd-kpi-value">${value}</div>
      ${yoyHtml}
      <div class="sd-kpi-sub">${sublabel || ''}</div>
    </div>`;
  }

  // ═══════════════════════════════════════════════════════════
  // TAB 2: PROFITABILITY LEAGUE
  // ═══════════════════════════════════════════════════════════
  function renderProfitability() {
    const yr = _yearView === 'both' ? pickLatestSectorYear() : parseInt(_yearView);
    const yr2 = yr - 1;

    // Get selected metric from radio
    const metricRadio = document.querySelector('input[name="sd-profit-metric"]:checked');
    const metric = metricRadio ? metricRadio.value : 'pat';

    const metricLabels = { pat: 'Profit After Tax', pbt: 'Profit Before Tax', revenue: 'Total Revenue', nii: 'Net Interest Income' };

    const sorted = [..._sectorCompanies]
      .sort((a, b) => getAnnual(b, metric, yr) - getAnnual(a, metric, yr));

    // Grouped bar: 2024 vs 2023
    makeChart('sd-chart-profitability', {
      type: 'bar',
      data: {
        labels: sorted.map(c => shortName(c.name)),
        datasets: [
          {
            label: `${yr}`,
            data: sorted.map(c => getAnnual(c, metric, yr) / 1000),
            backgroundColor: COLORS().bars2024,
            borderRadius: 3,
          },
          {
            label: `${yr2}`,
            data: sorted.map(c => getAnnual(c, metric, yr2) / 1000),
            backgroundColor: COLORS().bars2023,
            borderRadius: 3,
          },
        ],
      },
      options: {
        ...chartDefaults(),
        plugins: {
          title: { display: true, text: `${metricLabels[metric]} — ${yr} vs ${yr2} (Shs Mn)`, color: COLORS().title, font: { size: 14 } },
          legend: { labels: { color: COLORS().text } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': Shs ' + (ctx.raw / 1000).toFixed(1) + 'Bn' } },
        },
        scales: {
          x: { ticks: { color: COLORS().text, maxRotation: 45 }, grid: { color: COLORS().grid } },
          y: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: 'Shs Millions', color: COLORS().text } },
        },
      },
    });

    // YoY Growth charts side-by-side
    const patGrowth = sorted.map(c => ({
      name: shortName(c.name),
      growth: yoyChange(c, 'pat'),
    })).filter(g => g.growth != null).sort((a, b) => b.growth - a.growth);

    makeChart('sd-chart-pat-growth', {
      type: 'bar',
      data: {
        labels: patGrowth.map(g => g.name),
        datasets: [{
          label: 'PAT Growth %',
          data: patGrowth.map(g => g.growth),
          backgroundColor: patGrowth.map(g => g.growth >= 0 ? COLORS().bars2024 : '#ea5455'),
          borderRadius: 3,
        }],
      },
      options: {
        ...chartDefaults(),
        indexAxis: 'y',
        plugins: {
          title: { display: true, text: `PAT Growth — YoY %`, color: COLORS().title, font: { size: 13 } },
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => (ctx.raw >= 0 ? '+' : '') + ctx.raw.toFixed(1) + '%' } },
        },
        scales: {
          x: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: '% Change', color: COLORS().text } },
          y: { ticks: { color: COLORS().axisLabel, font: { size: 11 } }, grid: { display: false } },
        },
      },
    });

    const revGrowth = sorted.map(c => ({
      name: shortName(c.name),
      growth: yoyChange(c, 'revenue'),
    })).filter(g => g.growth != null).sort((a, b) => b.growth - a.growth);

    makeChart('sd-chart-rev-growth', {
      type: 'bar',
      data: {
        labels: revGrowth.map(g => g.name),
        datasets: [{
          label: 'Revenue Growth %',
          data: revGrowth.map(g => g.growth),
          backgroundColor: revGrowth.map(g => g.growth >= 0 ? COLORS().bars2024 : '#ea5455'),
          borderRadius: 3,
        }],
      },
      options: {
        ...chartDefaults(),
        indexAxis: 'y',
        plugins: {
          title: { display: true, text: `Revenue Growth — YoY %`, color: COLORS().title, font: { size: 13 } },
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => (ctx.raw >= 0 ? '+' : '') + ctx.raw.toFixed(1) + '%' } },
        },
        scales: {
          x: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: '% Change', color: COLORS().text } },
          y: { ticks: { color: COLORS().axisLabel, font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
  }

  // ═══════════════════════════════════════════════════════════
  // TAB 3: CORE EFFICIENCY
  // ═══════════════════════════════════════════════════════════
  function renderEfficiency() {
    const yr = _yearView === 'both' ? pickLatestSectorYear() : parseInt(_yearView);

    // NIM ranking
    const nimData = _sectorCompanies
      .map(c => ({ name: shortName(c.name), val: computeNIM(c, yr) }))
      .filter(d => d.val > 0)
      .sort((a, b) => b.val - a.val);

    makeChart('sd-chart-nim', {
      type: 'bar',
      data: {
        labels: nimData.map(d => d.name),
        datasets: [{
          label: `NIM % (FY ${yr})`,
          data: nimData.map(d => d.val),
          backgroundColor: COLORS().bars2024,
          borderRadius: 3,
        }],
      },
      options: {
        ...chartDefaults(),
        indexAxis: 'y',
        plugins: {
          title: { display: true, text: `Net Interest Margin — Sector Ranking`, color: COLORS().title, font: { size: 13 } },
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ctx.raw.toFixed(1) + '%' } },
        },
        scales: {
          x: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: 'NIM %', color: COLORS().text } },
          y: { ticks: { color: COLORS().axisLabel, font: { size: 11 } }, grid: { display: false } },
        },
      },
    });

    // CIR ranking
    const cirData = _sectorCompanies
      .map(c => ({ name: shortName(c.name), val: computeCIR(c, yr) }))
      .filter(d => d.val > 0)
      .sort((a, b) => a.val - b.val); // lower is better

    makeChart('sd-chart-cir', {
      type: 'bar',
      data: {
        labels: cirData.map(d => d.name),
        datasets: [{
          label: `CIR % (FY ${yr})`,
          data: cirData.map(d => d.val),
          backgroundColor: cirData.map(d => d.val < 50 ? '#00b894' : d.val < 60 ? '#ffd93d' : '#ea5455'),
          borderRadius: 3,
        }],
      },
      options: {
        ...chartDefaults(),
        indexAxis: 'y',
        plugins: {
          title: { display: true, text: `Cost-to-Income Ratio — Lower is Better`, color: COLORS().title, font: { size: 13 } },
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ctx.raw.toFixed(1) + '%' } },
        },
        scales: {
          x: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: 'CIR %', color: COLORS().text } },
          y: { ticks: { color: COLORS().axisLabel, font: { size: 11 } }, grid: { display: false } },
        },
      },
    });

    // ROE ranking
    const roeData = _sectorCompanies
      .map(c => ({ name: shortName(c.name), val: computeROE(c, yr) }))
      .filter(d => d.val > 0)
      .sort((a, b) => b.val - a.val);

    makeChart('sd-chart-roe', {
      type: 'bar',
      data: {
        labels: roeData.map(d => d.name),
        datasets: [{
          label: `ROE % (FY ${yr})`,
          data: roeData.map(d => d.val),
          backgroundColor: COLORS().bars2024,
          borderRadius: 3,
        }],
      },
      options: {
        ...chartDefaults(),
        indexAxis: 'y',
        plugins: {
          title: { display: true, text: `Return on Equity — ${yr}`, color: COLORS().title, font: { size: 13 } },
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ctx.raw.toFixed(1) + '%' } },
        },
        scales: {
          x: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: 'ROE %', color: COLORS().text } },
          y: { ticks: { color: COLORS().axisLabel, font: { size: 11 } }, grid: { display: false } },
        },
      },
    });

    // ROA ranking
    const roaData = _sectorCompanies
      .map(c => ({ name: shortName(c.name), val: computeROA(c, yr) }))
      .filter(d => d.val > 0)
      .sort((a, b) => b.val - a.val);

    makeChart('sd-chart-roa', {
      type: 'bar',
      data: {
        labels: roaData.map(d => d.name),
        datasets: [{
          label: `ROA % (FY ${yr})`,
          data: roaData.map(d => d.val),
          backgroundColor: COLORS().bars2023,
          borderRadius: 3,
        }],
      },
      options: {
        ...chartDefaults(),
        indexAxis: 'y',
        plugins: {
          title: { display: true, text: `Return on Assets — ${yr}`, color: COLORS().title, font: { size: 13 } },
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ctx.raw.toFixed(1) + '%' } },
        },
        scales: {
          x: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: 'ROA %', color: COLORS().text } },
          y: { ticks: { color: COLORS().axisLabel, font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
  }

  // ═══════════════════════════════════════════════════════════
  // TAB 4: BANK DEEP DIVE
  // ═══════════════════════════════════════════════════════════
  function renderDeepDive() {
    const sel = document.getElementById('sd-bank-select');
    const ticker = sel ? sel.value : _sectorCompanies[0]?.ticker;
    const co = _sectorCompanies.find(c => c.ticker === ticker);
    if (!co) return;

    const yr = _yearView === 'both' ? pickLatestSectorYear() : parseInt(_yearView);
    const yr2 = yr - 1;

    // Header
    document.getElementById('sd-dd-name').textContent = co.name;
    document.getElementById('sd-dd-subtitle').textContent =
      `NSE Ticker: ${co.ticker} · FY ${yr} Performance Review`;

    // KPI cards
    const pat = getAnnual(co, 'pat', yr);
    const rev = getAnnual(co, 'revenue', yr);
    const ta = getAnnual(co, 'totalAssets', yr);
    const roe = computeROE(co, yr);
    const nim = computeNIM(co, yr);

    const patChg = yoyChange(co, 'pat');
    const revChg = yoyChange(co, 'revenue');
    const taChg = yoyChange(co, 'totalAssets');

    document.getElementById('sd-dd-kpis').innerHTML =
      kpiCard(`PAT ${yr}`, fmtBn(pat), patChg, '') +
      kpiCard(`REVENUE ${yr}`, fmtBn(rev), revChg, '') +
      kpiCard('TOTAL ASSETS', fmtBn(ta), taChg, '') +
      kpiCard('ROE', fmtPct(roe), null, '') +
      kpiCard('NIM', fmtPct(nim), null, '');

    // P&L Waterfall
    const nii = getAnnual(co, 'nii', yr);
    const nonInt = rev - nii;
    const opex = getAnnual(co, 'totalOpex', yr);
    const impairment = getAnnual(co, 'loanLossProvision', yr);
    const pbt = getAnnual(co, 'pbt', yr);
    const tax = pbt - pat;

    if (nii && opex) {
      // Waterfall as bar chart
      const labels = ['NII', 'Non-Int Income', 'Operating Expenses', 'Impairments', 'PBT', 'Tax', 'PAT'];
      const values = [nii, nonInt, -opex, -impairment, pbt, -tax, pat].map(v => v / 1000);
      const colors = values.map(v => v >= 0 ? '#1565c0' : '#ea5455');
      colors[colors.length - 1] = '#1b6b93'; // PAT gets different color

      makeChart('sd-chart-waterfall', {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Shs Millions',
            data: values,
            backgroundColor: colors,
            borderRadius: 3,
          }],
        },
        options: {
          ...chartDefaults(),
          plugins: {
            title: { display: true, text: `${shortName(co.name)} — P&L Waterfall (Shs Mn)`, color: COLORS().title, font: { size: 13 } },
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => 'Shs ' + (Math.abs(ctx.raw) / 1000).toFixed(1) + 'Bn' } },
          },
          scales: {
            x: { ticks: { color: COLORS().text }, grid: { display: false } },
            y: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: 'Shs Millions', color: COLORS().text } },
          },
        },
      });
    } else {
      // No detailed data — show placeholder
      const ctx = document.getElementById('sd-chart-waterfall');
      if (ctx) {
        const parent = ctx.parentElement;
        parent.innerHTML = '<div class="sd-no-data">Detailed P&L breakdown not available for this bank.<br>Available for: ABSA, EQTY, SCBK, NCBA, KCB</div><canvas id="sd-chart-waterfall" style="display:none"></canvas>';
      }
    }

    // Balance sheet composition (doughnut)
    const deposits = getAnnual(co, 'deposits', yr);
    const equity = getAnnual(co, 'totalEquity', yr);
    const loans = getAnnual(co, 'loans', yr);
    const otherAssets = ta - loans;
    const otherLiab = ta - deposits - equity;

    if (ta > 0 && (deposits > 0 || equity > 0)) {
      makeChart('sd-chart-balance', {
        type: 'doughnut',
        data: {
          labels: ['Net Loans', 'Other Assets', 'Deposits', 'Equity', 'Other Liabilities'],
          datasets: [{
            data: [loans, otherAssets, deposits, equity, Math.max(otherLiab, 0)].map(v => v / 1e6),
            backgroundColor: ['#0a3d7a', '#c9a961', '#1976d2', '#4ba3ff', '#a8872f'],
            borderWidth: 1,
            borderColor: '#111111',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '55%',
          plugins: {
            title: { display: true, text: `${shortName(co.name)} — Balance Sheet (Shs Bn)`, color: COLORS().title, font: { size: 13 } },
            legend: { position: 'right', labels: { color: COLORS().text, font: { size: 11 }, padding: 12 } },
            tooltip: { callbacks: { label: ctx => ctx.label + ': Shs ' + ctx.raw.toFixed(0) + 'Bn' } },
          },
        },
      });
    }

    // Radar chart: bank vs sector average
    const sectorAvgROE = _sectorCompanies.map(c => computeROE(c, yr)).filter(v => v > 0);
    const sectorAvgROA = _sectorCompanies.map(c => computeROA(c, yr)).filter(v => v > 0);
    const sectorAvgNIM = _sectorCompanies.map(c => computeNIM(c, yr)).filter(v => v > 0);
    const sectorAvgCIR = _sectorCompanies.map(c => computeCIR(c, yr)).filter(v => v > 0);

    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const bankROE = computeROE(co, yr);
    const bankROA = computeROA(co, yr);
    const bankNIM = computeNIM(co, yr);
    const bankCIR = computeCIR(co, yr);

    if (bankROE > 0 || bankNIM > 0) {
      makeChart('sd-chart-radar', {
        type: 'radar',
        data: {
          labels: ['ROE (%)', 'ROA (%)', 'NIM (%)', 'CIR (%)'],
          datasets: [
            {
              label: shortName(co.name),
              data: [bankROE, bankROA * 10, bankNIM, 100 - bankCIR], // Normalize: invert CIR so higher=better
              backgroundColor: 'rgba(13, 92, 99, 0.3)',
              borderColor: '#1565c0',
              borderWidth: 2,
              pointBackgroundColor: '#1565c0',
            },
            {
              label: 'Sector Average',
              data: [avg(sectorAvgROE), avg(sectorAvgROA) * 10, avg(sectorAvgNIM), 100 - avg(sectorAvgCIR)],
              backgroundColor: 'rgba(126, 200, 200, 0.15)',
              borderColor: COLORS().accent,
              borderWidth: 2,
              borderDash: [5, 5],
              pointBackgroundColor: COLORS().accent,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: { display: true, text: 'Performance Scorecard vs Sector', color: COLORS().title, font: { size: 13 } },
            legend: { labels: { color: COLORS().text } },
          },
          scales: {
            r: {
              angleLines: { color: COLORS().grid },
              grid: { color: COLORS().grid },
              pointLabels: { color: COLORS().axisLabel, font: { size: 11 } },
              ticks: { display: false },
            },
          },
        },
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TAB 5: BALANCE SHEET
  // ═══════════════════════════════════════════════════════════
  function renderBalanceSheet() {
    const yr  = _yearView === 'both' ? pickLatestSectorYear() : parseInt(_yearView);
    const yr2 = yr - 1;
    const sorted = [..._sectorCompanies].sort((a, b) => getAnnual(b, 'totalAssets', yr) - getAnnual(a, 'totalAssets', yr));

    const isInsurance = _sectorCompanies.some(c => /Insurance/i.test(c.sector || ''))
      && _sectorCompanies.some(c => (c.annuals||[]).some(a => a.insuranceContractLiab || a.serviceResult));

    function setHeading(canvasId, heading) {
      const el = document.getElementById(canvasId);
      if (!el) return;
      const sect = el.closest('.sd-section');
      const h = sect && sect.querySelector('h3');
      if (h) h.textContent = heading;
    }

    function groupedHBar(canvasId, field, label) {
      const data = sorted.filter(c => getAnnual(c, field, yr) !== 0 || getAnnual(c, field, yr2) !== 0);
      if (!data.length) {
        const ctx = document.getElementById(canvasId);
        if (ctx) ctx.parentElement.innerHTML = '<div class="sd-no-data">' + label + ': data not yet available</div>';
        return;
      }
      makeChart(canvasId, {
        type: 'bar',
        data: {
          labels: data.map(c => shortName(c.name)),
          datasets: [
            { label: String(yr),  data: data.map(c => getAnnual(c, field, yr)  / 1000), backgroundColor: COLORS().bars2024, borderRadius: 3 },
            { label: String(yr2), data: data.map(c => getAnnual(c, field, yr2) / 1000), backgroundColor: COLORS().bars2023, borderRadius: 3 },
          ],
        },
        options: {
          ...chartDefaults(),
          indexAxis: 'y',
          plugins: {
            title: { display: true, text: `${label} (Shs Mn)`, color: COLORS().title, font: { size: 13 } },
            legend: { labels: { color: COLORS().text } },
            tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': Shs ' + (ctx.raw / 1000).toFixed(1) + 'Bn' } },
          },
          scales: {
            x: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: 'Shs Millions', color: COLORS().text } },
            y: { ticks: { color: COLORS().axisLabel, font: { size: 10 } }, grid: { display: false } },
          },
        },
      });
    }

    // Determine sector profile from the first company's sector field
    const sectorName = (_sectorCompanies[0] && _sectorCompanies[0].sector) || '';
    const isTelecoms     = /Telecoms|Technology/i.test(sectorName);
    const isFMCG         = /Consumer Goods|FMCG/i.test(sectorName);
    const isEnergy       = /Energy/i.test(sectorName);
    const isAgriculture  = /Agriculture/i.test(sectorName);
    const isManufacturing= /Manufacturing/i.test(sectorName);
    const isMedia        = /Media/i.test(sectorName);
    const isDiversified  = /Diversified/i.test(sectorName);

    if (isInsurance) {
      setHeading('sd-chart-bs-assets',   'Total Assets — Year on Year');
      setHeading('sd-chart-bs-deposits', 'Loss & LAE Reserves (Insurance Contract Liab.) — Year on Year');
      setHeading('sd-chart-bs-loans',    'Reinsurance Contract Liabilities — Year on Year');
      setHeading('sd-chart-bs-equity',   "Shareholders' Equity — Year on Year");
      groupedHBar('sd-chart-bs-assets',   'totalAssets',             `Total Assets — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-deposits', 'insuranceContractLiab',   `Loss & LAE Reserves — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-loans',    'reinsuranceContractLiab', `Reinsurance Contract Liabilities — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-equity',   'totalEquity',             `Shareholders' Equity — ${yr} vs ${yr2}`);
    } else if (isTelecoms || isEnergy) {
      // Heavy capex sectors — show network PP&E, debt, capex, equity
      setHeading('sd-chart-bs-assets',   'Total Assets — Year on Year');
      setHeading('sd-chart-bs-deposits', 'Property, Plant & Equipment (Network) — Year on Year');
      setHeading('sd-chart-bs-loans',    'Borrowings — Year on Year');
      setHeading('sd-chart-bs-equity',   "Shareholders' Equity — Year on Year");
      groupedHBar('sd-chart-bs-assets',   'totalAssets', `Total Assets — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-deposits', 'ppe',         `Network PP&E — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-loans',    'borrowings',  `Borrowings — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-equity',   'totalEquity', `Shareholders' Equity — ${yr} vs ${yr2}`);
    } else if (isFMCG || isManufacturing) {
      // Working-capital heavy — PP&E, inventory, equity
      setHeading('sd-chart-bs-assets',   'Total Assets — Year on Year');
      setHeading('sd-chart-bs-deposits', 'Property, Plant & Equipment — Year on Year');
      setHeading('sd-chart-bs-loans',    'Inventories — Year on Year');
      setHeading('sd-chart-bs-equity',   "Shareholders' Equity — Year on Year");
      groupedHBar('sd-chart-bs-assets',   'totalAssets', `Total Assets — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-deposits', 'ppe',         `Property, Plant & Equipment — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-loans',    'inventories', `Inventories — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-equity',   'totalEquity', `Shareholders' Equity — ${yr} vs ${yr2}`);
    } else if (isAgriculture) {
      // Plantation / agribusiness — biological assets, PP&E, inventory
      setHeading('sd-chart-bs-assets',   'Total Assets — Year on Year');
      setHeading('sd-chart-bs-deposits', 'Biological Assets (Plantations) — Year on Year');
      setHeading('sd-chart-bs-loans',    'Property, Plant & Equipment — Year on Year');
      setHeading('sd-chart-bs-equity',   "Shareholders' Equity — Year on Year");
      groupedHBar('sd-chart-bs-assets',   'totalAssets',       `Total Assets — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-deposits', 'biologicalAssets',  `Biological Assets — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-loans',    'ppe',               `Property, Plant & Equipment — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-equity',   'totalEquity',       `Shareholders' Equity — ${yr} vs ${yr2}`);
    } else if (isMedia) {
      // Media & services — PP&E, working capital cash, equity
      setHeading('sd-chart-bs-assets',   'Total Assets — Year on Year');
      setHeading('sd-chart-bs-deposits', 'Property, Plant & Equipment — Year on Year');
      setHeading('sd-chart-bs-loans',    'Cash & Equivalents — Year on Year');
      setHeading('sd-chart-bs-equity',   "Shareholders' Equity — Year on Year");
      groupedHBar('sd-chart-bs-assets',   'totalAssets',       `Total Assets — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-deposits', 'ppe',               `Property, Plant & Equipment — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-loans',    'cashAndEquivalents',`Cash & Equivalents — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-equity',   'totalEquity',       `Shareholders' Equity — ${yr} vs ${yr2}`);
    } else if (isDiversified) {
      setHeading('sd-chart-bs-assets',   'Total Assets — Year on Year');
      setHeading('sd-chart-bs-deposits', 'Property, Plant & Equipment — Year on Year');
      setHeading('sd-chart-bs-loans',    'Total Liabilities — Year on Year');
      setHeading('sd-chart-bs-equity',   "Shareholders' Equity — Year on Year");
      groupedHBar('sd-chart-bs-assets',   'totalAssets',     `Total Assets — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-deposits', 'ppe',             `Property, Plant & Equipment — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-loans',    'totalLiabilities',`Total Liabilities — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-equity',   'totalEquity',     `Shareholders' Equity — ${yr} vs ${yr2}`);
    } else {
      // Default = Banking
      setHeading('sd-chart-bs-assets',   'Total Assets — Year on Year');
      setHeading('sd-chart-bs-deposits', 'Customer Deposits — Year on Year');
      setHeading('sd-chart-bs-loans',    'Net Loans & Advances — Year on Year');
      setHeading('sd-chart-bs-equity',   "Shareholders' Equity — Year on Year");
      groupedHBar('sd-chart-bs-assets',   'totalAssets', `Total Assets — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-deposits', 'deposits',    `Customer Deposits — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-loans',    'loans',       `Net Loans & Advances — ${yr} vs ${yr2}`);
      groupedHBar('sd-chart-bs-equity',   'totalEquity', `Shareholders' Equity — ${yr} vs ${yr2}`);
    }

    if (isInsurance) {
      setHeading('sd-chart-bs-npl', 'Investment Assets — Year on Year');
      groupedHBar('sd-chart-bs-npl', 'investmentAssets', `Investment Assets — ${yr} vs ${yr2}`);
      return;
    }
    if (isTelecoms || isEnergy) {
      setHeading('sd-chart-bs-npl', 'Capital Expenditure (CapEx) — Year on Year');
      groupedHBar('sd-chart-bs-npl', 'capex', `CapEx — ${yr} vs ${yr2}`);
      return;
    }
    if (isFMCG || isManufacturing || isMedia || isDiversified) {
      setHeading('sd-chart-bs-npl', 'Total Liabilities — Year on Year');
      groupedHBar('sd-chart-bs-npl', 'totalLiabilities', `Total Liabilities — ${yr} vs ${yr2}`);
      return;
    }
    if (isAgriculture) {
      setHeading('sd-chart-bs-npl', 'Inventories — Year on Year');
      groupedHBar('sd-chart-bs-npl', 'inventories', `Inventories — ${yr} vs ${yr2}`);
      return;
    }
    // NPL ratio if available
    const nplData = sorted.map(c => ({ name: shortName(c.name), v24: getAnnual(c, 'nplRatio', yr), v23: getAnnual(c, 'nplRatio', yr2) })).filter(d => d.v24 > 0);
    const nplEl = document.getElementById('sd-chart-bs-npl');
    if (nplData.length && nplEl) {
      makeChart('sd-chart-bs-npl', {
        type: 'bar',
        data: {
          labels: nplData.map(d => d.name),
          datasets: [
            { label: String(yr),  data: nplData.map(d => d.v24), backgroundColor: nplData.map(d => d.v24 > 15 ? '#ea5455' : d.v24 > 10 ? '#ffd93d' : '#00b894'), borderRadius: 3 },
            { label: String(yr2), data: nplData.map(d => d.v23), backgroundColor: COLORS().bars2023, borderRadius: 3 },
          ],
        },
        options: {
          ...chartDefaults(),
          indexAxis: 'y',
          plugins: {
            title: { display: true, text: `NPL Ratio % — ${yr} vs ${yr2}`, color: COLORS().title, font: { size: 13 } },
            legend: { labels: { color: COLORS().text } },
            tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.raw.toFixed(1) + '%' } },
          },
          scales: {
            x: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: 'NPL %', color: COLORS().text } },
            y: { ticks: { color: COLORS().axisLabel, font: { size: 10 } }, grid: { display: false } },
          },
        },
      });
    } else if (nplEl) {
      nplEl.parentElement.innerHTML = '<div class="sd-no-data">NPL ratio data not yet available for this sector.</div>';
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TAB 6: INCOME MIX
  // ═══════════════════════════════════════════════════════════
  function renderIncomeMix() {
    const yr = _yearView === 'both' ? pickLatestSectorYear() : parseInt(_yearView);
    const sorted = [..._sectorCompanies]
      .filter(c => getAnnual(c, 'revenue', yr) > 0)
      .sort((a, b) => getAnnual(b, 'revenue', yr) - getAnnual(a, 'revenue', yr));

    const hasNII = sorted.some(c => getAnnual(c, 'nii', yr) > 0);
    const sectorName = (sorted[0] && sorted[0].sector) || '';
    const isInsurance = /Insurance/i.test(sectorName)
      && sorted.some(c => (c.annuals||[]).some(a => a.serviceResult || a.insuranceServiceExpense));

    if (isInsurance) { renderInsuranceIncomeMix(sorted, yr); return; }

    if (/Telecoms|Technology/i.test(sectorName)) { renderTelecomsIncomeMix(sorted, yr); return; }
    if (/Consumer Goods|FMCG/i.test(sectorName)) { renderFMCGIncomeMix(sorted, yr); return; }
    if (/Energy/i.test(sectorName))              { renderEnergyIncomeMix(sorted, yr); return; }
    if (/Agriculture/i.test(sectorName))         { renderAgriIncomeMix(sorted, yr); return; }
    if (/Manufacturing/i.test(sectorName))       { renderMfgIncomeMix(sorted, yr); return; }
    if (/Media/i.test(sectorName))               { renderMediaIncomeMix(sorted, yr); return; }
    if (/Diversified/i.test(sectorName))         { renderDiversifiedIncomeMix(sorted, yr); return; }

    if (!hasNII) {
      const wrap = document.getElementById('sd-tab-income-mix');
      if (wrap) wrap.innerHTML = '<div class="sd-no-data" style="padding:3rem">Income Mix analysis uses Net Interest Income (NII) data, available for the Banking sector.<br>This sector\'s data will be added in a future update.</div>';
      return;
    }

    // Revenue composition stacked bar
    const niiData  = sorted.map(c => getAnnual(c, 'nii', yr) / 1000);
    const nirData  = sorted.map(c => Math.max(0, (getAnnual(c, 'revenue', yr) - getAnnual(c, 'nii', yr)) / 1000));

    makeChart('sd-chart-im-composition', {
      type: 'bar',
      data: {
        labels: sorted.map(c => shortName(c.name)),
        datasets: [
          { label: 'Net Interest Income',     data: niiData, backgroundColor: COLORS().bars2024, borderRadius: 0 },
          { label: 'Non-Interest Revenue',    data: nirData, backgroundColor: COLORS().bars2023, borderRadius: 0 },
        ],
      },
      options: {
        ...chartDefaults(),
        indexAxis: 'y',
        plugins: {
          title: { display: true, text: `Revenue Mix: NII vs Non-Interest Revenue (Shs Mn) — ${yr}`, color: COLORS().title, font: { size: 13 } },
          legend: { labels: { color: COLORS().text } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': Shs ' + (ctx.raw / 1000).toFixed(1) + 'Bn' } },
        },
        scales: {
          x: { stacked: true, ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: 'Shs Millions', color: COLORS().text } },
          y: { stacked: true, ticks: { color: COLORS().axisLabel, font: { size: 10 } }, grid: { display: false } },
        },
      },
    });

    // NII share % vertical bar
    const niiPctData = sorted.map(c => {
      const rev = getAnnual(c, 'revenue', yr);
      const nii = getAnnual(c, 'nii', yr);
      return rev ? (nii / rev) * 100 : 0;
    });

    makeChart('sd-chart-im-nii-share', {
      type: 'bar',
      data: {
        labels: sorted.map(c => shortName(c.name)),
        datasets: [{
          label: 'NII Share %',
          data: niiPctData,
          backgroundColor: COLORS().bars2024,
          borderRadius: 3,
        }],
      },
      options: {
        ...chartDefaults(),
        plugins: {
          title: { display: true, text: `NII Share of Total Revenue (%) — ${yr}`, color: COLORS().title, font: { size: 13 } },
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ctx.raw.toFixed(1) + '%' } },
          datalabels: undefined,
        },
        scales: {
          x: { ticks: { color: COLORS().text, font: { size: 10 }, maxRotation: 45 }, grid: { color: COLORS().grid } },
          y: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, min: 0, max: 100, title: { display: true, text: '% of Revenue', color: COLORS().text } },
        },
      },
    });

    // Non-Interest Revenue market share doughnut
    const nirTotals = sorted.map(c => Math.max(0, getAnnual(c, 'revenue', yr) - getAnnual(c, 'nii', yr)));
    const totalNIR = nirTotals.reduce((a, b) => a + b, 0);

    if (totalNIR > 0) {
      makeChart('sd-chart-im-nir-pie', {
        type: 'doughnut',
        data: {
          labels: sorted.map(c => shortName(c.name)),
          datasets: [{
            data: nirTotals.map(v => v / 1e3),
            backgroundColor: BANK_COLORS,
            borderWidth: 1,
            borderColor: '#111111',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '50%',
          plugins: {
            title: { display: true, text: `Non-Interest Revenue — Market Share (${yr})`, color: COLORS().title, font: { size: 13 } },
            legend: { position: 'right', labels: { color: COLORS().text, font: { size: 10 }, padding: 10 } },
            tooltip: { callbacks: { label: ctx => ctx.label + ': Shs ' + (ctx.raw / 1000).toFixed(1) + 'Bn (' + ((ctx.raw / (totalNIR / 1e3)) * 100).toFixed(1) + '%)' } },
          },
        },
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TAB 8: HEAD-TO-HEAD
  // ═══════════════════════════════════════════════════════════
  function renderHeadToHead() {
    const yr  = _yearView === 'both' ? pickLatestSectorYear() : parseInt(_yearView);
    const container = document.getElementById('sd-hth-company-select');
    if (!container) return;

    // Build pill toggles if not yet built for this sector
    if (!container.dataset.built) {
      container.dataset.built = '1';
      const top5 = [..._sectorCompanies]
        .sort((a, b) => getAnnual(b, 'pat', yr) - getAnnual(a, 'pat', yr))
        .slice(0, Math.min(5, _sectorCompanies.length));

      container.innerHTML = _sectorCompanies
        .sort((a, b) => getAnnual(b, 'pat', yr) - getAnnual(a, 'pat', yr))
        .map(c => {
          const sel = top5.find(t => t.ticker === c.ticker) ? 'selected' : '';
          return `<button class="sd-hth-pill ${sel}" data-ticker="${c.ticker}">${shortName(c.name)}</button>`;
        }).join('');

      container.querySelectorAll('.sd-hth-pill').forEach(btn => {
        btn.onclick = () => {
          btn.classList.toggle('selected');
          _drawHeadToHead(yr);
        };
      });
    }

    _drawHeadToHead(yr);
  }

  function _drawHeadToHead(yr) {
    // Get selected tickers
    const pills = document.querySelectorAll('#sd-hth-company-select .sd-hth-pill.selected');
    const selected = Array.from(pills).map(p => p.dataset.ticker);
    const companies = _sectorCompanies.filter(c => selected.includes(c.ticker));

    if (companies.length < 2) {
      const radarEl = document.getElementById('sd-chart-hth-radar');
      if (radarEl) radarEl.parentElement.innerHTML = '<div class="sd-no-data">Select at least 2 companies to compare.</div><canvas id="sd-chart-hth-radar" style="display:none"></canvas>';
      return;
    }

    // Compute metrics for each company (normalised 0-100)
    const roeArr  = companies.map(c => computeROE(c, yr));
    const roaArr  = companies.map(c => computeROA(c, yr));
    const nimArr  = companies.map(c => computeNIM(c, yr));
    const patGArr = companies.map(c => { const g = yoyChange(c, 'pat'); return g != null ? Math.max(-50, Math.min(100, g)) : 0; });
    const revGArr = companies.map(c => { const g = yoyChange(c, 'revenue'); return g != null ? Math.max(-50, Math.min(100, g)) : 0; });

    // Normalize to 0-100 within the peer group
    const norm = (arr) => {
      const mn = Math.min(...arr), mx = Math.max(...arr);
      return arr.map(v => mx === mn ? 50 : Math.round(((v - mn) / (mx - mn)) * 100));
    };
    const roeN = norm(roeArr), roaN = norm(roaArr), nimN = norm(nimArr);
    const patN = norm(patGArr), revN = norm(revGArr);

    const colors = ['#4fc0d0', '#ffd93d', '#ff8a5c', '#a2d5ab', '#a29bfe', '#fd79a8', '#00b894', '#ea5455'];
    const datasets = companies.map((c, i) => ({
      label: shortName(c.name),
      data: [roeN[i], roaN[i], nimN[i], patN[i], revN[i]],
      backgroundColor: colors[i % colors.length] + '26',
      borderColor: colors[i % colors.length],
      borderWidth: 2,
      pointBackgroundColor: colors[i % colors.length],
    }));

    // Re-create canvas if needed
    const radarWrap = document.getElementById('sd-chart-hth-radar');
    if (radarWrap && radarWrap.style && radarWrap.style.display === 'none') {
      radarWrap.style.display = '';
    }

    makeChart('sd-chart-hth-radar', {
      type: 'radar',
      data: {
        labels: ['ROE', 'ROA', 'NIM', 'PAT Growth', 'Rev Growth'],
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'Multi-Company Performance Radar (Peer-Normalised)', color: COLORS().title, font: { size: 13 } },
          legend: { labels: { color: COLORS().text, font: { size: 10 } } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.raw + ' pts' } },
        },
        scales: {
          r: {
            min: 0, max: 100,
            angleLines: { color: COLORS().grid },
            grid: { color: COLORS().grid },
            pointLabels: { color: COLORS().axisLabel, font: { size: 12 } },
            ticks: { display: false },
          },
        },
      },
    });

    // Side-by-side metric bar
    const metricSel = document.getElementById('sd-hth-metric-select');
    const metric = metricSel ? metricSel.value : 'pat';
    const metricNames = { pat: 'Profit After Tax', pbt: 'Profit Before Tax', revenue: 'Total Revenue', nii: 'NII', totalAssets: 'Total Assets', totalEquity: 'Equity' };

    // Wire metric selector once
    if (metricSel && !metricSel.dataset.wired) {
      metricSel.dataset.wired = '1';
      metricSel.onchange = () => _drawHeadToHead(yr);
    }

    const sortedSel = [...companies].sort((a, b) => getAnnual(b, metric, yr) - getAnnual(a, metric, yr));
    makeChart('sd-chart-hth-bar', {
      type: 'bar',
      data: {
        labels: sortedSel.map(c => shortName(c.name)),
        datasets: [{
          label: metricNames[metric] || metric,
          data: sortedSel.map(c => getAnnual(c, metric, yr) / 1000),
          backgroundColor: sortedSel.map((_, i) => colors[i % colors.length]),
          borderRadius: 4,
        }],
      },
      options: {
        ...chartDefaults(),
        plugins: {
          title: { display: true, text: `${metricNames[metric] || metric} — Head-to-Head (${yr})`, color: COLORS().title, font: { size: 13 } },
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => 'Shs ' + (ctx.raw / 1000).toFixed(1) + 'Bn' } },
        },
        scales: {
          x: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid } },
          y: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: 'Shs Millions', color: COLORS().text } },
        },
      },
    });

    // Comparison table
    const tableEl = document.getElementById('sd-hth-table');
    if (tableEl) {
      const metrics = [
        { key: 'pat',         label: 'PAT',          fmt: v => fmtBn(v) },
        { key: 'revenue',     label: 'Revenue',      fmt: v => fmtBn(v) },
        { key: 'totalAssets', label: 'Total Assets', fmt: v => fmtBn(v) },
        { key: '_roe',        label: 'ROE',          fmt: v => fmtPct(v) },
        { key: '_nim',        label: 'NIM',          fmt: v => fmtPct(v) },
        { key: '_cir',        label: 'CIR',          fmt: v => fmtPct(v) },
        { key: 'eps',         label: 'EPS',          fmt: v => v ? 'Shs ' + v.toFixed(2) : '-' },
        { key: 'dps',         label: 'DPS',          fmt: v => v ? 'Shs ' + v.toFixed(2) : '-' },
      ];

      tableEl.innerHTML = `
        <table class="sd-cmp-table">
          <thead><tr><th>Metric</th>${sortedSel.map(c => `<th>${shortName(c.name)}</th>`).join('')}</tr></thead>
          <tbody>
            ${metrics.map(m => {
              const vals = sortedSel.map(c => {
                if (m.key === '_roe') return computeROE(c, yr);
                if (m.key === '_nim') return computeNIM(c, yr);
                if (m.key === '_cir') return computeCIR(c, yr);
                return getAnnual(c, m.key, yr);
              });
              const best = m.key === '_cir' ? Math.min(...vals.filter(v => v > 0)) : Math.max(...vals.filter(v => v > 0));
              return `<tr><td>${m.label}</td>${vals.map((v, i) => {
                const cls = v === best && v > 0 ? ' class="sd-cmp-best"' : '';
                return `<td${cls}>${m.fmt(v)}</td>`;
              }).join('')}</tr>`;
            }).join('')}
          </tbody>
        </table>`;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TAB 9: PAY & DIVIDENDS
  // ═══════════════════════════════════════════════════════════
  function renderDividends() {
    const yr  = _yearView === 'both' ? pickLatestSectorYear() : parseInt(_yearView);
    const yr2 = yr - 1;

    const sorted = [..._sectorCompanies]
      .filter(c => getAnnual(c, 'eps', yr) > 0)
      .sort((a, b) => getAnnual(b, 'eps', yr) - getAnnual(a, 'eps', yr));

    if (!sorted.length) {
      const el = document.getElementById('sd-tab-dividends');
      if (el) el.innerHTML = '<div class="sd-no-data" style="padding:3rem">EPS/DPS data not available for this sector yet.</div>';
      return;
    }

    // EPS ranking
    makeChart('sd-chart-div-eps', {
      type: 'bar',
      data: {
        labels: sorted.map(c => shortName(c.name)),
        datasets: [
          { label: String(yr),  data: sorted.map(c => getAnnual(c, 'eps', yr)),  backgroundColor: COLORS().bars2024, borderRadius: 3 },
          { label: String(yr2), data: sorted.map(c => getAnnual(c, 'eps', yr2)), backgroundColor: COLORS().bars2023, borderRadius: 3 },
        ],
      },
      options: {
        ...chartDefaults(),
        indexAxis: 'y',
        plugins: {
          title: { display: true, text: `Earnings Per Share (EPS) — ${yr} vs ${yr2}`, color: COLORS().title, font: { size: 13 } },
          legend: { labels: { color: COLORS().text } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': Shs ' + ctx.raw.toFixed(2) } },
        },
        scales: {
          x: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: 'Shs', color: COLORS().text } },
          y: { ticks: { color: COLORS().axisLabel, font: { size: 10 } }, grid: { display: false } },
        },
      },
    });

    // DPS ranking
    const dpsData = sorted.filter(c => getAnnual(c, 'dps', yr) > 0);
    if (dpsData.length) {
      makeChart('sd-chart-div-dps', {
        type: 'bar',
        data: {
          labels: dpsData.map(c => shortName(c.name)),
          datasets: [
            { label: String(yr),  data: dpsData.map(c => getAnnual(c, 'dps', yr)),  backgroundColor: '#4fc0d0', borderRadius: 3 },
            { label: String(yr2), data: dpsData.map(c => getAnnual(c, 'dps', yr2)), backgroundColor: COLORS().bars2023, borderRadius: 3 },
          ],
        },
        options: {
          ...chartDefaults(),
          indexAxis: 'y',
          plugins: {
            title: { display: true, text: `Dividend Per Share (DPS) — ${yr} vs ${yr2}`, color: COLORS().title, font: { size: 13 } },
            legend: { labels: { color: COLORS().text } },
            tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': Shs ' + ctx.raw.toFixed(2) } },
          },
          scales: {
            x: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: 'Shs', color: COLORS().text } },
            y: { ticks: { color: COLORS().axisLabel, font: { size: 10 } }, grid: { display: false } },
          },
        },
      });
    }

    // Payout ratio (DPS/EPS %)
    const payoutData = sorted
      .map(c => ({ name: shortName(c.name), payout: getAnnual(c, 'eps', yr) ? (getAnnual(c, 'dps', yr) / getAnnual(c, 'eps', yr)) * 100 : 0 }))
      .filter(d => d.payout > 0)
      .sort((a, b) => b.payout - a.payout);

    if (payoutData.length) {
      makeChart('sd-chart-div-payout', {
        type: 'bar',
        data: {
          labels: payoutData.map(d => d.name),
          datasets: [{
            label: 'Payout Ratio %',
            data: payoutData.map(d => d.payout),
            backgroundColor: payoutData.map(d => d.payout > 80 ? '#ffd93d' : d.payout > 50 ? '#4fc0d0' : COLORS().bars2024),
            borderRadius: 3,
          }],
        },
        options: {
          ...chartDefaults(),
          indexAxis: 'y',
          plugins: {
            title: { display: true, text: `Payout Ratio (DPS/EPS %) — ${yr}`, color: COLORS().title, font: { size: 13 } },
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ctx.raw.toFixed(1) + '%' } },
          },
          scales: {
            x: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: '% of EPS', color: COLORS().text } },
            y: { ticks: { color: COLORS().axisLabel, font: { size: 10 } }, grid: { display: false } },
          },
        },
      });
    }

    // Dividend yield (DPS / latestPrice)
    const yieldData = sorted
      .map(c => {
        const dps = getAnnual(c, 'dps', yr);
        const price = c.latestPrice;
        return { name: shortName(c.name), yield: dps && price ? (dps / price) * 100 : 0 };
      })
      .filter(d => d.yield > 0)
      .sort((a, b) => b.yield - a.yield);

    const yieldEl = document.getElementById('sd-div-yield-list');
    if (yieldEl && yieldData.length) {
      yieldEl.innerHTML = `<h3>Dividend Yield Ranking</h3>` +
        yieldData.map((d, i) =>
          `<div class="sd-div-yield-row">
            <span class="sd-div-rank">${i + 1}</span>
            <span class="sd-div-name">${d.name}</span>
            <span class="sd-div-val">${d.yield.toFixed(1)}%</span>
          </div>`
        ).join('');
    } else if (yieldEl) {
      yieldEl.innerHTML = '<h3>Dividend Yield</h3><div class="sd-no-data" style="padding:1rem">Price data needed for yield calculation.</div>';
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TAB 10: INSIGHTS & STORY
  // ═══════════════════════════════════════════════════════════
  function renderInsights() {
    const yr  = _yearView === 'both' ? pickLatestSectorYear() : parseInt(_yearView);
    const yr2 = yr - 1;

    const sorted = [..._sectorCompanies].sort((a, b) => getAnnual(b, 'pat', yr) - getAnnual(a, 'pat', yr));

    // Quick rankings sidebar
    const rankPAT    = [...sorted].map(c => ({ name: shortName(c.name), val: fmtBn(getAnnual(c, 'pat', yr)) }));
    const rankROE    = [...sorted].sort((a, b) => computeROE(b, yr) - computeROE(a, yr)).map(c => ({ name: shortName(c.name), val: fmtPct(computeROE(c, yr)) }));
    const rankNIM    = [...sorted].filter(c => computeNIM(c, yr) > 0).sort((a, b) => computeNIM(b, yr) - computeNIM(a, yr)).map(c => ({ name: shortName(c.name), val: fmtPct(computeNIM(c, yr)) }));
    const rankEPS    = [...sorted].filter(c => getAnnual(c, 'eps', yr) > 0).sort((a, b) => getAnnual(b, 'eps', yr) - getAnnual(a, 'eps', yr)).map(c => ({ name: shortName(c.name), val: 'Shs ' + getAnnual(c, 'eps', yr).toFixed(2) }));

    function rankList(title, items) {
      return `<div class="sd-ins-rank-section">
        <div class="sd-ins-rank-title">${title}</div>
        ${items.slice(0, 5).map((it, i) =>
          `<div class="sd-ins-rank-row"><span class="sd-ins-rank-num">${i + 1}</span><span class="sd-ins-rank-name">${it.name}</span><span class="sd-ins-rank-val">${it.val}</span></div>`
        ).join('')}
      </div>`;
    }

    const rankEl = document.getElementById('sd-ins-rankings');
    if (rankEl) {
      rankEl.innerHTML =
        rankList('PAT (Shs Bn)', rankPAT) +
        (rankROE.length ? rankList('ROE %', rankROE) : '') +
        (rankNIM.length ? rankList('NIM %', rankNIM) : '') +
        (rankEPS.length ? rankList('EPS (Shs)', rankEPS) : '');
    }

    // Auto-generate narrative chapters
    const storyEl = document.getElementById('sd-ins-story');
    if (!storyEl) return;

    // Chapter 1: Profit Story
    const topPAT       = sorted[0];
    const topPATGrowth = [...sorted].filter(c => yoyChange(c, 'pat') != null).sort((a, b) => yoyChange(b, 'pat') - yoyChange(a, 'pat'));
    const bottomPAT    = sorted[sorted.length - 1];

    const sectorPAT    = sectorSum('pat', yr);
    const sectorPATPrev = sectorSum('pat', yr2);
    const sectorGrowth = sectorPATPrev ? ((sectorPAT - sectorPATPrev) / Math.abs(sectorPATPrev)) * 100 : 0;

    const callouts = [];

    // Top performer by PAT
    if (topPAT) {
      const g = yoyChange(topPAT, 'pat');
      callouts.push({
        icon: '🏆',
        title: `${shortName(topPAT.name)} — Profit Leader`,
        body: `${shortName(topPAT.name)} posted the highest PAT of ${fmtBn(getAnnual(topPAT, 'pat', yr))} in ${yr}${g != null ? `, a ${g >= 0 ? '+' : ''}${g.toFixed(1)}% change YoY` : ''}.`,
      });
    }

    // Fastest growing
    if (topPATGrowth.length) {
      const c = topPATGrowth[0];
      const g = yoyChange(c, 'pat');
      if (g > 0) callouts.push({
        icon: '🚀',
        title: `${shortName(c.name)} — Fastest Growing`,
        body: `Profit after tax surged ${g.toFixed(1)}% from ${fmtBn(getAnnual(c, 'pat', yr2))} to ${fmtBn(getAnnual(c, 'pat', yr))} — the biggest YoY jump in the sector.`,
      });
    }

    // Best ROE
    const topROE = rankROE[0];
    if (topROE) {
      const co = _sectorCompanies.find(c => shortName(c.name) === topROE.name) || _sectorCompanies.find(c => c.name.includes(topROE.name));
      if (co) callouts.push({
        icon: '💹',
        title: `${topROE.name} — Best Return on Equity`,
        body: `${topROE.name} leads on capital efficiency with ROE of ${topROE.val}. Strong earnings relative to shareholders' equity reflects effective capital deployment.`,
      });
    }

    // Best NIM (banking)
    if (rankNIM.length) {
      callouts.push({
        icon: '📐',
        title: `${rankNIM[0].name} — Highest Net Interest Margin`,
        body: `${rankNIM[0].name} achieved a NIM of ${rankNIM[0].val}, indicating superior pricing power and asset-liability management compared to sector peers.`,
      });
    }

    // Smallest / concern
    if (bottomPAT && bottomPAT.ticker !== topPAT?.ticker) {
      const patVal = getAnnual(bottomPAT, 'pat', yr);
      if (patVal < sectorPAT * 0.03) {
        callouts.push({
          icon: '⚠️',
          title: `${shortName(bottomPAT.name)} — Lags the Pack`,
          body: `${shortName(bottomPAT.name)} contributed just ${fmtBn(patVal)} to sector profits, representing ${((patVal / sectorPAT) * 100).toFixed(1)}% of the total. Scale and operational challenges remain key concerns.`,
        });
      }
    }

    // Chapter 2: Efficiency story (CIR)
    const bestCIR  = [..._sectorCompanies].filter(c => computeCIR(c, yr) > 0).sort((a, b) => computeCIR(a, yr) - computeCIR(b, yr));
    const worstCIR = [...bestCIR].reverse();

    if (bestCIR.length) {
      callouts.push({
        icon: '⚙️',
        title: `${shortName(bestCIR[0].name)} — Most Efficient Operations`,
        body: `With a CIR of ${fmtPct(computeCIR(bestCIR[0], yr))}, ${shortName(bestCIR[0].name)} is the most operationally efficient in the sector. CIR below 50% indicates excellent cost control.`,
      });
    }

    storyEl.innerHTML = `
      <div class="sd-ins-chapter-title">📊 Chapter 1: The Profit Story — FY ${yr}</div>
      <div class="sd-ins-summary">
        The sector generated a combined PAT of <strong>${fmtBn(sectorPAT)}</strong> in ${yr}${sectorGrowth !== 0 ? ` — a <strong>${sectorGrowth >= 0 ? '+' : ''}${sectorGrowth.toFixed(1)}%</strong> ${sectorGrowth >= 0 ? 'jump' : 'decline'} from ${yr2}` : ''}. ${sorted.length} companies are NSE-listed in this sector.
      </div>
      ${callouts.map(c => `
        <div class="sd-ins-callout">
          <div class="sd-ins-callout-icon">${c.icon}</div>
          <div>
            <div class="sd-ins-callout-title">${c.title}</div>
            <div class="sd-ins-callout-body">${c.body}</div>
          </div>
        </div>`).join('')}

      <div class="sd-ins-chapter-title" style="margin-top:1.5rem">📈 Chapter 2: What the Numbers Say</div>
      <div class="sd-ins-summary">Key metrics at a glance for ${yr}:</div>
      <div class="sd-ins-metrics-grid">
        ${[
          { label: 'Total Sector PAT',    val: fmtBn(sectorSum('pat', yr)) },
          { label: 'Total Assets',        val: fmtBn(sectorSum('totalAssets', yr)) },
          { label: 'Total Revenue',       val: fmtBn(sectorSum('revenue', yr)) },
          { label: 'Avg ROE',             val: fmtPct(rankROE.length ? parseFloat(rankROE.reduce((_, c) => 0) || 0) : computeROE(_sectorCompanies[0] || {}, yr)) },
          { label: 'Avg NIM',             val: rankNIM.length ? rankNIM.map(r => parseFloat(r.val)).filter(v => !isNaN(v)).reduce((a, b, _, arr) => a + b / arr.length, 0).toFixed(1) + '%' : '-' },
          { label: '# Companies',         val: String(_sectorCompanies.length) },
        ].map(m => `<div class="sd-ins-metric-tile"><div class="sd-ins-metric-val">${m.val}</div><div class="sd-ins-metric-label">${m.label}</div></div>`).join('')}
      </div>`;
  }

  // ─── Insurance income mix: net insurance revenue + investment income ───
  function renderInsuranceIncomeMix(sorted, yr) {
    function netInsRev(c) {
      const a = (c.annuals||[]).find(a => a.year === yr) || {};
      if (a.serviceResult != null) return a.serviceResult;
      // Only compute the fallback when we have at least one expense component;
      // otherwise we'd be passing gross revenue off as net, which is misleading.
      if (a.insuranceServiceExpense == null && a.netReinsExpense == null) return 0;
      const rev = a.revenue || 0;
      const se  = Math.abs(a.insuranceServiceExpense || 0);
      const re  = Math.abs(a.netReinsExpense || 0);
      return rev - se - re;
    }
    function invIncome(c) {
      const a = (c.annuals||[]).find(a => a.year === yr) || {};
      return a.netInvestmentIncome || a.interestIncome || 0;
    }

    const niData = sorted.map(c => netInsRev(c) / 1000);
    const ivData = sorted.map(c => invIncome(c) / 1000);

    makeChart('sd-chart-im-composition', {
      type: 'bar',
      data: {
        labels: sorted.map(c => shortName(c.name)),
        datasets: [
          { label: 'Net Insurance Revenue (premiums – claims & reins.)', data: niData, backgroundColor: COLORS().bars2024, borderRadius: 0 },
          { label: 'Investment & Other Income',                          data: ivData, backgroundColor: COLORS().bars2023, borderRadius: 0 },
        ],
      },
      options: {
        ...chartDefaults(),
        indexAxis: 'y',
        plugins: {
          title: { display: true, text: 'Income Mix: Net Insurance Revenue vs Investment Income (Shs Mn) — ' + yr, color: COLORS().title, font: { size: 13 } },
          legend: { labels: { color: COLORS().text } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': Shs ' + (ctx.raw / 1000).toFixed(2) + 'Bn' } },
        },
        scales: {
          x: { stacked: true, ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: 'Shs Millions', color: COLORS().text } },
          y: { stacked: true, ticks: { color: COLORS().axisLabel, font: { size: 10 } }, grid: { display: false } },
        },
      },
    });

    const ivPctData = sorted.map(c => {
      const ni = netInsRev(c);
      const iv = invIncome(c);
      const t  = Math.abs(ni) + Math.abs(iv);
      return t ? (iv / t) * 100 : 0;
    });
    makeChart('sd-chart-im-nii-share', {
      type: 'bar',
      data: {
        labels: sorted.map(c => shortName(c.name)),
        datasets: [{
          label: 'Investment Income Share %',
          data: ivPctData,
          backgroundColor: COLORS().bars2024,
          borderRadius: 3,
        }],
      },
      options: {
        ...chartDefaults(),
        plugins: {
          title: { display: true, text: 'Investment Income — Share of Total (%) — ' + yr, color: COLORS().title, font: { size: 13 } },
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ctx.raw.toFixed(1) + '%' } },
          datalabels: undefined,
        },
        scales: {
          x: { ticks: { color: COLORS().text, font: { size: 10 }, maxRotation: 45 }, grid: { color: COLORS().grid } },
          y: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, min: 0, max: 100, title: { display: true, text: '% of (Net Ins Rev + Inv Income)', color: COLORS().text } },
        },
      },
    });

    const ivTotals = sorted.map(c => Math.max(0, invIncome(c)));
    const totalIV = ivTotals.reduce((a, b) => a + b, 0);
    if (totalIV > 0) {
      makeChart('sd-chart-im-nir-pie', {
        type: 'doughnut',
        data: {
          labels: sorted.map(c => shortName(c.name)),
          datasets: [{
            data: ivTotals.map(v => v / 1e3),
            backgroundColor: BANK_COLORS,
            borderWidth: 1,
            borderColor: '#111111',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '50%',
          plugins: {
            title: { display: true, text: 'Investment Income — Market Share (' + yr + ')', color: COLORS().title, font: { size: 13 } },
            legend: { position: 'right', labels: { color: COLORS().text, font: { size: 10 }, padding: 10 } },
            tooltip: { callbacks: { label: ctx => ctx.label + ': Shs ' + (ctx.raw / 1000).toFixed(1) + 'Bn (' + ((ctx.raw / (totalIV / 1e3)) * 100).toFixed(1) + '%)' } },
          },
        },
      });
    }
  }

  // ─── Generic two-stack income-mix renderer used by sector-specific helpers ───
  function _stackedIncomeMix(sorted, yr, opts) {
    const labelA = opts.labelA, labelB = opts.labelB;
    const fa = opts.fnA, fb = opts.fnB;
    const titleStack = opts.titleStack;
    const titleShare = opts.titleShare;
    const titlePie   = opts.titlePie;
    const shareYAxis = opts.shareYAxis;

    const aData = sorted.map(c => fa(c) / 1000);
    const bData = sorted.map(c => fb(c) / 1000);

    makeChart('sd-chart-im-composition', {
      type: 'bar',
      data: {
        labels: sorted.map(c => shortName(c.name)),
        datasets: [
          { label: labelA, data: aData, backgroundColor: COLORS().bars2024, borderRadius: 0 },
          { label: labelB, data: bData, backgroundColor: COLORS().bars2023, borderRadius: 0 },
        ],
      },
      options: {
        ...chartDefaults(),
        indexAxis: 'y',
        plugins: {
          title: { display: true, text: titleStack + ' (Shs Mn) — ' + yr, color: COLORS().title, font: { size: 13 } },
          legend: { labels: { color: COLORS().text } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': Shs ' + (ctx.raw / 1000).toFixed(2) + 'Bn' } },
        },
        scales: {
          x: { stacked: true, ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, title: { display: true, text: 'Shs Millions', color: COLORS().text } },
          y: { stacked: true, ticks: { color: COLORS().axisLabel, font: { size: 10 } }, grid: { display: false } },
        },
      },
    });

    const pctData = sorted.map(c => {
      const a = fa(c), b = fb(c);
      const t = Math.abs(a) + Math.abs(b);
      return t ? (b / t) * 100 : 0;
    });
    makeChart('sd-chart-im-nii-share', {
      type: 'bar',
      data: { labels: sorted.map(c => shortName(c.name)),
              datasets: [{ label: labelB + ' Share %', data: pctData, backgroundColor: COLORS().bars2024, borderRadius: 3 }] },
      options: {
        ...chartDefaults(),
        plugins: {
          title: { display: true, text: titleShare + ' — ' + yr, color: COLORS().title, font: { size: 13 } },
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ctx.raw.toFixed(1) + '%' } },
          datalabels: undefined,
        },
        scales: {
          x: { ticks: { color: COLORS().text, font: { size: 10 }, maxRotation: 45 }, grid: { color: COLORS().grid } },
          y: { ticks: { color: COLORS().text }, grid: { color: COLORS().grid }, min: 0, max: 100, title: { display: true, text: shareYAxis, color: COLORS().text } },
        },
      },
    });

    const bTotals = sorted.map(c => Math.max(0, fb(c)));
    const totalB = bTotals.reduce((a,b)=>a+b, 0);
    if (totalB > 0) {
      makeChart('sd-chart-im-nir-pie', {
        type: 'doughnut',
        data: {
          labels: sorted.map(c => shortName(c.name)),
          datasets: [{ data: bTotals.map(v => v / 1e3), backgroundColor: BANK_COLORS, borderWidth: 1, borderColor: '#111111' }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '50%',
          plugins: {
            title: { display: true, text: titlePie + ' (' + yr + ')', color: COLORS().title, font: { size: 13 } },
            legend: { position: 'right', labels: { color: COLORS().text, font: { size: 10 }, padding: 10 } },
            tooltip: { callbacks: { label: ctx => ctx.label + ': Shs ' + (ctx.raw / 1000).toFixed(1) + 'Bn (' + ((ctx.raw / (totalB / 1e3)) * 100).toFixed(1) + '%)' } },
          },
        },
      });
    }
  }

  function _val(c, yr, k) { const a = (c.annuals||[]).find(a=>a.year===yr) || {}; return a[k] || 0; }

  function renderTelecomsIncomeMix(sorted, yr) {
    // Service revenue (voice + data + M-Pesa) vs Other revenue (handsets + other)
    _stackedIncomeMix(sorted, yr, {
      labelA: 'Service Revenue',
      labelB: 'M-PESA Revenue',
      fnA: c => _val(c, yr, 'serviceRevenue') || _val(c, yr, 'revenue'),
      fnB: c => _val(c, yr, 'segMpesa'),
      titleStack: 'Service Revenue vs M-PESA Revenue',
      titleShare: 'M-PESA — Share of Service Revenue (%)',
      titlePie:   'M-PESA Revenue — Market Share',
      shareYAxis: '% of Service Revenue',
    });
  }

  function renderFMCGIncomeMix(sorted, yr) {
    // Gross profit (= revenue - cogs) vs Operating expenses (proxy: revenue - grossProfit - ebit) — show as Gross Profit vs Other Income / cost-coverage
    _stackedIncomeMix(sorted, yr, {
      labelA: 'Gross Profit (Revenue − COGS)',
      labelB: 'Operating Profit (EBIT)',
      fnA: c => _val(c, yr, 'grossProfit') || (_val(c, yr, 'revenue') + _val(c, yr, 'cogs')),
      fnB: c => _val(c, yr, 'ebit') || _val(c, yr, 'operatingProfit'),
      titleStack: 'Gross Profit vs Operating Profit',
      titleShare: 'Operating Margin (EBIT as % of Gross Profit)',
      titlePie:   'Operating Profit — Market Share',
      shareYAxis: '% of Gross Profit',
    });
  }

  function renderEnergyIncomeMix(sorted, yr) {
    _stackedIncomeMix(sorted, yr, {
      labelA: 'Net Revenue (after fuel/power purchases)',
      labelB: 'Operating Profit',
      fnA: c => _val(c, yr, 'netRevenue') || (_val(c, yr, 'revenue') + _val(c, yr, 'cogs') + _val(c, yr, 'reimbursableExpenses')),
      fnB: c => _val(c, yr, 'operatingProfit') || _val(c, yr, 'ebit'),
      titleStack: 'Net Revenue vs Operating Profit',
      titleShare: 'Operating Margin %',
      titlePie:   'Operating Profit — Market Share',
      shareYAxis: '% of Net Revenue',
    });
  }

  function renderAgriIncomeMix(sorted, yr) {
    // Operating profit vs Fair value gain on biological assets + finance income
    _stackedIncomeMix(sorted, yr, {
      labelA: 'Operating Profit/Loss',
      labelB: 'Other Income (Fair Value + Interest)',
      fnA: c => _val(c, yr, 'operatingProfit') || _val(c, yr, 'ebit'),
      fnB: c => _val(c, yr, 'fairValueBio') + _val(c, yr, 'financeIncome') + _val(c, yr, 'shareOfAssociate'),
      titleStack: 'Operating Profit vs Other Income',
      titleShare: 'Other Income — Share of PBT (%)',
      titlePie:   'Other Income — Market Share',
      shareYAxis: '% of total income',
    });
  }

  function renderMfgIncomeMix(sorted, yr) {
    _stackedIncomeMix(sorted, yr, {
      labelA: 'Gross Profit',
      labelB: 'Operating Profit',
      fnA: c => _val(c, yr, 'grossProfit') || (_val(c, yr, 'revenue') + _val(c, yr, 'cogs')),
      fnB: c => _val(c, yr, 'ebit') || _val(c, yr, 'operatingProfit'),
      titleStack: 'Gross Profit vs Operating Profit',
      titleShare: 'Operating Margin (EBIT as % of GP)',
      titlePie:   'Operating Profit — Market Share',
      shareYAxis: '% of Gross Profit',
    });
  }

  function renderMediaIncomeMix(sorted, yr) {
    _stackedIncomeMix(sorted, yr, {
      labelA: 'Revenue',
      labelB: 'Operating Profit/Loss',
      fnA: c => _val(c, yr, 'revenue'),
      fnB: c => _val(c, yr, 'operatingProfit') || _val(c, yr, 'ebit') || _val(c, yr, 'pbt'),
      titleStack: 'Revenue vs Operating Profit',
      titleShare: 'Operating Margin %',
      titlePie:   'Operating Profit — Market Share',
      shareYAxis: '% of Revenue',
    });
  }

  function renderDiversifiedIncomeMix(sorted, yr) {
    _stackedIncomeMix(sorted, yr, {
      labelA: 'Revenue',
      labelB: 'EBITDA / Operating Profit',
      fnA: c => _val(c, yr, 'revenue'),
      fnB: c => _val(c, yr, 'ebitda') || _val(c, yr, 'operatingProfit') || _val(c, yr, 'ebit') || _val(c, yr, 'pbt'),
      titleStack: 'Revenue vs Operating Profit',
      titleShare: 'EBITDA Margin %',
      titlePie:   'EBITDA — Market Share',
      shareYAxis: '% of Revenue',
    });
  }

})();
