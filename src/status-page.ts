// ABOUTME: HTML status page generator for county processing visualization
// ABOUTME: Creates interactive UI showing all counties organized by state with completion status

import type { Database } from "./database";
import { getAllCounties } from "./counties";

interface CountyWithStatus {
  name: string;
  geoid: string;
  state: string;
  searched: boolean;
  resultCount?: number;
}

export async function generateStatusPage(db: Database): Promise<string> {
  const allCounties = await getAllCounties();

  // Get all searched counties
  const searchedCountiesResult = await db<Array<{ county_geoid: string; county_name: string; state: string; result_count: number }>>`
    SELECT county_geoid, county_name, state, result_count
    FROM county_searches
  `;

  const searchedMap = new Map(
    searchedCountiesResult.map(c => [c.county_geoid, { resultCount: c.result_count }])
  );

  // Organize counties by state
  const countyByState: Record<string, CountyWithStatus[]> = {};

  for (const county of allCounties) {
    if (!countyByState[county.state]) {
      countyByState[county.state] = [];
    }

    const searchData = searchedMap.get(county.geoid);
    countyByState[county.state].push({
      name: county.name,
      geoid: county.geoid,
      state: county.state,
      searched: !!searchData,
      resultCount: searchData?.resultCount,
    });
  }

  // Calculate stats
  const totalCounties = allCounties.length;
  const totalSearched = searchedCountiesResult.length;
  const totalPending = totalCounties - totalSearched;
  const percentComplete = ((totalSearched / totalCounties) * 100).toFixed(1);

  // Sort states alphabetically
  const sortedStates = Object.keys(countyByState).sort();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pantry Search - County Processing Status</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f5f5f5;
      padding: 20px;
      line-height: 1.6;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    h1 {
      color: #2c3e50;
      margin-bottom: 10px;
      font-size: 28px;
    }

    .subtitle {
      color: #7f8c8d;
      margin-bottom: 30px;
      font-size: 14px;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .stat-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .stat-card.completed {
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
    }

    .stat-card.pending {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    }

    .stat-label {
      font-size: 14px;
      opacity: 0.9;
      margin-bottom: 8px;
    }

    .stat-value {
      font-size: 32px;
      font-weight: bold;
    }

    .progress-bar {
      background: #ecf0f1;
      height: 30px;
      border-radius: 15px;
      overflow: hidden;
      margin-bottom: 30px;
    }

    .progress-fill {
      background: linear-gradient(90deg, #11998e 0%, #38ef7d 100%);
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 14px;
      transition: width 0.3s ease;
    }

    .state-section {
      margin-bottom: 30px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
    }

    .state-header {
      background: #34495e;
      color: white;
      padding: 15px 20px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
    }

    .state-header:hover {
      background: #2c3e50;
    }

    .state-name {
      font-weight: bold;
      font-size: 18px;
    }

    .state-stats {
      font-size: 14px;
      opacity: 0.9;
    }

    .counties-list {
      display: none;
      padding: 20px;
      background: #fafafa;
    }

    .counties-list.expanded {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 10px;
    }

    .county-item {
      padding: 12px 15px;
      background: white;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      transition: transform 0.2s, box-shadow 0.2s;
      cursor: pointer;
    }

    .county-item:hover {
      transform: translateY(-2px);
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }

    .county-item.pending {
      opacity: 0.8;
    }

    .county-item.pending:hover {
      opacity: 1;
    }

    .county-name {
      flex: 1;
      font-size: 14px;
      color: #2c3e50;
    }

    .county-status {
      margin-left: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-icon {
      font-size: 18px;
    }

    .result-count {
      font-size: 12px;
      color: #7f8c8d;
      background: #ecf0f1;
      padding: 3px 8px;
      border-radius: 10px;
    }

    .toggle-arrow {
      transition: transform 0.3s;
    }

    .toggle-arrow.expanded {
      transform: rotate(180deg);
    }

    .search-box {
      margin-bottom: 20px;
      padding: 12px;
      width: 100%;
      border: 2px solid #e0e0e0;
      border-radius: 6px;
      font-size: 16px;
    }

    .search-box:focus {
      outline: none;
      border-color: #667eea;
    }

    .sidebar {
      position: fixed;
      top: 0;
      right: -600px;
      width: 600px;
      height: 100vh;
      background: white;
      box-shadow: -2px 0 10px rgba(0,0,0,0.1);
      transition: right 0.3s ease;
      z-index: 1000;
      overflow-y: auto;
    }

    .sidebar.open {
      right: 0;
    }

    .sidebar-header {
      padding: 20px;
      background: #34495e;
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .sidebar-title {
      font-size: 18px;
      font-weight: bold;
    }

    .close-btn {
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .close-btn:hover {
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
    }

    .sidebar-content {
      padding: 20px;
    }

    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      color: #7f8c8d;
    }

    .spinner {
      border: 3px solid #f3f3f3;
      border-top: 3px solid #667eea;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin-bottom: 20px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .result-item {
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .result-name {
      font-weight: bold;
      font-size: 16px;
      color: #2c3e50;
      margin-bottom: 8px;
    }

    .result-address {
      color: #7f8c8d;
      font-size: 14px;
      margin-bottom: 8px;
    }

    .result-details {
      font-size: 14px;
      color: #34495e;
      margin-top: 8px;
    }

    .result-detail-item {
      margin: 4px 0;
    }

    .result-type {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
      margin-bottom: 8px;
    }

    .result-type.pantry {
      background: #e8f5e9;
      color: #2e7d32;
    }

    .result-type.bank {
      background: #e3f2fd;
      color: #1565c0;
    }

    .result-type.mixed {
      background: #fff3e0;
      color: #e65100;
    }

    .no-results {
      text-align: center;
      padding: 40px 20px;
      color: #7f8c8d;
    }

    .overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 999;
      display: none;
    }

    .overlay.visible {
      display: block;
    }
  </style>
</head>
<body>
  <div class="overlay" id="overlay" onclick="closeSidebar()"></div>
  <div class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-title" id="sidebarTitle">Loading...</div>
      <button class="close-btn" onclick="closeSidebar()">×</button>
    </div>
    <div class="sidebar-content" id="sidebarContent">
      <div class="loading">
        <div class="spinner"></div>
        <div>Searching for food resources...</div>
      </div>
    </div>
  </div>
  <div class="container">
    <h1>🏪 Pantry Search - County Processing Status</h1>
    <p class="subtitle">Tracking food pantry and food bank searches across all ${totalCounties.toLocaleString()} US counties</p>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-label">Total Counties</div>
        <div class="stat-value">${totalCounties.toLocaleString()}</div>
      </div>
      <div class="stat-card completed">
        <div class="stat-label">Completed</div>
        <div class="stat-value">${totalSearched.toLocaleString()}</div>
      </div>
      <div class="stat-card pending">
        <div class="stat-label">Pending</div>
        <div class="stat-value">${totalPending.toLocaleString()}</div>
      </div>
    </div>

    <div class="progress-bar">
      <div class="progress-fill" style="width: ${percentComplete}%">
        ${percentComplete}% Complete
      </div>
    </div>

    <input type="text" class="search-box" id="searchBox" placeholder="Search for a county or state...">

    <div id="statesList">
      ${sortedStates.map(state => {
        const counties = countyByState[state];
        const searchedCount = counties.filter(c => c.searched).length;
        const pendingCount = counties.length - searchedCount;
        const statePercent = ((searchedCount / counties.length) * 100).toFixed(0);

        return `
          <div class="state-section" data-state="${state}">
            <div class="state-header" onclick="toggleState('${state}')">
              <div>
                <div class="state-name">${state}</div>
                <div class="state-stats">${searchedCount} / ${counties.length} counties (${statePercent}%)</div>
              </div>
              <span class="toggle-arrow" id="arrow-${state}">▼</span>
            </div>
            <div class="counties-list" id="counties-${state}">
              ${counties.map(county => `
                <div class="county-item ${county.searched ? 'searched' : 'pending'}"
                     onclick="viewCounty('${encodeURIComponent(county.name)}', '${state}')">
                  <span class="county-name">${county.name}</span>
                  <div class="county-status">
                    ${county.searched
                      ? `<span class="result-count">${county.resultCount || 0} results</span><span class="status-icon">✅</span>`
                      : `<span class="status-icon">⏳</span>`
                    }
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  </div>

  <script>
    let isLoadingCounty = false;

    function toggleState(state) {
      const list = document.getElementById('counties-' + state);
      const arrow = document.getElementById('arrow-' + state);
      list.classList.toggle('expanded');
      arrow.classList.toggle('expanded');
    }

    function closeSidebar() {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('overlay').classList.remove('visible');
    }

    async function viewCounty(countyName, state) {
      if (isLoadingCounty) return; // Prevent multiple clicks

      isLoadingCounty = true;
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('overlay');
      const sidebarTitle = document.getElementById('sidebarTitle');
      const sidebarContent = document.getElementById('sidebarContent');

      // Show sidebar with loading state
      sidebarTitle.textContent = decodeURIComponent(countyName) + ', ' + state;
      sidebarContent.innerHTML = \`
        <div class="loading">
          <div class="spinner"></div>
          <div>Searching for food resources...</div>
        </div>
      \`;
      sidebar.classList.add('open');
      overlay.classList.add('visible');

      try {
        const response = await fetch('/search-county?county=' + countyName + '&state=' + state);
        const data = await response.json();

        // Combine all results
        const allResults = [
          ...(data.pantries || []),
          ...(data.banks || []),
          ...(data.mixed || [])
        ];

        if (allResults.length === 0) {
          sidebarContent.innerHTML = \`
            <div class="no-results">
              <h3>No Results Found</h3>
              <p>No food pantries or banks were found in \${decodeURIComponent(countyName)}, \${state}.</p>
            </div>
          \`;
        } else {
          sidebarContent.innerHTML = allResults.map(result => \`
            <div class="result-item">
              <div class="result-type \${result.type}">\${result.type.toUpperCase()}</div>
              <div class="result-name">\${result.name}</div>
              <div class="result-address">
                \${result.address || 'Address not available'}<br>
                \${result.city || ''}\${result.city && result.state ? ', ' : ''}\${result.state || ''} \${result.zip_code || ''}
              </div>
              <div class="result-details">
                \${result.phone ? \`<div class="result-detail-item">📞 \${result.phone}</div>\` : ''}
                \${result.hours ? \`<div class="result-detail-item">🕐 \${result.hours}</div>\` : ''}
                \${result.notes ? \`<div class="result-detail-item">📝 \${result.notes}</div>\` : ''}
                \${result.source_url ? \`<div class="result-detail-item">🔗 <a href="\${result.source_url}" target="_blank">Website</a></div>\` : ''}
              </div>
            </div>
          \`).join('');
        }
      } catch (error) {
        sidebarContent.innerHTML = \`
          <div class="no-results">
            <h3>Error</h3>
            <p>Failed to load results. Please try again.</p>
          </div>
        \`;
      } finally {
        isLoadingCounty = false;
      }
    }

    // Search functionality
    const searchBox = document.getElementById('searchBox');
    searchBox.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const sections = document.querySelectorAll('.state-section');

      sections.forEach(section => {
        const state = section.dataset.state.toLowerCase();
        const counties = section.querySelectorAll('.county-item');
        let hasVisibleCounty = false;

        counties.forEach(county => {
          const countyName = county.querySelector('.county-name').textContent.toLowerCase();
          if (countyName.includes(query) || state.includes(query)) {
            county.style.display = 'flex';
            hasVisibleCounty = true;
          } else {
            county.style.display = 'none';
          }
        });

        if (hasVisibleCounty || state.includes(query)) {
          section.style.display = 'block';
          if (query && hasVisibleCounty) {
            const list = document.getElementById('counties-' + section.dataset.state);
            const arrow = document.getElementById('arrow-' + section.dataset.state);
            list.classList.add('expanded');
            arrow.classList.add('expanded');
          }
        } else {
          section.style.display = 'none';
        }
      });
    });
  </script>
</body>
</html>`;
}
