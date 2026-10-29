<template>
  <section class="cloud-values" aria-labelledby="cloud-values-title" :aria-busy="!!busy">
    <header class="db-header">
      <div class="db-heading">
        <span class="db-eyebrow">PROJECT VALUE DATA</span>
        <h3 id="cloud-values-title">Databricks Project Values</h3>
        <p>Explore monthly records and KPI totals across your projects.</p>
      </div>
      <div class="db-toolbar">
        <button v-if="connected" type="button" class="db-button db-secondary" :disabled="!!busy || !loaded || !filteredRows.length" @click="exportExcel">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" /></svg>
          Export Excel
        </button>
        <button type="button" class="db-button" :disabled="!!busy" @click="loadRows">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3a7 7 0 0 0 11.6-1" /></svg>
          {{ busy === 'loading' ? 'Loading…' : 'Refresh table' }}
        </button>
      </div>
    </header>

    <div class="db-status-line">
      <span class="db-status" :class="{ 'db-status-connected': connected && !error && !busy }"><span aria-hidden="true"></span>{{ busy ? loaded ? 'Refreshing table' : 'Connecting to Databricks' : error ? 'Attention needed' : connected ? 'Server connected' : 'Not loaded' }}</span>
      <span v-if="connected" class="db-identity" :title="databricksUser">Shared account: {{ databricksUser }}</span>
      <span v-if="loaded" class="db-updated">Updated {{ displayTime }}</span>
    </div>

    <p class="db-server-note">Uses the server’s Databricks account. No personal token is needed.</p>
    <details v-if="connected" class="db-connection-details" data-html2canvas-ignore="true">
      <summary>Connection details</summary>
      <div class="db-connection-content">
        <dl>
          <div><dt>Shared Databricks account</dt><dd>{{ databricksUser }}</dd></div>
          <div><dt>Access tokens</dt><dd>Renewed automatically by the server when needed</dd></div>
          <div><dt>Source table</dt><dd>{{ tableName }}</dd></div>
        </dl>
      </div>
    </details>

    <div v-if="busy" class="db-loading" role="status" data-html2canvas-ignore="true"><span>{{ busyMessage }}</span><div class="db-loading-track"><span></span></div></div>
    <div v-if="error" class="db-error-banner" role="alert"><strong>Request needs attention</strong><p>{{ error }}</p><p v-if="loaded">Showing the last successfully loaded table.</p></div>
    <p v-if="notice" class="db-notice" role="status">{{ notice }}</p>

    <template v-if="connected && loaded">
      <div class="db-dataset-summary">
        <span class="db-complete"><span aria-hidden="true">✓</span> All {{ formatCount(rows.length) }} records loaded</span>
        <span>{{ formatCount(projectOptions.length) }} projects</span>
        <span v-if="periodRange">{{ periodRange }}</span>
      </div>

      <div class="db-filters">
        <div class="db-filter-heading"><h4>Filter records</h4><button v-if="hasFilters" type="button" class="db-text-button" @click="resetFilters">Reset filters</button></div>
        <div class="db-filter-grid">
          <div class="db-field db-search-field"><label for="db-search">Search</label><input id="db-search" v-model.trim="searchText" type="search" placeholder="Project name or value" /></div>
          <div class="db-field db-project-field"><label for="db-project">Project name</label><select id="db-project" v-model="projectFilter"><option value="">All projects</option><option v-for="project in projectOptions" :key="project.code" :value="project.code">{{ project.label }}</option></select></div>
          <div class="db-field"><label for="db-from">From month</label><input id="db-from" v-model="fromMonth" type="month" :aria-invalid="!!dateFilterError" :aria-describedby="dateFilterError ? 'db-date-error' : undefined" /></div>
          <div class="db-field"><label for="db-to">To month</label><input id="db-to" v-model="toMonth" type="month" :aria-invalid="!!dateFilterError" :aria-describedby="dateFilterError ? 'db-date-error' : undefined" /></div>
        </div>
        <p v-if="dateFilterError" id="db-date-error" class="db-error" role="alert">{{ dateFilterError }}</p>
      </div>

      <div class="db-scope-line" aria-live="polite"><strong>{{ hasFilters ? formatCount(filteredRows.length) + ' of ' + formatCount(rows.length) + ' records match' : 'All records' }}</strong><span>KPI totals use every matching record.</span></div>
      <div class="db-metrics">
        <article v-for="metric in metrics" :key="metric.field" class="db-metric" :style="{ '--metric-color': metric.color }">
          <h4>{{ metric.label }}</h4><strong>{{ formatMoney(metricTotals[metric.field].value) }}</strong><span>{{ metricTotals[metric.field].invalid ? 'Contains an invalid value' : metricTotals[metric.field].count ? 'Total for matching records' : 'No entered values' }}</span>
        </article>
      </div>

      <div class="db-table-panel">
        <div class="db-table-toolbar"><h4>Project value records <span>{{ formatCount(filteredRows.length) }}</span></h4><label class="db-checkbox"><input v-model="hideEmptyColumns" type="checkbox" /> Hide empty columns</label></div>
        <p v-if="!rows.length" class="db-empty">No project value records are available to the server’s Databricks account.</p>
        <div v-else-if="!filteredRows.length" class="db-empty"><strong>{{ dateFilterError ? 'Check the month range' : 'No records match these filters' }}</strong><p>{{ dateFilterError || 'Try another project, month range, or search term.' }}</p><button type="button" class="db-button db-secondary" @click="resetFilters">Reset filters</button></div>
        <div v-else class="db-table-scroll" tabindex="0" role="region" aria-label="Project value records, scroll to see all columns">
          <table>
            <caption class="db-visually-hidden">Databricks project values for the selected filters. All matching records contribute to totals; the table is paginated.</caption>
            <thead><tr><th v-for="column in visibleColumns" :key="column.field" scope="col" :class="{ 'db-numeric': column.numeric }" :aria-sort="sortField === column.field ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'"><button type="button" class="db-sort" @click="sortBy(column.field)"><span>{{ column.label }}</span><span class="db-sort-indicator" aria-hidden="true">{{ sortField === column.field ? sortDirection === 'asc' ? '↑' : '↓' : '↕' }}</span></button></th></tr></thead>
            <tbody><tr v-for="entry in pagedRows" :key="entry.key"><td v-for="column in visibleColumns" :key="column.field" :class="{ 'db-numeric': column.numeric, 'db-missing': isMissing(entry.row[column.field]) }"><span v-if="column.field === 'project_name'" class="db-project-name">{{ projectLabel(entry.row) }}</span><template v-else>{{ formatCell(entry.row[column.field], column.field) }}</template></td></tr></tbody>
            <tfoot><tr><td v-for="(column, index) in visibleColumns" :key="column.field" :class="{ 'db-numeric': column.numeric }">{{ column.money ? formatMoney(metricTotals[column.field].value) : index === 0 ? 'Filtered total' : '' }}</td></tr></tfoot>
          </table>
        </div>
        <footer v-if="filteredRows.length" class="db-pagination">
          <div class="db-page-size"><label for="db-page-size">Rows per page</label><select id="db-page-size" v-model.number="pageSize"><option :value="10">10</option><option :value="25">25</option><option :value="50">50</option><option :value="100">100</option></select></div>
          <span class="db-page-range">{{ formatCount(firstVisibleRow) }}–{{ formatCount(lastVisibleRow) }} of {{ formatCount(filteredRows.length) }}</span>
          <nav class="db-page-buttons" aria-label="Project values pagination"><button type="button" class="db-page-button" :disabled="page <= 1" aria-label="Previous page" @click="page -= 1">‹</button><span>Page {{ page }} of {{ pageCount }}</span><button type="button" class="db-page-button" :disabled="page >= pageCount" aria-label="Next page" @click="page += 1">›</button></nav>
        </footer>
      </div>
      <p class="db-footnote">Read-only Databricks data. Excel export includes all matching records across every page.</p>
    </template>
  </section>
</template>

<script>
import * as XLSX from 'xlsx';

const moneyFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const countFormatter = new Intl.NumberFormat('en-US');
const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthFormatter = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const refreshedFormatter = new Intl.DateTimeFormat('en-SG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default {
  name: 'DatabricksProjectValues',
  props: {
    apiFetch: { type: Function, required: true },
    endpoint: { type: String, default: '' }
  },
  emits: ['busy-change'],
  data() {
    return {
      tableName: 'mds_prod_gold_experiment.uc_dev_projvalue.t_project_values_cloud',
      connected: false, databricksUser: '',
      busy: '', loaded: false, error: '', notice: '', columns: [], rows: [],
      fetchedAt: '', disposed: false, controller: null,
      searchText: '', projectFilter: '', fromMonth: '', toMonth: '', hideEmptyColumns: true,
      sortField: 'month_end', sortDirection: 'desc', page: 1, pageSize: 25,
      requestId: 0
    };
  },
  computed: {
    metrics() {
      return [
        { field: 'capacity_improvement', label: 'Capacity Improvement', color: '#2563EB' },
        { field: 'yield_savings', label: 'Yield Savings', color: '#117A65' },
        { field: 'people_productivity', label: 'People Productivity', color: '#124076' },
        { field: 'quality_improvement', label: 'Quality Improvement', color: '#6C3483' }
      ];
    },
    projectOptions() {
      const byCode = new Map();
      this.rows.forEach(row => {
        if (!this.isMissing(row.project_code)) byCode.set(String(row.project_code), this.projectLabel(row));
      });
      const nameCounts = new Map();
      byCode.forEach(name => nameCounts.set(name, (nameCounts.get(name) || 0) + 1));
      return [...byCode].map(([code, name]) => ({ code, name,
        label: nameCounts.get(name) > 1 ? `${name} (${code})` : name
      })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.code.localeCompare(b.code));
    },
    indexedRows() {
      return this.rows.map((row, index) => {
        const dateKey = this.dateKey(row.month_end);
        const searchable = Object.values(row).map(this.displayValue).concat([
          this.formatDate(row.month_end), ...this.metrics.map(metric => this.formatMoney(this.numericValue(row[metric.field])))
        ]).join(' ').toLocaleLowerCase();
        return { row, key: `record-${index}`, dateKey, projectCode: String(row.project_code ?? ''), searchable };
      });
    },
    dateFilterError() {
      return this.fromMonth && this.toMonth && this.fromMonth > this.toMonth ? 'From month must be before or equal to To month.' : '';
    },
    hasFilters() { return !!(this.searchText || this.projectFilter || this.fromMonth || this.toMonth); },
    filteredRows() {
      if (this.dateFilterError) return [];
      const search = this.searchText.toLocaleLowerCase();
      return this.indexedRows.filter(entry => {
        const month = entry.dateKey.slice(0, 7);
        return (!this.projectFilter || entry.projectCode === this.projectFilter) &&
          (!this.fromMonth || month && month >= this.fromMonth) &&
          (!this.toMonth || month && month <= this.toMonth) &&
          (!search || entry.searchable.includes(search));
      });
    },
    metricTotals() {
      return Object.fromEntries(this.metrics.map(metric => {
        let sum = 0, count = 0, invalid = 0;
        this.filteredRows.forEach(entry => {
          const raw = entry.row[metric.field];
          if (this.isMissing(raw)) return;
          const value = this.numericValue(raw);
          if (value === null) invalid += 1;
          else { sum += value; count += 1; }
        });
        return [metric.field, { value: count && !invalid ? sum : null, count, invalid }];
      }));
    },
    visibleColumns() {
      const preferred = ['metric_id', 'project_name', 'month_end', 'capacity_improvement', 'yield_savings', 'people_productivity', 'quality_improvement'];
      const ordered = [...preferred.filter(field => this.columns.includes(field)), ...this.columns.filter(field => field !== 'project_code' && !preferred.includes(field))];
      return ordered.filter(field => !this.hideEmptyColumns || !this.rows.length || this.rows.some(row => !this.isMissing(row[field]))).map(field => {
        const metric = this.metrics.find(item => item.field === field);
        const labels = { metric_id: 'Metric ID', project_code: 'Project Code', project_name: 'Project Name', month_end: 'Month End' };
        return { field, label: metric?.label || labels[field] || field.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()), money: !!metric, numeric: !!metric || field === 'metric_id' };
      });
    },
    sortedRows() {
      const direction = this.sortDirection === 'asc' ? 1 : -1;
      const money = this.metrics.some(metric => metric.field === this.sortField);
      return [...this.filteredRows].sort((a, b) => {
        const left = this.sortField === 'month_end' ? a.dateKey : money ? this.numericValue(a.row[this.sortField]) : a.row[this.sortField];
        const right = this.sortField === 'month_end' ? b.dateKey : money ? this.numericValue(b.row[this.sortField]) : b.row[this.sortField];
        const missingLeft = this.isMissing(left), missingRight = this.isMissing(right);
        if (missingLeft !== missingRight) return missingLeft ? 1 : -1;
        const compared = missingLeft ? 0 : money ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true });
        return compared * direction || a.projectCode.localeCompare(b.projectCode, undefined, { numeric: true }) || a.key.localeCompare(b.key, undefined, { numeric: true });
      });
    },
    pageCount() { return Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize)); },
    pagedRows() { return this.sortedRows.slice((this.page - 1) * this.pageSize, this.page * this.pageSize); },
    firstVisibleRow() { return this.filteredRows.length ? (this.page - 1) * this.pageSize + 1 : 0; },
    lastVisibleRow() { return Math.min(this.page * this.pageSize, this.filteredRows.length); },
    periodRange() {
      const dates = this.indexedRows.map(entry => entry.dateKey).filter(Boolean).sort();
      if (!dates.length) return '';
      const first = monthFormatter.format(new Date(`${dates[0]}T00:00:00Z`));
      const last = monthFormatter.format(new Date(`${dates[dates.length - 1]}T00:00:00Z`));
      return first === last ? first : `${first} – ${last}`;
    },
    rowsEndpoint() {
      const base = (process.env.VUE_APP_API_URL || '').replace(/\/+$/, '');
      return this.endpoint || `${base}/api/databricks/project-values`;
    },
    displayTime() { return this.fetchedAt ? refreshedFormatter.format(new Date(this.fetchedAt)) : ''; },
    busyMessage() {
      return this.busy ? 'Loading the complete table through the server connection. The warehouse may need time to start.' : '';
    }
  },
  watch: {
    filteredRows() { this.page = 1; },
    pageSize() { this.page = 1; }
  },
  mounted() {
    this.loadRows();
  },
  beforeUnmount() {
    this.disposed = true;
    this.cancelRequest();
    this.$emit('busy-change', false);
  },
  methods: {
    isMissing(value) { return value === null || value === undefined || typeof value === 'string' && !value.trim(); },
    projectLabel(row) {
      if (!this.isMissing(row.project_name)) return String(row.project_name).trim();
      return this.isMissing(row.project_code) ? '—' : String(row.project_code);
    },
    numericValue(value) {
      if (this.isMissing(value) || !['number', 'string'].includes(typeof value)) return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    },
    formatCount(value) { return countFormatter.format(Number(value)); },
    formatMoney(value) {
      if (value === null || value === undefined || !Number.isFinite(value)) return '—';
      return `${value < 0 ? '-' : ''}$${moneyFormatter.format(Math.abs(value))}`;
    },
    dateKey(value) {
      if (this.isMissing(value)) return '';
      const candidate = String(value).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return '';
      const parsed = new Date(`${candidate}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate ? candidate : '';
    },
    formatDate(value) {
      const key = this.dateKey(value);
      return key ? dateFormatter.format(new Date(`${key}T00:00:00Z`)) : this.displayValue(value);
    },
    formatCell(value, field) {
      if (field === 'month_end') return this.formatDate(value);
      if (this.metrics.some(metric => metric.field === field)) {
        const number = this.numericValue(value);
        return number === null ? this.displayValue(value) : this.formatMoney(number);
      }
      return this.displayValue(value);
    },
    sortBy(field) {
      if (this.sortField === field) this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      else { this.sortField = field; this.sortDirection = field === 'month_end' ? 'desc' : 'asc'; }
      this.page = 1;
    },
    resetFilters() { this.searchText = ''; this.projectFilter = ''; this.fromMonth = ''; this.toMonth = ''; this.page = 1; },
    exportExcel() {
      if (this.busy || !this.loaded || !this.filteredRows.length) return;
      try {
        const columns = this.visibleColumns;
        const data = [columns.map(column => column.label), ...this.sortedRows.map(entry => columns.map(column => {
          const value = entry.row[column.field];
          if (column.field === 'month_end') return this.dateKey(value) || this.displayValue(value);
          if (this.isMissing(value)) return '';
          return typeof value === 'object' ? JSON.stringify(value) : value;
        }))];
        const sheet = XLSX.utils.aoa_to_sheet(data);
        sheet['!cols'] = columns.map(column => ({ wch: Math.max(column.label.length + 2, column.money ? 22 : 17) }));
        sheet['!autofilter'] = { ref: sheet['!ref'] };
        columns.forEach((column, columnIndex) => {
          if (!column.money) return;
          for (let rowIndex = 1; rowIndex < data.length; rowIndex += 1) {
            const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
            if (cell?.t === 'n') cell.z = '$#,##0.00;[Red]($#,##0.00)';
          }
        });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, 'Databricks Values');
        XLSX.writeFile(workbook, `Databricks_Project_Values_${new Date().toISOString().slice(0, 10)}.xlsx`);
        this.notice = `Exported all ${this.formatCount(this.filteredRows.length)} matching records.`;
      } catch { this.error = 'Excel export failed. Please try again.'; }
    },
    setBusy(value) { this.busy = value; this.$emit('busy-change', !!value); },
    cancelRequest() { this.requestId += 1; this.controller?.abort(); this.controller = null; },
    beginRequest(value) {
      this.cancelRequest();
      this.controller = new AbortController();
      this.setBusy(value);
      this.error = '';
      this.notice = '';
      return this.requestId;
    },
    isCurrent(id) { return !this.disposed && id === this.requestId; },
    clearRows() { this.rows = []; this.columns = []; this.loaded = false; this.page = 1; this.fetchedAt = ''; },
    async request(url, options = {}) {
      const response = await this.apiFetch(url, { ...options, cache: 'no-store', signal: this.controller?.signal });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error(`Backend returned HTTP ${response.status} instead of JSON. Check the API URL and restart the updated backend.`);
      }
      const result = await response.json();
      if (!response.ok) throw Object.assign(new Error(result.message || `Request failed (HTTP ${response.status}).`), { code: result.code });
      return result;
    },
    applyRows(result) {
      if (result?.auth_mode !== 'server-cache' || result?.server_managed !== true) throw new Error('This page requires the server-cache backend. Install the accompanying backend/server.js and restart the backend.');
      if (!result || !Array.isArray(result.rows) || !Array.isArray(result.columns) || !result.columns.every(column => typeof column === 'string') || result.rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Unexpected Databricks data response.');
      if (!result.columns.includes('project_name')) throw new Error('The backend has not returned project names. Install the updated backend/server.js with the cloud Project Master join, then restart the backend.');
      if (result.complete !== true || result.total_rows !== result.rows.length) throw new Error('This endpoint did not return the complete table. Install the accompanying backend/server.js and restart the backend.');
      if (typeof result.databricks_user !== 'string' || !result.databricks_user) throw new Error('The server did not return its Databricks account.');
      this.connected = true;
      this.databricksUser = result.databricks_user;
      this.rows = result.rows;
      this.columns = result.columns;
      this.page = 1;
      this.fetchedAt = result.fetched_at || '';
      this.loaded = true;
    },
    handleError(err) {
      if (err.name === 'AbortError') return;
      if (err.code === 'GUI_LOGIN_REQUIRED') {
        this.connected = false;
        this.databricksUser = '';
        this.clearRows();
      }
      this.error = err.message || 'Could not complete the Databricks request.';
    },
    async loadRows() {
      if (this.busy) return;
      const id = this.beginRequest('loading');
      // Keep the last successful snapshot until a complete replacement arrives.
      try {
        const result = await this.request(this.rowsEndpoint);
        if (!this.isCurrent(id)) return;
        this.applyRows(result);
      } catch (err) {
        if (this.isCurrent(id)) this.handleError(err);
      } finally {
        if (this.isCurrent(id)) this.setBusy('');
      }
    },
    displayValue(value) {
      if (this.isMissing(value)) return '—';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    }
  }
};
</script>

<style scoped>
.cloud-values { color: #1f3b64; background: #fff; border: 1px solid #dbe3ed; border-radius: 14px; padding: 24px; font-family: inherit; min-width: 0; }
.cloud-values *, .cloud-values *::before, .cloud-values *::after { box-sizing: border-box; }
.db-header, .db-toolbar, .db-filter-heading, .db-table-toolbar, .db-pagination, .db-status-line, .db-dataset-summary, .db-scope-line, .db-page-buttons, .db-page-size { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.db-header { justify-content: space-between; align-items: flex-start; gap: 20px; }
.db-heading { min-width: 0; }
.db-eyebrow { display: block; color: #53647a; font-size: .69rem; font-weight: 700; letter-spacing: .12em; margin-bottom: 8px; }
.db-heading h3 { color: #123454; font-size: 1.45rem; line-height: 1.3; margin: 0; font-weight: 700; }
.db-heading p { margin: 7px 0 0; color: #53647a; font-size: .92rem; line-height: 1.5; }
.db-button, .db-page-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 42px; padding: 9px 15px; border: 1px solid #1f5fa8; border-radius: 7px; background: #1f5fa8; color: #fff; font: inherit; font-size: .88rem; font-weight: 600; cursor: pointer; white-space: nowrap; }
.db-button svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.db-secondary { color: #1f5fa8; background: #fff; border-color: #aabbd0; }
.db-button:hover:not(:disabled) { background: #184f8d; border-color: #184f8d; color: #fff; }
.db-secondary:hover:not(:disabled) { background: #edf4fc; color: #184f8d; border-color: #1f5fa8; }
.cloud-values button:disabled, .cloud-values input:disabled { cursor: not-allowed; opacity: .55; }
.cloud-values button:focus-visible, .cloud-values input:focus-visible, .cloud-values select:focus-visible, .cloud-values summary:focus-visible, .db-table-scroll:focus-visible { outline: 3px solid #b77900; outline-offset: 3px; }
.db-status-line { margin-top: 20px; color: #53647a; font-size: .8rem; gap: 10px; }
.db-status { display: inline-flex; gap: 7px; align-items: center; border-radius: 20px; padding: 5px 9px; background: #f0f3f7; color: #47576b; font-weight: 600; }
.db-status > span { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.db-status-connected { background: #e9f7f1; color: #116149; }
.db-identity { max-width: 100%; overflow-wrap: anywhere; }
.db-updated { margin-left: auto; }
.db-server-note { margin: 10px 0 0; color: #53647a; font-size: .8rem; line-height: 1.5; }
.db-connection-details { margin-top: 10px; color: #53647a; font-size: .8rem; }
.db-connection-details summary { display: list-item; width: fit-content; cursor: pointer; padding: 7px 0; }
.db-connection-content { display: flex; flex-wrap: wrap; gap: 20px; justify-content: space-between; background: #f7f9fc; border: 1px solid #e1e7ef; border-radius: 8px; padding: 16px; margin-top: 6px; }
.db-connection-content dl { margin: 0; min-width: 0; }
.db-connection-content dl div + div { margin-top: 10px; }
.db-connection-content dt { font-weight: 600; color: #42536b; }
.db-connection-content dd { margin: 3px 0 0; overflow-wrap: anywhere; }
.db-field input, .db-field select { width: 100%; min-width: 0; }
.db-help { font-size: .78rem !important; color: #53647a; line-height: 1.5; }
.db-text-button { padding: 6px 2px; min-height: 32px; border: 0; border-radius: 4px; background: transparent; color: #1f5fa8; font: inherit; font-size: .8rem; font-weight: 600; cursor: pointer; }
.db-text-button:hover { text-decoration: underline; }
.db-loading { background: #f0f6ff; border: 1px solid #cedff4; padding: 13px 16px; border-radius: 8px; margin-top: 18px; color: #244e7d; font-size: .85rem; }
.db-loading-track { height: 3px; background: #d8e5f6; overflow: hidden; border-radius: 3px; margin-top: 12px; }
.db-loading-track span { display: block; width: 35%; height: 100%; background: #1f5fa8; animation: db-loading 1.6s ease-in-out infinite; }
@keyframes db-loading { from { transform: translateX(-100%); } to { transform: translateX(390%); } }
@media (prefers-reduced-motion: reduce) { .db-loading-track span { animation: none; width: 100%; } }
.db-error-banner { margin-top: 18px; padding: 14px 16px; border: 1px solid #e5b6b6; border-radius: 8px; background: #fff7f7; color: #9c2525; font-size: .85rem; line-height: 1.5; }
.db-error-banner p { margin: 5px 0 0; }
.db-error { color: #9c2525 !important; font-size: .84rem; }
.db-notice { color: #116149; font-size: .83rem; margin: 12px 0 0; }
.db-dataset-summary { gap: 10px 20px; padding: 18px 0; margin-top: 5px; font-size: .8rem; color: #53647a; }
.db-complete { color: #116149; font-weight: 650; }
.db-complete > span { margin-right: 5px; }
.db-filters { padding: 16px; background: #f7f9fc; border: 1px solid #e0e7f0; border-radius: 9px; }
.db-filter-heading { justify-content: space-between; min-height: 25px; margin-bottom: 12px; }
.db-filter-grid { display: grid; grid-template-columns: repeat(6,minmax(0,1fr)); gap: 14px; }
.db-search-field, .db-project-field { grid-column: span 2; }
.db-scope-line { justify-content: space-between; color: #53647a; font-size: .78rem; margin: 20px 0 10px; }
.db-scope-line strong { color: #42536b; font-weight: 600; }
.db-metrics { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 14px; margin-bottom: 22px; }
.db-metric { border: 1px solid #dce4ee; border-top: 3px solid var(--metric-color); border-radius: 8px; padding: 15px; min-width: 0; background: #fff; }
.db-metric h4 { margin: 0 0 11px; color: #53647a; font-size: .76rem; font-weight: 600; }
.db-metric > strong { display: block; font-size: clamp(1.2rem,1.8vw,1.65rem); letter-spacing: -.025em; font-weight: 700; color: #173b60; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.db-metric > span { display: block; margin-top: 7px; font-size: .69rem; color: #607087; }
.db-table-panel { border: 1px solid #dbe3ed; border-radius: 10px; overflow: hidden; }
.db-table-toolbar { padding: 15px 16px; justify-content: space-between; gap: 12px; border-bottom: 1px solid #dfe6ef; }
.db-table-toolbar h4 span { display: inline-block; margin-left: 6px; padding: 3px 7px; background: #edf2f8; color: #53647a; border-radius: 5px; font-size: .72rem; font-weight: 600; }
.db-checkbox { display: inline-flex; align-items: center; gap: 7px; color: #53647a; font-size: .76rem; min-height: 28px; cursor: pointer; }
.db-checkbox input { width: 15px; height: 15px; margin: 0; accent-color: #1f5fa8; }
.db-table-scroll { overflow: auto; max-width: 100%; max-height: 590px; }
.cloud-values table { width: 100%; min-width: 840px; border-collapse: separate; border-spacing: 0; font-size: .84rem; color: #334b65; }
.cloud-values th { background: #f3f6fa; color: #425773; border-bottom: 1px solid #d6e0eb; padding: 0; text-align: left; position: sticky; top: 0; z-index: 1; }
.db-sort { display: flex; gap: 8px; align-items: center; width: 100%; min-height: 56px; border: 0; background: transparent; padding: 12px 16px; color: inherit; font: inherit; font-size: .75rem; font-weight: 650; cursor: pointer; text-align: inherit; line-height: 1.35; }
.db-sort:hover { background: #e7eef8; }
.db-sort-indicator { opacity: .8; flex-shrink: 0; }
.cloud-values td { padding: 14px 16px; border-bottom: 1px solid #e7edf4; white-space: nowrap; text-align: left; font-variant-numeric: tabular-nums; }
.cloud-values tbody tr:nth-child(even) { background: #fafbfd; }
.cloud-values tbody tr:hover { background: #eff5fc; }
.cloud-values .db-numeric { text-align: right; }
.db-numeric .db-sort { justify-content: flex-end; }
.db-missing { color: #78869a; }
.db-project-name { display: inline-block; min-width: 150px; max-width: 320px; color: #244e7d; font-weight: 600; white-space: normal; overflow-wrap: anywhere; line-height: 1.5; }
.cloud-values tfoot td { background: #edf3fa; color: #203f60; font-weight: 650; border-bottom: 0; border-top: 1px solid #ccd9e8; }
.db-pagination { padding: 12px 16px; gap: 14px; color: #53647a; font-size: .76rem; }
.db-page-size { gap: 8px; }
.db-page-size select { min-height: 34px; padding: 5px 8px; font-size: .78rem; }
.db-page-range { margin-left: auto; }
.db-page-buttons { gap: 10px; }
.db-page-button { min-height: 34px; width: 34px; padding: 4px; background: #fff; color: #244e7d; border-color: #aabbd0; font-size: 1.2rem; }
.db-page-button:hover:not(:disabled) { background: #edf3fa; }
.db-empty { text-align: center; padding: 42px 18px; color: #53647a; font-size: .9rem; }
.db-empty strong { display: block; color: #244e7d; }
.db-empty p { margin: 8px 0 18px; }
.db-footnote { font-size: .73rem; color: #607087; margin: 12px 0 0; line-height: 1.5; }
.db-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); clip-path: inset(50%); white-space: nowrap; border: 0; }
@media (max-width: 1050px) { .db-filter-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } .db-search-field, .db-project-field { grid-column: auto; } .db-metrics { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (max-width: 400px) { .db-metrics { grid-template-columns: minmax(0,1fr); } }
</style>
