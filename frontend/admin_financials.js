/**
 * NSE Insights - Admin Financials Review Module
 * 3-panel layout: Left (companies), Middle (PDF viewer), Right (financial data)
 */

// ========================
// STATE MANAGEMENT
// ========================

let adminState = {
    selectedCompany: null,
    selectedCompanyData: null,
    selectedPeriod: 'annual',
    selectedTab: 'summary',
    reviewStatus: 'draft',
    reviewNotes: {},
    isDirty: false,
    pdfExpanded: true,
    companyPdfUrl: null
};

// ========================
// INITIALIZATION
// ========================

document.addEventListener('DOMContentLoaded', () => {
    initializeAdminFinancials();
});

function initializeAdminFinancials() {
    // Restore user tier from storage
    const savedTier = sessionStorage.getItem('userTier') || localStorage.getItem('userTier') || 'free';
    if (savedTier !== 'free') {
        setUserTier(savedTier, 'Ntigz');
    }

    // Check tier access
    if (!getTierAccess().canAccessAdmin()) {
        showAccessDenied();
        return;
    }

    // Populate company list
    populateCompanyList();

    // Set up event listeners
    setupEventListeners();

    // Initialize UI
    updateTierUI();

    console.log('Admin Financials module initialized');
}

// ========================
// COMPANY LIST POPULATION
// ========================

function populateCompanyList() {
    const list = document.getElementById('company-list');
    const tierAccess = getTierAccess();
    const accessibleCompanies = tierAccess.getAccessibleCompanies(
        Object.keys(NSE_COMPANIES).sort()
    );

    list.innerHTML = '';

    accessibleCompanies.forEach(ticker => {
        const company = NSE_COMPANIES[ticker];
        if (company) {
            // Check if this company has been reviewed (saved state)
            const reviewKey = `adminReview_${ticker}`;
            const saved = localStorage.getItem(reviewKey);
            const savedState = saved ? JSON.parse(saved) : null;
            const isApproved = savedState && savedState.status === 'approved';

            const item = document.createElement('div');
            item.className = 'company-item';
            item.dataset.ticker = ticker;
            item.onclick = () => selectCompany(ticker);

            const indicator = document.createElement('div');
            indicator.className = `status-indicator ${isApproved ? 'approved' : 'draft'}`;

            const name = document.createElement('div');
            name.className = 'company-item-name';
            name.textContent = `${ticker} - ${company.name}`;

            item.appendChild(indicator);
            item.appendChild(name);
            list.appendChild(item);
        }
    });
}

function selectCompany(ticker) {
    // Update selection styling
    document.querySelectorAll('.company-item').forEach(item => {
        item.classList.remove('selected');
    });
    document.querySelector(`[data-ticker="${ticker}"]`).classList.add('selected');

    adminState.selectedCompany = ticker;
    adminState.selectedCompanyData = NSE_COMPANIES[ticker];

    // Update header and load data
    updateCompanyHeader();
    loadFinancialData();
    loadCompanyReviewState();
    updatePdfViewer();

    // Show first tab
    switchTab('summary');
}

function updateCompanyHeader() {
    const company = adminState.selectedCompanyData;
    document.getElementById('company-name').textContent = company.name;
}

function updateStatusBadge() {
    const badge = document.getElementById('status-badge');
    const isApproved = adminState.reviewStatus === 'approved';

    badge.className = `status-badge ${isApproved ? 'approved' : 'draft'}`;
    badge.innerHTML = isApproved ? '✓ Approved' : '○ Draft';
}

// ========================
// PDF VIEWER
// ========================

function updatePdfViewer() {
    const pdfContainer = document.getElementById('pdf-container');
    const pdfNoSource = document.getElementById('pdf-no-source');
    const pdfEmpty = document.getElementById('pdf-empty');
    const pdfIframe = document.getElementById('pdf-iframe');
    const pdfOpenLink = document.getElementById('pdf-open-link');

    if (!adminState.selectedCompanyData) {
        pdfContainer.style.display = 'none';
        pdfNoSource.style.display = 'none';
        pdfEmpty.style.display = 'flex';
        return;
    }

    // For now, show "No source document" - in production, this would link to actual PDFs
    // You could add a pdf_url field to NSE_COMPANIES data
    pdfContainer.style.display = 'none';
    pdfNoSource.style.display = 'flex';
    pdfEmpty.style.display = 'none';
    pdfIframe.src = 'about:blank';
}

function togglePdfSection() {
    adminState.pdfExpanded = !adminState.pdfExpanded;
    document.getElementById('pdf-viewer-wrap').style.display = adminState.pdfExpanded ? 'block' : 'none';
    const arrow = document.getElementById('pdf-toggle-arrow');
    arrow.classList.toggle('collapsed', !adminState.pdfExpanded);
}

// ========================
// FINANCIAL DATA LOADING
// ========================

function loadFinancialData() {
    const company = adminState.selectedCompanyData;
    const period = adminState.selectedPeriod;

    let periodData = [];

    if (period === 'annual') {
        periodData = company.annuals || [];
    } else {
        periodData = company.quarterlies || [];
    }

    if (periodData.length === 0) {
        console.warn(`No ${period} data available for ${company.ticker}`);
        return;
    }

    // Populate tab content based on selected tab
    if (adminState.selectedTab === 'summary') {
        populateSummaryTab(periodData);
    } else if (adminState.selectedTab === 'income') {
        populateIncomeStatementTab(periodData);
    } else if (adminState.selectedTab === 'balance') {
        populateBalanceSheetTab(periodData);
    } else if (adminState.selectedTab === 'valuation') {
        populateValuationTab(periodData);
    } else if (adminState.selectedTab === 'notes') {
        populateNotesTab();
    }
}

// ========================
// TAB CONTENT POPULATION
// ========================

function populateSummaryTab(periodData) {
    const container = document.getElementById('tab-content');
    const latestYear = periodData[0];

    if (!latestYear) {
        container.innerHTML = '<p class="text-muted">No data available</p>';
        return;
    }

    const summaryMetrics = getSummaryMetrics(latestYear, periodData);

    let html = '<div class="summary-grid">';
    Object.entries(summaryMetrics).forEach(([label, value]) => {
        html += `
            <div class="summary-card">
                <div class="summary-label">${label}</div>
                <div class="summary-value">${value}</div>
            </div>
        `;
    });
    html += '</div>';

    container.innerHTML = html;
}

function getSummaryMetrics(current, allPeriods) {
    const previous = allPeriods[1] || null;

    const metrics = {
        'Revenue (KES)': current.revenue ? formatCurrency(current.revenue) : '—',
        'Net Profit (KES)': current.pat ? formatCurrency(current.pat) : '—',
        'EPS': current.eps ? formatNumber(current.eps, 2) : '—',
        'DPS': current.dps ? formatNumber(current.dps, 2) : '—',
        'Total Assets (KES)': current.totalAssets ? formatCurrency(current.totalAssets) : '—',
        'Total Equity (KES)': current.totalEquity ? formatCurrency(current.totalEquity) : '—',
    };

    if (current.sector === 'Banking' || current.nii) {
        metrics['Deposits (KES)'] = current.deposits ? formatCurrency(current.deposits) : '—';
        metrics['Loans (KES)'] = current.loans ? formatCurrency(current.loans) : '—';
    }

    return metrics;
}

function populateIncomeStatementTab(periodData) {
    const container = document.getElementById('tab-content');

    if (periodData.length === 0) {
        container.innerHTML = '<p class="text-muted">No income statement data available</p>';
        return;
    }

    let html = `
        <table class="financial-table">
            <thead>
                <tr>
                    <th>Metric</th>
                    ${periodData.slice(0, 3).map(p => `<th>${p.period}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="metric-label">Revenue</td>
                    ${periodData.slice(0, 3).map(p => `<td>${p.revenue ? formatCurrency(p.revenue) : '—'}</td>`).join('')}
                </tr>
                <tr>
                    <td class="metric-label">NII (Banking)</td>
                    ${periodData.slice(0, 3).map(p => `<td>${p.nii ? formatCurrency(p.nii) : '—'}</td>`).join('')}
                </tr>
                <tr>
                    <td class="metric-label">PBT</td>
                    ${periodData.slice(0, 3).map(p => `<td>${p.pbt ? formatCurrency(p.pbt) : '—'}</td>`).join('')}
                </tr>
                <tr>
                    <td class="metric-label">PAT</td>
                    ${periodData.slice(0, 3).map(p => `<td>${p.pat ? formatCurrency(p.pat) : '—'}</td>`).join('')}
                </tr>
                <tr>
                    <td class="metric-label">EPS</td>
                    ${periodData.slice(0, 3).map(p => `<td>${p.eps ? formatNumber(p.eps, 2) : '—'}</td>`).join('')}
                </tr>
                <tr>
                    <td class="metric-label">DPS</td>
                    ${periodData.slice(0, 3).map(p => `<td>${p.dps ? formatNumber(p.dps, 2) : '—'}</td>`).join('')}
                </tr>
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

function populateBalanceSheetTab(periodData) {
    const container = document.getElementById('tab-content');

    if (periodData.length === 0) {
        container.innerHTML = '<p class="text-muted">No balance sheet data available</p>';
        return;
    }

    let html = `
        <table class="financial-table">
            <thead>
                <tr>
                    <th>Metric</th>
                    ${periodData.slice(0, 3).map(p => `<th>${p.period}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="metric-label">Total Assets</td>
                    ${periodData.slice(0, 3).map(p => `<td>${p.totalAssets ? formatCurrency(p.totalAssets) : '—'}</td>`).join('')}
                </tr>
                <tr>
                    <td class="metric-label">Total Equity</td>
                    ${periodData.slice(0, 3).map(p => `<td>${p.totalEquity ? formatCurrency(p.totalEquity) : '—'}</td>`).join('')}
                </tr>
    `;

    // Add banking-specific fields if applicable
    if (periodData[0].deposits !== undefined) {
        html += `
                <tr>
                    <td class="metric-label">Deposits</td>
                    ${periodData.slice(0, 3).map(p => `<td>${p.deposits ? formatCurrency(p.deposits) : '—'}</td>`).join('')}
                </tr>
                <tr>
                    <td class="metric-label">Loans</td>
                    ${periodData.slice(0, 3).map(p => `<td>${p.loans ? formatCurrency(p.loans) : '—'}</td>`).join('')}
                </tr>
        `;
    }

    html += '</tbody></table>';

    container.innerHTML = html;
}

function populateValuationTab(periodData) {
    const container = document.getElementById('tab-content');

    if (periodData.length === 0) {
        container.innerHTML = '<p class="text-muted">No valuation data available</p>';
        return;
    }

    const current = periodData[0];

    let roe = '—';
    let roa = '—';

    // Calculate ROE
    if (current.totalEquity && current.pat) {
        roe = formatNumber((current.pat / current.totalEquity) * 100, 1) + '%';
    }

    // Calculate ROA
    if (current.totalAssets && current.pat) {
        roa = formatNumber((current.pat / current.totalAssets) * 100, 1) + '%';
    }

    let html = `
        <div class="valuation-grid">
            <div class="valuation-card">
                <div class="valuation-label">ROE</div>
                <div class="valuation-value">${roe}</div>
            </div>
            <div class="valuation-card">
                <div class="valuation-label">ROA</div>
                <div class="valuation-value">${roa}</div>
            </div>
            <div class="valuation-card">
                <div class="valuation-label">EPS</div>
                <div class="valuation-value">${current.eps ? formatNumber(current.eps, 2) : '—'}</div>
            </div>
            <div class="valuation-card">
                <div class="valuation-label">DPS</div>
                <div class="valuation-value">${current.dps ? formatNumber(current.dps, 2) : '—'}</div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

function populateNotesTab() {
    const container = document.getElementById('tab-content');
    const notes = adminState.reviewNotes[adminState.selectedCompany] || '';

    let html = `
        <div style="display: flex; flex-direction: column; gap: 8px; height: 100%;">
            <textarea
                id="review-notes-textarea"
                class="notes-textarea"
                placeholder="Add review notes here..."
            >${notes}</textarea>
            <div class="notes-hint">Review comments and observations about this company's financials</div>
        </div>
    `;

    container.innerHTML = html;

    // Add change listener
    const textarea = document.getElementById('review-notes-textarea');
    if (textarea) {
        textarea.addEventListener('change', (e) => {
            adminState.reviewNotes[adminState.selectedCompany] = e.target.value;
            adminState.isDirty = true;
        });
    }
}

// ========================
// TAB SWITCHING
// ========================

function switchTab(tabName) {
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update state and load content
    adminState.selectedTab = tabName;
    loadFinancialData();
}

// ========================
// PERIOD SWITCHING
// ========================

function setPeriod(period) {
    // Update active button
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-period="${period}"]`).classList.add('active');

    // Update state and reload data
    adminState.selectedPeriod = period;
    if (adminState.selectedCompany) {
        loadFinancialData();
    }
}

// ========================
// REVIEW ACTIONS
// ========================

function saveReview() {
    if (!adminState.selectedCompany) {
        showToast('Please select a company first');
        return;
    }

    // Save review state to localStorage
    saveReviewState();

    adminState.isDirty = false;
    showToast('Review saved successfully');
}

function approveReview() {
    if (!adminState.selectedCompany) {
        showToast('Please select a company first');
        return;
    }

    adminState.reviewStatus = 'approved';
    updateStatusBadge();
    saveReviewState();

    // Update the status indicator in the company list
    const item = document.querySelector(`[data-ticker="${adminState.selectedCompany}"]`);
    if (item) {
        const indicator = item.querySelector('.status-indicator');
        indicator.classList.remove('draft');
        indicator.classList.add('approved');
    }

    showToast('Company financials approved ✓');
}

// ========================
// STATE PERSISTENCE
// ========================

function saveReviewState() {
    const key = `adminReview_${adminState.selectedCompany}`;
    const state = {
        status: adminState.reviewStatus,
        notes: adminState.reviewNotes[adminState.selectedCompany] || '',
        timestamp: new Date().toISOString()
    };

    localStorage.setItem(key, JSON.stringify(state));
}

function loadCompanyReviewState() {
    if (!adminState.selectedCompany) return;

    const key = `adminReview_${adminState.selectedCompany}`;
    const saved = localStorage.getItem(key);

    if (saved) {
        const state = JSON.parse(saved);
        adminState.reviewStatus = state.status || 'draft';
        adminState.reviewNotes[adminState.selectedCompany] = state.notes || '';
        updateStatusBadge();
    } else {
        adminState.reviewStatus = 'draft';
        adminState.reviewNotes[adminState.selectedCompany] = '';
        updateStatusBadge();
    }
}

// ========================
// EVENT LISTENERS
// ========================

function setupEventListeners() {
    // Period toggle
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            setPeriod(e.target.dataset.period);
        });
    });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(e.target.dataset.tab);
        });
    });

    // Tier change events
    window.addEventListener('tierChanged', (e) => {
        if (!getTierAccess().canAccessAdmin()) {
            showAccessDenied();
        } else {
            populateCompanyList();
        }
    });
}

// ========================
// UI HELPERS
// ========================

function updateTierUI() {
    const tierAccess = getTierAccess();
    const tier = tierAccess.userTier;

    // Update tier badge
    const badge = document.getElementById('tier-badge');
    if (badge) {
        badge.textContent = tierAccess.getTierInfo().name;
        badge.className = `tier-badge tier-${tier}`;
    }
}

function showAccessDenied() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; gap: 16px;">
            <div style="font-size: 40px;">🔒</div>
            <h2 style="font-size: 20px; font-weight: 700;">Access Denied</h2>
            <p style="color: #888;">You must be on the Professional tier to access the admin console.</p>
            <a href="tier-upgrade.html" style="color: #c9a961; text-decoration: none;">Upgrade Now →</a>
        </div>
    `;
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);

    // Animate out after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========================
// UTILITY FUNCTIONS
// ========================

function formatCurrency(value) {
    if (!value && value !== 0) return '—';

    // Value is in thousands
    const inMillions = value / 1000;

    if (Math.abs(inMillions) >= 1000) {
        return (inMillions / 1000).toFixed(2) + 'B';
    }
    return inMillions.toFixed(2) + 'M';
}

function formatNumber(value, decimals = 0) {
    if (!value && value !== 0) return '—';
    return parseFloat(value).toFixed(decimals);
}
