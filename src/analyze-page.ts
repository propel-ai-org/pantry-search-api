// ABOUTME: HTML page generator for false positive analysis and management
// ABOUTME: Creates interactive UI for filtering, analyzing, and taking actions on suspicious resources

import type { Database } from "./database";

export async function generateAnalyzePage(db: Database): Promise<string> {
  // Get unique states for filter dropdown (only valid 2-letter state codes)
  const states = await db<Array<{ state: string }>>`
    SELECT DISTINCT state
    FROM resources
    WHERE state IS NOT NULL
      AND LENGTH(state) = 2
      AND state ~ '^[A-Z]{2}$'
    ORDER BY state
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Analyze Resources - False Positive Detection</title>
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
      max-width: 1600px;
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

    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 8px;
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .filter-group label {
      font-size: 12px;
      font-weight: 600;
      color: #34495e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .filter-group select,
    .filter-group input {
      padding: 10px;
      border: 2px solid #e0e0e0;
      border-radius: 6px;
      font-size: 14px;
      background: white;
    }

    .filter-group select:focus,
    .filter-group input:focus {
      outline: none;
      border-color: #667eea;
    }

    .filter-actions {
      display: flex;
      gap: 10px;
      align-items: flex-end;
    }

    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .btn-secondary {
      background: #ecf0f1;
      color: #34495e;
    }

    .btn-secondary:hover {
      background: #d5dbdc;
    }

    .btn-danger {
      background: #e74c3c;
      color: white;
      padding: 6px 12px;
      font-size: 12px;
    }

    .btn-danger:hover {
      background: #c0392b;
    }

    .btn-success {
      background: #27ae60;
      color: white;
      padding: 6px 12px;
      font-size: 12px;
    }

    .btn-success:hover {
      background: #229954;
    }

    .btn-warning {
      background: #f39c12;
      color: white;
      padding: 6px 12px;
      font-size: 12px;
    }

    .btn-warning:hover {
      background: #e67e22;
    }

    .btn-info {
      background: #3498db;
      color: white;
      padding: 6px 12px;
      font-size: 12px;
    }

    .btn-info:hover {
      background: #2980b9;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }

    .summary {
      margin-bottom: 20px;
      padding: 20px;
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      border-radius: 4px;
    }

    .summary-title {
      font-weight: bold;
      margin-bottom: 10px;
      color: #856404;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
    }

    .summary-item {
      background: white;
      padding: 12px;
      border-radius: 6px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .summary-category {
      font-size: 12px;
      color: #7f8c8d;
      margin-bottom: 4px;
    }

    .summary-count {
      font-size: 24px;
      font-weight: bold;
      color: #2c3e50;
    }

    .results-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }

    .results-table th {
      background: #34495e;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .results-table td {
      padding: 12px;
      border-bottom: 1px solid #ecf0f1;
      font-size: 14px;
    }

    .results-table tr:hover {
      background: #f8f9fa;
    }

    .resource-name {
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 4px;
    }

    .resource-address {
      font-size: 12px;
      color: #7f8c8d;
    }

    .suspicion-score {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 12px;
    }

    .suspicion-high {
      background: #fee;
      color: #c0392b;
    }

    .suspicion-medium {
      background: #fff3cd;
      color: #856404;
    }

    .suspicion-low {
      background: #d4edda;
      color: #155724;
    }

    .category-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .category-directory_page {
      background: #e8daef;
      color: #6c3483;
    }

    .category-financial_bank {
      background: #fadbd8;
      color: #922b21;
    }

    .category-wrong_bank_type {
      background: #f5b7b1;
      color: #78281f;
    }

    .category-government_office {
      background: #d6eaf8;
      color: #1b4f72;
    }

    .category-community_center {
      background: #d5f4e6;
      color: #0e6655;
    }

    .category-school {
      background: #fdebd0;
      color: #935116;
    }

    .reasons-list {
      margin-top: 8px;
      padding-left: 20px;
      font-size: 12px;
      color: #7f8c8d;
    }

    .reasons-list li {
      margin-bottom: 4px;
    }

    .action-buttons {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .loading {
      text-align: center;
      padding: 60px 20px;
      color: #7f8c8d;
    }

    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .no-results {
      text-align: center;
      padding: 60px 20px;
      color: #7f8c8d;
    }

    .no-results h3 {
      margin-bottom: 10px;
      color: #34495e;
    }

    .toast {
      position: fixed;
      bottom: 30px;
      right: 30px;
      background: white;
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: none;
      z-index: 1000;
      max-width: 400px;
    }

    .toast.show {
      display: block;
      animation: slideIn 0.3s ease;
    }

    .toast.success {
      border-left: 4px solid #27ae60;
    }

    .toast.error {
      border-left: 4px solid #e74c3c;
    }

    .toast.info {
      border-left: 4px solid #3498db;
    }

    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    .modal {
      display: none;
      position: fixed;
      z-index: 2000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.5);
      animation: fadeIn 0.2s ease;
    }

    .modal.show {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .modal-content {
      background: white;
      padding: 30px;
      border-radius: 12px;
      max-width: 600px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      animation: slideUp 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from {
        transform: translateY(50px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .modal-header {
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #ecf0f1;
    }

    .modal-header h2 {
      margin: 0;
      color: #2c3e50;
      font-size: 24px;
    }

    .modal-body {
      margin-bottom: 20px;
    }

    .validation-progress {
      margin: 20px 0;
    }

    .progress-bar {
      width: 100%;
      height: 10px;
      background: #ecf0f1;
      border-radius: 5px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      transition: width 0.3s ease;
    }

    .progress-text {
      margin-top: 10px;
      font-size: 14px;
      color: #7f8c8d;
      text-align: center;
    }

    .validation-results {
      max-height: 400px;
      overflow-y: auto;
      margin-top: 20px;
    }

    .validation-item {
      padding: 12px;
      margin-bottom: 8px;
      border-radius: 6px;
      border-left: 4px solid #ecf0f1;
    }

    .validation-item.valid {
      background: #d4edda;
      border-left-color: #28a745;
    }

    .validation-item.invalid {
      background: #f8d7da;
      border-left-color: #dc3545;
    }

    .validation-item.pending {
      background: #fff3cd;
      border-left-color: #ffc107;
    }

    .validation-item-name {
      font-weight: 600;
      margin-bottom: 4px;
      color: #2c3e50;
    }

    .validation-item-reason {
      font-size: 12px;
      color: #6c757d;
    }

    .bulk-actions-bar {
      margin-bottom: 20px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
      display: none;
      align-items: center;
      gap: 15px;
    }

    .bulk-actions-bar.show {
      display: flex;
    }

    .checkbox-cell {
      width: 40px;
      text-align: center;
    }

    .checkbox-cell input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .toast-title {
      font-weight: bold;
      margin-bottom: 4px;
    }

    .toast-message {
      font-size: 14px;
      color: #7f8c8d;
    }
  </style>
</head>
<body>
  <div class="toast" id="toast">
    <div class="toast-title" id="toastTitle">Success</div>
    <div class="toast-message" id="toastMessage">Operation completed</div>
  </div>

  <div class="container">
    <h1>🔍 Analyze Resources - False Positive Detection</h1>
    <p class="subtitle">Identify and manage suspicious food resource listings</p>

    <div class="filters">
      <div class="filter-group">
        <label>State</label>
        <select id="stateFilter">
          <option value="">All States</option>
          ${states.map(s => `<option value="${s.state}">${s.state}</option>`).join('')}
        </select>
      </div>

      <div class="filter-group">
        <label>Type</label>
        <select id="typeFilter">
          <option value="">All Types</option>
          <option value="pantry">Pantry</option>
          <option value="bank">Bank</option>
          <option value="mixed">Mixed</option>
        </select>
      </div>

      <div class="filter-group">
        <label>Category</label>
        <select id="categoryFilter">
          <option value="">All Categories</option>
          <option value="directory_page">Directory Page</option>
          <option value="financial_bank">Financial Bank</option>
          <option value="wrong_bank_type">Wrong Bank Type</option>
          <option value="government_office">Government Office</option>
          <option value="community_center">Community Center</option>
          <option value="school">School</option>
          <option value="missing_verification">Missing Verification</option>
          <option value="generic_listing">Generic Listing</option>
        </select>
      </div>

      <div class="filter-group">
        <label>Min Suspicion Score (0-100)</label>
        <input type="number" id="minSuspicionFilter" value="50" min="0" max="100">
      </div>

      <div class="filter-group">
        <label>Exportable Status</label>
        <select id="exportableFilter">
          <option value="">All</option>
          <option value="true">Exportable</option>
          <option value="false" selected>Not Exportable</option>
        </select>
      </div>

      <div class="filter-group">
        <label>Limit</label>
        <input type="number" id="limitFilter" value="100" min="1" max="500">
      </div>

      <div class="filter-actions">
        <button class="btn btn-primary" onclick="loadResults()">Analyze</button>
        <button class="btn btn-secondary" onclick="resetFilters()">Reset</button>
      </div>
    </div>

    <div id="summarySection"></div>

    <div id="bulkActionsBar" class="bulk-actions-bar">
      <span id="selectedCount" style="font-weight: 600; color: #2c3e50;">0 selected</span>
      <button class="btn btn-info" onclick="validateSelected()">Validate Selected</button>
      <button class="btn btn-secondary" onclick="clearSelection()">Clear Selection</button>
    </div>

    <div id="resultsSection">
      <div class="no-results">
        <h3>No Analysis Yet</h3>
        <p>Configure filters above and click "Analyze" to scan for false positives.</p>
      </div>
    </div>
  </div>

  <div id="validationModal" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <h2>URL Validation</h2>
      </div>
      <div class="modal-body">
        <div class="validation-progress">
          <div class="progress-bar">
            <div id="progressFill" class="progress-fill" style="width: 0%"></div>
          </div>
          <div id="progressText" class="progress-text">Preparing validation...</div>
        </div>
        <div id="validationResults" class="validation-results"></div>
      </div>
      <div style="text-align: right;">
        <button class="btn btn-secondary" onclick="closeValidationModal()">Close</button>
      </div>
    </div>
  </div>

  <script>
    let isLoading = false;

    function showToast(title, message, type = 'success') {
      const toast = document.getElementById('toast');
      const toastTitle = document.getElementById('toastTitle');
      const toastMessage = document.getElementById('toastMessage');

      toast.className = 'toast show ' + type;
      toastTitle.textContent = title;
      toastMessage.textContent = message;

      setTimeout(() => {
        toast.classList.remove('show');
      }, 5000);
    }

    function resetFilters() {
      document.getElementById('stateFilter').value = '';
      document.getElementById('typeFilter').value = '';
      document.getElementById('categoryFilter').value = '';
      document.getElementById('minSuspicionFilter').value = '50';
      document.getElementById('exportableFilter').value = 'false';
      document.getElementById('limitFilter').value = '100';
    }

    async function loadResults() {
      if (isLoading) return;

      isLoading = true;
      const resultsSection = document.getElementById('resultsSection');
      const summarySection = document.getElementById('summarySection');

      // Show loading state
      resultsSection.innerHTML = \`
        <div class="loading">
          <div class="spinner"></div>
          <div>Analyzing resources...</div>
        </div>
      \`;

      summarySection.innerHTML = '';

      try {
        // Build query params
        const params = new URLSearchParams();
        const state = document.getElementById('stateFilter').value;
        const type = document.getElementById('typeFilter').value;
        const category = document.getElementById('categoryFilter').value;
        const minSuspicion = document.getElementById('minSuspicionFilter').value;
        const exportable = document.getElementById('exportableFilter').value;
        const limit = document.getElementById('limitFilter').value;

        if (state) params.append('state', state);
        if (type) params.append('type', type);
        if (category) params.append('category', category);
        if (minSuspicion) params.append('min_suspicion', minSuspicion);
        if (exportable) params.append('exportable', exportable);
        if (limit) params.append('limit', limit);

        const response = await fetch('/analyze-resources?' + params.toString());
        const data = await response.json();

        // Show summary
        if (data.summary && data.summary.length > 0) {
          summarySection.innerHTML = \`
            <div class="summary">
              <div class="summary-title">Analysis Summary</div>
              <div>Total analyzed: <strong>\${data.total_analyzed.toLocaleString()}</strong> resources |
                  Suspicious: <strong>\${data.suspicious_count.toLocaleString()}</strong> (\${((data.suspicious_count/data.total_analyzed)*100).toFixed(1)}%)</div>
              <div class="summary-grid" style="margin-top: 15px;">
                \${data.summary.map(item => \`
                  <div class="summary-item">
                    <div class="summary-category">\${formatCategory(item.category)}</div>
                    <div class="summary-count">\${item.count}</div>
                    <div style="font-size: 12px; color: #7f8c8d;">Avg: \${item.avg_suspicion.toFixed(0)}%</div>
                  </div>
                \`).join('')}
              </div>
            </div>
          \`;
        }

        // Show results table
        if (data.resources && data.resources.length > 0) {
          resultsSection.innerHTML = \`
            <table class="results-table">
              <thead>
                <tr>
                  <th class="checkbox-cell">
                    <input type="checkbox" id="selectAll" onchange="toggleSelectAll(this.checked)">
                  </th>
                  <th>Resource</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Score</th>
                  <th>Reasons</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                \${data.resources.map(resource => \`
                  <tr>
                    <td class="checkbox-cell">
                      <input type="checkbox" class="resource-checkbox" value="\${resource.id}" onchange="updateSelection()">
                    </td>
                    <td>
                      <div class="resource-name">\${escapeHtml(resource.name)}</div>
                      <div class="resource-address">\${escapeHtml(resource.address || '')}</div>
                      <div class="resource-address">\${escapeHtml(resource.city || '')}\${resource.city && resource.state ? ', ' : ''}\${escapeHtml(resource.state || '')}</div>
                      \${resource.source_url ? \`<div class="resource-address" style="margin-top: 4px;"><a href="\${escapeHtml(resource.source_url)}" target="_blank" rel="noopener noreferrer" style="color: #3498db; text-decoration: none;">🔗 View Source</a></div>\` : ''}
                    </td>
                    <td>\${escapeHtml(resource.type)}</td>
                    <td>
                      <span class="category-badge category-\${resource.suspicion.category}">
                        \${formatCategory(resource.suspicion.category)}
                      </span>
                    </td>
                    <td>
                      <span class="suspicion-score \${getSuspicionClass(resource.suspicion.score)}">
                        \${resource.suspicion.score}
                      </span>
                    </td>
                    <td>
                      <ul class="reasons-list">
                        \${resource.suspicion.reasons.map(r => \`<li>\${escapeHtml(r)}</li>\`).join('')}
                      </ul>
                    </td>
                    <td>
                      <div class="action-buttons">
                        \${getActionButtons(resource)}
                      </div>
                    </td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          \`;
        } else {
          resultsSection.innerHTML = \`
            <div class="no-results">
              <h3>No Suspicious Resources Found</h3>
              <p>No resources matched your filter criteria. Try adjusting the filters.</p>
            </div>
          \`;
        }
      } catch (error) {
        resultsSection.innerHTML = \`
          <div class="no-results">
            <h3>Error</h3>
            <p>Failed to analyze resources: \${error.message}</p>
          </div>
        \`;
        showToast('Error', 'Failed to analyze resources', 'error');
      } finally {
        isLoading = false;
      }
    }

    function formatCategory(category) {
      return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    function getSuspicionClass(score) {
      if (score >= 70) return 'suspicion-high';
      if (score >= 40) return 'suspicion-medium';
      return 'suspicion-low';
    }

    function getActionButtons(resource) {
      const buttons = [];

      // Show "Mark as Exportable" if not already exportable
      if (!resource.exportable) {
        buttons.push(\`<button class="btn btn-success" onclick="markExportable(\${resource.id})" title="Mark as ready for export">✓ Mark Exportable</button>\`);
      }

      // Always show expand directory option - user can manually identify directory pages
      buttons.push(\`<button class="btn btn-success" onclick="expandDirectory(\${resource.id})" title="Extract multiple food banks from this page">Expand as Directory</button>\`);
      buttons.push(\`<button class="btn btn-info" onclick="editUrl(\${resource.id}, '\${escapeHtml(resource.source_url || '')}')">Edit URL</button>\`);
      buttons.push(\`<button class="btn btn-warning" onclick="validateResource(\${resource.id})">AI Validate</button>\`);
      buttons.push(\`<button class="btn btn-info" onclick="reEnrichResource(\${resource.id})">Re-enrich</button>\`);
      buttons.push(\`<button class="btn btn-danger" onclick="deleteResource(\${resource.id})">Delete</button>\`);

      return buttons.join('');
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text || '';
      return div.innerHTML;
    }

    async function expandDirectory(resourceId) {
      if (!confirm('This will expand the directory into multiple individual food bank entries. Continue?')) {
        return;
      }

      const btn = event.target;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Expanding...';

      try {
        const response = await fetch('/expand-directory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resource_ids: [resourceId] })
        });

        const result = await response.json();

        if (result.expanded_count > 0) {
          showToast('Success!', \`Expanded into \${result.new_resources.length} food bank locations!\`, 'success');
          loadResults();
        } else if (result.failed && result.failed.length > 0) {
          showToast('Error', result.failed[0].reason || 'Failed to expand directory', 'error');
          btn.disabled = false;
          btn.textContent = originalText;
        }
      } catch (error) {
        showToast('Error', 'Failed to expand directory: ' + error.message, 'error');
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }

    async function validateResource(resourceId) {
      const btn = event.target;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Validating...';

      try {
        const response = await fetch('/bulk-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'validate', resource_ids: [resourceId] })
        });

        const result = await response.json();

        if (result.validated_count > 0) {
          const validation = result.results[0].validation;
          showToast(
            validation.is_food_resource ? 'Legitimate Resource' : 'False Positive',
            \`\${validation.reasoning} (Confidence: \${validation.confidence}%)\`,
            validation.is_food_resource ? 'success' : 'error'
          );
          loadResults();
        } else {
          showToast('Error', 'Validation failed', 'error');
          btn.disabled = false;
          btn.textContent = originalText;
        }
      } catch (error) {
        showToast('Error', 'Failed to validate: ' + error.message, 'error');
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }

    async function reEnrichResource(resourceId) {
      const btn = event.target;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Enriching...';

      try {
        const response = await fetch('/bulk-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 're-enrich', resource_ids: [resourceId] })
        });

        const result = await response.json();

        if (result.enriched_count > 0) {
          showToast('Success!', 'Resource re-enriched with fresh data', 'success');
          loadResults();
        } else if (result.failed && result.failed.length > 0) {
          showToast('Warning', result.failed[0].reason || 'Enrichment failed', 'error');
          btn.disabled = false;
          btn.textContent = originalText;
        }
      } catch (error) {
        showToast('Error', 'Failed to re-enrich: ' + error.message, 'error');
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }

    async function markExportable(resourceId) {
      try {
        const response = await fetch('/mark-exportable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resource_id: resourceId })
        });

        const result = await response.json();

        if (result.success) {
          showToast('Success', 'Resource marked as exportable', 'success');
          loadResults();
        } else {
          showToast('Error', result.error || 'Failed to mark as exportable', 'error');
        }
      } catch (error) {
        showToast('Error', 'Failed to mark as exportable: ' + error.message, 'error');
      }
    }

    async function editUrl(resourceId, currentUrl) {
      const newUrl = prompt('Enter the new source URL:', currentUrl);

      if (newUrl === null || newUrl === currentUrl) {
        return; // User cancelled or didn't change anything
      }

      try {
        const response = await fetch('/update-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resource_id: resourceId, source_url: newUrl })
        });

        const result = await response.json();

        if (result.success) {
          showToast('Updated', 'Source URL updated successfully', 'success');
          loadResults();
        } else {
          showToast('Error', result.error || 'Failed to update URL', 'error');
        }
      } catch (error) {
        showToast('Error', 'Failed to update URL: ' + error.message, 'error');
      }
    }

    async function deleteResource(resourceId) {
      if (!confirm('Are you sure you want to delete this resource? This cannot be undone.')) {
        return;
      }

      const btn = event.target;
      btn.disabled = true;

      try {
        const response = await fetch('/bulk-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', resource_ids: [resourceId] })
        });

        const result = await response.json();

        if (result.deleted_count > 0) {
          showToast('Deleted', 'Resource deleted successfully', 'success');
          loadResults();
        } else {
          showToast('Error', 'Failed to delete resource', 'error');
          btn.disabled = false;
        }
      } catch (error) {
        showToast('Error', 'Failed to delete: ' + error.message, 'error');
        btn.disabled = false;
      }
    }

    function updateSelection() {
      const checkboxes = document.querySelectorAll('.resource-checkbox');
      const checked = Array.from(checkboxes).filter(cb => cb.checked);
      const count = checked.length;

      document.getElementById('selectedCount').textContent = \`\${count} selected\`;

      const bulkBar = document.getElementById('bulkActionsBar');
      if (count > 0) {
        bulkBar.classList.add('show');
      } else {
        bulkBar.classList.remove('show');
      }

      const selectAll = document.getElementById('selectAll');
      if (selectAll) {
        selectAll.checked = count === checkboxes.length && count > 0;
      }
    }

    function toggleSelectAll(checked) {
      const checkboxes = document.querySelectorAll('.resource-checkbox');
      checkboxes.forEach(cb => cb.checked = checked);
      updateSelection();
    }

    function clearSelection() {
      const checkboxes = document.querySelectorAll('.resource-checkbox');
      checkboxes.forEach(cb => cb.checked = false);
      updateSelection();
    }

    function getSelectedIds() {
      const checkboxes = document.querySelectorAll('.resource-checkbox:checked');
      return Array.from(checkboxes).map(cb => parseInt(cb.value));
    }

    function closeValidationModal() {
      document.getElementById('validationModal').classList.remove('show');
    }

    async function validateSelected() {
      const selectedIds = getSelectedIds();

      if (selectedIds.length === 0) {
        showToast('No Selection', 'Please select resources to validate', 'error');
        return;
      }

      const modal = document.getElementById('validationModal');
      const progressFill = document.getElementById('progressFill');
      const progressText = document.getElementById('progressText');
      const resultsDiv = document.getElementById('validationResults');

      modal.classList.add('show');
      progressFill.style.width = '0%';
      progressText.textContent = \`Validating \${selectedIds.length} resource(s)...\`;
      resultsDiv.innerHTML = '';

      let total = selectedIds.length;
      let completed = 0;
      let validCount = 0;
      let invalidCount = 0;

      try {
        const response = await fetch('/bulk-validate-urls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resource_ids: selectedIds })
        });

        if (!response.ok) {
          throw new Error('Validation request failed');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process each complete line (NDJSON format)
          const lines = buffer.split('\\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const update = JSON.parse(line);

              if (update.type === 'progress') {
                completed = update.completed;
                const percentage = Math.round((completed / total) * 100);
                progressFill.style.width = percentage + '%';
                progressText.textContent = \`Validating: \${completed}/\${total} (\${percentage}%)\`;

                // Add result to display
                const resultItem = update.result;
                const resultHtml = \`
                  <div class="validation-item \${resultItem.valid ? 'valid' : 'invalid'}">
                    <div class="validation-item-name">\${escapeHtml(resultItem.name)}</div>
                    <div class="validation-item-reason">\${escapeHtml(resultItem.reason)}</div>
                  </div>
                \`;
                resultsDiv.insertAdjacentHTML('beforeend', resultHtml);

                // Auto-scroll to bottom
                resultsDiv.scrollTop = resultsDiv.scrollHeight;

              } else if (update.type === 'complete') {
                progressFill.style.width = '100%';
                validCount = update.valid_count;
                invalidCount = update.invalid_count;
                progressText.textContent = \`Validation complete: \${validCount} valid, \${invalidCount} invalid\`;

                if (invalidCount > 0) {
                  showToast('Validation Complete', \`Marked \${invalidCount} resource(s) as unexportable\`, 'info');
                } else {
                  showToast('Validation Complete', 'All resources passed validation', 'success');
                }

                clearSelection();
              }
            } catch (e) {
              console.error('Failed to parse update:', line, e);
            }
          }
        }

      } catch (error) {
        progressText.textContent = 'Validation failed';
        resultsDiv.innerHTML = \`
          <div class="validation-item invalid">
            <div class="validation-item-name">Error</div>
            <div class="validation-item-reason">\${escapeHtml(error.message)}</div>
          </div>
        \`;
        showToast('Error', 'Validation failed: ' + error.message, 'error');
      }
    }
  </script>
</body>
</html>`;
}
