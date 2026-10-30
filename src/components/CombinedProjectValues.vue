<template>
  <section class="combined-values" aria-labelledby="combined-values-title" :aria-busy="busy">
    <header class="cv-header">
      <div>
        <span class="cv-eyebrow">PORTFOLIO OVERVIEW</span>
        <h3 id="combined-values-title">Combined Values</h3>
        <p>Project values from On Prem and Databricks, together.</p>
      </div>
      <div class="cv-actions">
        <button type="button" class="cv-button cv-secondary" :disabled="busy || !loaded || !filteredRows.length" @click="exportExcel">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" /></svg>
          Export Excel
        </button>
        <button type="button" class="cv-button" :disabled="busy" @click="refreshBoth">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3a7 7 0 0 0 11.6-1" /></svg>
          {{ busy ? 'Loading both sources…' : 'Refresh both' }}
        </button>
      </div>
    </header>

    <div class="cv-status-row" aria-live="polite">
      <span v-for="source in sourceList" :key="source.key" class="cv-source-status" :class="'cv-status-' + sourceStatus[source.key]">
        <span class="cv-status-dot" aria-hidden="true"></span>
        {{ source.label }} <span class="cv-status-description">{{ statusLabel(sourceStatus[source.key]) }}</span>
      </span>
      <span v-if="loaded" class="cv-updated">Last complete refresh {{ displayTime }}</span>
    </div>
    <div v-if="busy" class="cv-loading" role="status" data-html2canvas-ignore="true">
      <p>{{ loaded ? 'Refreshing both sources. The previous complete totals stay visible until both are ready.' : 'Loading all monthly records from both sources. Databricks may need time to start.' }}</p>
      <div class="cv-loading-track"><span></span></div>
    </div>
    <div v-if="error" class="cv-alert cv-error" role="alert">
      <strong>Combined values could not be refreshed</strong>
      <ul v-if="Object.keys(sourceErrors).length"><li v-for="(message, key) in sourceErrors" :key="key">{{ sourceLabel(key) }}: {{ message }}</li></ul>
      <p v-else>{{ error }}</p>
      <p>{{ loaded ? 'Showing the last complete refresh, with its original totals. Use Refresh both to retry.' : 'Both sources must load before combined totals are shown. Use Refresh both to retry.' }}</p>
    </div>
    <p v-if="notice" class="cv-notice" role="status">{{ notice }}</p>
    <p v-if="exportError" class="cv-field-error" role="alert">{{ exportError }}</p>

    <template v-if="loaded">
      <div class="cv-filters" data-html2canvas-ignore="true">
        <div class="cv-filter-heading"><h4>Filter portfolio</h4><button v-if="hasFilters" type="button" class="cv-text-button" @click="resetFilters">Reset filters</button></div>
        <div class="cv-filter-grid">
          <label class="cv-field cv-search-field" for="cv-search">Search<input id="cv-search" v-model.trim="search" type="search" placeholder="Project name or value" /></label>
          <label class="cv-field cv-project-field" for="cv-project">Project name<select id="cv-project" v-model="project"><option value="">All projects</option><option v-for="choice in choices" :key="choice.code" :value="choice.code">{{ choice.label }}</option></select></label>
          <label class="cv-field" for="cv-source">Source<select id="cv-source" v-model="source"><option value="">Both sources</option><option value="onPrem">On Prem Values</option><option value="databricks">Databricks Values</option></select></label>
          <label class="cv-field" for="cv-from">From month<input id="cv-from" v-model="from" type="month" :aria-invalid="!!dateError" :aria-describedby="dateError ? 'cv-date-error' : undefined" /></label>
          <label class="cv-field" for="cv-to">To month<input id="cv-to" v-model="to" type="month" :aria-invalid="!!dateError" :aria-describedby="dateError ? 'cv-date-error' : undefined" /></label>
        </div>
        <p v-if="dateError" id="cv-date-error" class="cv-field-error" role="alert">{{ dateError }}</p>
      </div>

      <div class="cv-scope" aria-live="polite">
        <strong>{{ count(summary.projects.length) }} projects <span aria-hidden="true">·</span> {{ count(filteredRows.length) }} monthly source records</strong>
        <span>{{ scopeLabel }}</span>
      </div>
      <p v-if="summary.total.invalid" class="cv-alert cv-warning" role="alert">Some records contain invalid amounts. Affected totals are marked “Check values”; invalid amounts are not replaced with zero.</p>
      <div v-if="summary.overlapping || summary.repeated" class="cv-alert cv-warning">
        <p v-if="summary.overlapping">{{ count(summary.overlapping) }} project-months have values in both sources. Both contributions are included.</p>
        <p v-if="summary.repeated">{{ count(summary.repeated) }} project-months contain multiple records in one source. All returned records are included.</p>
        <button type="button" class="cv-text-button" @click="setView('records')">Review monthly source records</button>
      </div>

      <div class="cv-total-panel">
        <div class="cv-total-main"><span>{{ source ? sourceLabel(source) + ' total' : 'Combined project value' }}</span><strong>{{ money(summary.total) }}</strong><small>Sum of the four KPIs for the selected records</small></div>
        <div class="cv-source-contribution"><span><i class="cv-onprem-dot" aria-hidden="true"></i>On Prem Values</span><strong>{{ sourceMoney('onPrem') }}</strong><small>{{ count(sourceCounts.onPrem) }} monthly records</small></div>
        <div class="cv-source-contribution"><span><i class="cv-cloud-dot" aria-hidden="true"></i>Databricks Values</span><strong>{{ sourceMoney('databricks') }}</strong><small>{{ count(sourceCounts.databricks) }} monthly records</small></div>
      </div>
      <div class="cv-kpis">
        <article v-for="metric in metrics" :key="metric.field" class="cv-kpi" :style="{ '--metric-color': metric.color }">
          <h4>{{ metric.label }}</h4><strong>{{ money(summary.metrics[metric.field]) }}</strong><span>{{ summary.metrics[metric.field].invalid ? 'Contains an invalid amount' : summary.metrics[metric.field].count ? 'Total across matching records' : 'No entered amounts' }}</span>
        </article>
      </div>

      <div v-if="filteredRows.length" class="cv-chart-panel">
        <div class="cv-panel-heading"><div><h4>Cumulative project value</h4><p>Running sum of monthly amounts within the selected period.</p></div><span class="cv-period">{{ periodLabel }}</span></div>
        <apexchart type="line" height="310" :series="trendSeries" :options="trendOptions" />
      </div>

      <div ref="tablePanel" class="cv-table-panel">
        <div class="cv-table-toolbar">
          <div><h4>{{ view === 'projects' ? 'Project totals' : 'Monthly source records' }} <span>{{ count(tableRows.length) }}</span></h4><p>{{ view === 'projects' ? 'Each project is grouped by its project code across both sources.' : 'Source contributions are shown separately for each project and month.' }}</p></div>
          <div class="cv-view-switch" aria-label="Table view" data-html2canvas-ignore="true"><button type="button" :aria-pressed="view === 'projects'" @click="setView('projects')">By project</button><button type="button" :aria-pressed="view === 'records'" @click="setView('records')">Monthly records</button></div>
        </div>
        <label v-if="view === 'projects'" class="cv-checkbox" for="cv-breakdown" data-html2canvas-ignore="true"><input id="cv-breakdown" v-model="showBreakdown" type="checkbox" /> Show source breakdown in table</label>
        <div v-if="!tableRows.length" class="cv-empty"><strong>{{ dateError ? 'Check the month range' : rows.length ? 'No records match these filters' : 'No project values yet' }}</strong><p>{{ dateError || (rows.length ? 'Try another project, source, month range or search term.' : 'Both sources loaded successfully and returned no monthly records.') }}</p><button v-if="hasFilters" type="button" class="cv-button cv-secondary" @click="resetFilters">Reset filters</button></div>
        <div v-else class="cv-table-scroll" tabindex="0" role="region" aria-label="Combined values, scroll to see all columns">
          <table>
            <caption class="cv-visually-hidden">{{ view === 'projects' ? 'Project totals from matching monthly source records.' : 'Matching monthly records from On Prem and Databricks.' }} All matching records contribute to the totals, across every page.</caption>
            <thead><tr><th v-for="column in tableColumns" :key="column.field" scope="col" :class="{ 'cv-numeric': column.money }" :aria-sort="sortField === column.field ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'"><button type="button" class="cv-sort" @click="sortBy(column.field)"><span>{{ column.label }}</span><span aria-hidden="true">{{ sortField === column.field ? sortDirection === 'asc' ? '↑' : '↓' : '↕' }}</span></button></th></tr></thead>
            <tbody><tr v-for="entry in pagedRows" :key="entry.key"><td v-for="column in tableColumns" :key="column.field" :class="{ 'cv-numeric': column.money, 'cv-total-cell': column.field === 'total' }"><template v-if="column.field === 'project'"><strong class="cv-project-name">{{ projectName(entry) }}</strong><span v-if="view === 'projects'" class="cv-row-meta">{{ entry.sourceCounts.onPrem && entry.sourceCounts.databricks ? 'Both sources' : entry.sourceCounts.onPrem ? 'On Prem' : 'Databricks' }} <span aria-hidden="true">·</span> {{ count(entry.months.size) }} months</span></template><span v-else-if="column.field === 'source'" class="cv-source-badge" :class="'cv-badge-' + entry.source">{{ sourceLabel(entry.source) }}</span><template v-else-if="column.field === 'date'">{{ displayDate(entry.date) }}</template><template v-else>{{ money(entryCell(entry, column.field)) }}</template></td></tr></tbody>
            <tfoot><tr><td v-for="(column, index) in tableColumns" :key="column.field" :class="{ 'cv-numeric': column.money, 'cv-total-cell': column.field === 'total' }">{{ column.money ? money(summaryCell(column.field)) : index === 0 ? 'Filtered total' : '' }}</td></tr></tfoot>
          </table>
        </div>
        <footer v-if="tableRows.length" class="cv-pagination" data-html2canvas-ignore="true">
          <label class="cv-page-size" for="cv-page-size">Rows per page<select id="cv-page-size" v-model.number="pageSize"><option :value="10">10</option><option :value="25">25</option><option :value="50">50</option><option :value="100">100</option></select></label>
          <span>{{ count(firstRow) }}–{{ count(lastRow) }} of {{ count(tableRows.length) }}</span>
          <nav aria-label="Combined values pagination"><button type="button" class="cv-page-button" :disabled="page <= 1" aria-label="Previous page" @click="page -= 1">‹</button><span>Page {{ page }} of {{ pageCount }}</span><button type="button" class="cv-page-button" :disabled="page >= pageCount" aria-label="Next page" @click="page += 1">›</button></nav>
        </footer>
      </div>
      <p class="cv-footnote">Totals include every matching monthly record across both sources, not just this page. Excel includes project totals and their source records. This view does not change stored values.</p>
    </template>
  </section>
</template>

<script>
import * as XLSX from 'xlsx';
import VueApexCharts from 'vue3-apexcharts';
import {
  COMBINED_METRICS, SOURCE_LABELS, compareTotals, cumulativeCombinedSeries,
  decimalAmount, exportCombinedMoney, filterCombinedRows, formatCombinedMoney,
  loadCombinedValues, projectChoices, summarizeCombinedRows
} from '@/utils/combinedProjectValues';

const countFormatter = new Intl.NumberFormat('en-US');
const monthFormatter = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const timeFormatter = new Intl.DateTimeFormat('en-SG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const knownZero = () => ({ amount: decimalAmount(0), count: 0, invalid: 0 });

export default {
  name: 'CombinedProjectValues',
  components: { apexchart: VueApexCharts },
  props: {
    apiFetch: { type: Function, required: true },
    onPremEndpoint: { type: String, default: '' },
    databricksEndpoint: { type: String, default: '' }
  },
  emits: ['busy-change'],
  data() {
    return {
      rows: [], loaded: false, busy: false, fetchedAt: '', error: '', sourceErrors: {}, notice: '', exportError: '',
      sourceStatus: { onPrem: 'idle', databricks: 'idle' }, controller: null, requestId: 0, disposed: false,
      project: '', source: '', search: '', from: '', to: '', view: 'projects', showBreakdown: false,
      page: 1, pageSize: 25, sortField: 'total', sortDirection: 'desc'
    };
  },
  computed: {
    metrics() { return COMBINED_METRICS; },
    sourceList() { return Object.entries(SOURCE_LABELS).map(([key, label]) => ({ key, label })); },
    choices() { return projectChoices(this.rows); },
    names() { return new Map(this.choices.map(choice => [choice.code, choice.label])); },
    filteredRows() { return filterCombinedRows(this.rows, { project: this.project, source: this.source, search: this.search, from: this.from, to: this.to }); },
    summary() { return summarizeCombinedRows(this.filteredRows); },
    sourceCounts() { return { onPrem: this.filteredRows.filter(row => row.source === 'onPrem').length, databricks: this.filteredRows.filter(row => row.source === 'databricks').length }; },
    dateError() { return this.from && this.to && this.from > this.to ? 'From month must be before or equal to To month.' : ''; },
    hasFilters() { return !!(this.project || this.source || this.search || this.from || this.to); },
    displayTime() { return this.fetchedAt ? timeFormatter.format(new Date(this.fetchedAt)) : ''; },
    periodLabel() {
      const months = this.filteredRows.map(row => row.month).sort();
      if (!months.length) return 'No matching months';
      const first = this.displayMonth(months[0]), last = this.displayMonth(months[months.length - 1]);
      return first === last ? first : `${first} – ${last}`;
    },
    scopeLabel() { return `${this.source ? this.sourceLabel(this.source) : 'Both sources'} · ${this.periodLabel}${this.project ? ' · ' + this.names.get(this.project) : ''}`; },
    trend() { return cumulativeCombinedSeries(this.filteredRows); },
    trendSeries() {
      const series = [{ name: 'Combined value', data: this.trend.data.total }];
      if (!this.source || this.source === 'onPrem') series.push({ name: 'On Prem Values', data: this.trend.data.onPrem });
      if (!this.source || this.source === 'databricks') series.push({ name: 'Databricks Values', data: this.trend.data.databricks });
      return this.source ? series.slice(1) : series;
    },
    trendOptions() {
      const colors = { 'Combined value': '#0A2D55', 'On Prem Values': '#117A65', 'Databricks Values': '#2563EB' };
      return {
        chart: { type: 'line', fontFamily: 'inherit', toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false } },
        colors: this.trendSeries.map(series => colors[series.name]),
        stroke: { width: this.trendSeries.map(series => series.name === 'Combined value' || this.source ? 3 : 2), curve: 'straight', dashArray: this.trendSeries.map(series => series.name === 'Combined value' || this.source ? 0 : 5) },
        markers: { size: this.trend.months.length === 1 ? 5 : 0, hover: { size: 5 } },
        dataLabels: { enabled: false }, grid: { borderColor: '#e2e8f0', strokeDashArray: 4 },
        xaxis: { categories: this.trend.months.map(month => this.displayMonth(month)), labels: { trim: true, hideOverlappingLabels: true } },
        yaxis: { title: { text: 'Cumulative value ($)' }, labels: { formatter: value => this.axisMoney(value) } },
        tooltip: { shared: true, intersect: false, y: { formatter: value => this.chartMoney(value) } },
        legend: { position: 'top', horizontalAlign: 'left', fontSize: '12px' },
        noData: { text: 'No valid totals to plot' }
      };
    },
    tableColumns() {
      const columns = [{ field: 'project', label: 'Project name' }];
      if (this.view === 'records') columns.push({ field: 'date', label: 'Month end' }, { field: 'source', label: 'Source' });
      columns.push(...this.metrics.map(metric => ({ field: metric.field, label: metric.label, money: true })));
      if (this.view === 'projects' && this.showBreakdown) columns.push({ field: 'onPrem', label: 'On Prem Values', money: true }, { field: 'databricks', label: 'Databricks Values', money: true });
      return [...columns, { field: 'total', label: 'Total value', money: true }];
    },
    tableRows() {
      const rows = this.view === 'projects' ? this.summary.projects.map(project => ({ ...project, key: project.code })) : this.filteredRows;
      const direction = this.sortDirection === 'asc' ? 1 : -1;
      const column = this.tableColumns.find(item => item.field === this.sortField) || this.tableColumns[0];
      return [...rows].sort((a, b) => {
        let compared;
        if (column.money) {
          const left = this.entryCell(a, column.field), right = this.entryCell(b, column.field);
          const missingLeft = left.invalid || !left.amount, missingRight = right.invalid || !right.amount;
          if (!!missingLeft !== !!missingRight) return missingLeft ? 1 : -1;
          compared = compareTotals(left, right);
        } else {
          const left = column.field === 'project' ? this.projectName(a) : a[column.field];
          const right = column.field === 'project' ? this.projectName(b) : b[column.field];
          compared = String(left).localeCompare(String(right), undefined, { numeric: true });
        }
        return compared * direction || this.projectName(a).localeCompare(this.projectName(b)) || a.key.localeCompare(b.key, undefined, { numeric: true });
      });
    },
    pageCount() { return Math.max(1, Math.ceil(this.tableRows.length / this.pageSize)); },
    pagedRows() { return this.tableRows.slice((this.page - 1) * this.pageSize, this.page * this.pageSize); },
    firstRow() { return this.tableRows.length ? (this.page - 1) * this.pageSize + 1 : 0; },
    lastRow() { return Math.min(this.page * this.pageSize, this.tableRows.length); }
  },
  watch: {
    filteredRows() { this.page = 1; },
    pageSize() { this.page = 1; },
    showBreakdown(show) { if (!show && ['onPrem', 'databricks'].includes(this.sortField)) { this.sortField = 'total'; this.sortDirection = 'desc'; } }
  },
  mounted() { this.refreshBoth(); },
  beforeUnmount() {
    this.disposed = true;
    this.requestId += 1;
    this.controller?.abort();
    this.$emit('busy-change', false);
  },
  methods: {
    money: formatCombinedMoney,
    count(value) { return countFormatter.format(value); },
    sourceLabel(key) { return SOURCE_LABELS[key]; },
    statusLabel(status) { return { idle: 'Not loaded', loading: 'Loading…', ready: 'Loaded', error: 'Needs attention' }[status]; },
    displayMonth(month) { return monthFormatter.format(new Date(`${month}-01T00:00:00Z`)); },
    displayDate(date) { return dateFormatter.format(new Date(`${date}T00:00:00Z`)); },
    projectName(entry) { const code = entry.code || entry.projectCode; return this.names.get(code) || entry.name || entry.projectName || code; },
    sourceMoney(source) { return this.money(this.sourceCounts[source] ? this.summary.sources[source] : knownZero()); },
    entryCell(entry, field) {
      if (field === 'total') return entry.total;
      if (field === 'onPrem' || field === 'databricks') return entry.sourceCounts[field] ? entry.sources[field] : knownZero();
      return entry.metrics[field];
    },
    summaryCell(field) { return field === 'total' ? this.summary.total : field === 'onPrem' || field === 'databricks' ? this.sourceCounts[field] ? this.summary.sources[field] : knownZero() : this.summary.metrics[field]; },
    chartMoney(value) { return value === null || value === undefined || !Number.isFinite(value) ? '—' : this.money({ amount: decimalAmount(value), count: 1, invalid: 0 }); },
    axisMoney(value) {
      if (!Number.isFinite(value)) return '';
      const absolute = Math.abs(value);
      const scale = absolute >= 1000000 ? 1000000 : absolute >= 1000 ? 1000 : 1;
      const unit = scale === 1000000 ? 'm' : scale === 1000 ? 'k' : '';
      return `${value < 0 ? '-' : ''}$${new Intl.NumberFormat('en-US', { maximumFractionDigits: scale === 1 ? 0 : 1 }).format(absolute / scale)}${unit}`;
    },
    resetFilters() { this.project = ''; this.source = ''; this.search = ''; this.from = ''; this.to = ''; this.page = 1; },
    setView(view) { this.view = view; this.page = 1; this.sortField = view === 'projects' ? 'total' : 'date'; this.sortDirection = 'desc'; },
    sortBy(field) {
      if (this.sortField === field) this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      else { this.sortField = field; this.sortDirection = field === 'total' || field === 'date' ? 'desc' : 'asc'; }
      this.page = 1;
    },
    async refreshBoth() {
      if (this.busy) return;
      const requestId = ++this.requestId;
      this.controller?.abort();
      this.controller = new AbortController();
      this.busy = true;
      this.error = ''; this.sourceErrors = {}; this.notice = ''; this.exportError = '';
      this.$emit('busy-change', true);
      const isCurrent = () => !this.disposed && requestId === this.requestId;
      const base = (process.env.VUE_APP_API_URL || '').replace(/\/+$/, '');
      try {
        const snapshot = await loadCombinedValues(this.apiFetch, {
          onPremEndpoint: this.onPremEndpoint || `${base}/api/project-values`,
          databricksEndpoint: this.databricksEndpoint || `${base}/api/databricks/project-values`,
          signal: this.controller.signal,
          onStatus: (source, status) => { if (isCurrent()) this.sourceStatus[source] = status; }
        });
        if (!isCurrent()) return;
        // Replace the two-source snapshot together; never mix refresh attempts.
        this.rows = snapshot.rows;
        this.fetchedAt = snapshot.fetchedAt;
        this.loaded = true;
      } catch (error) {
        if (!isCurrent() || error.name === 'AbortError') return;
        this.error = error.message || 'Could not load combined values.';
        const sourceErrors = error.sourceErrors || {};
        this.sourceErrors = Object.fromEntries(Object.entries(sourceErrors).map(([source, failure]) => [source, failure.message]));
        if (!localStorage.getItem('token') || Object.values(sourceErrors).some(failure => failure.status === 401 || failure.code === 'GUI_LOGIN_REQUIRED')) {
          this.rows = []; this.loaded = false; this.fetchedAt = '';
        }
      } finally {
        if (isCurrent()) { this.busy = false; this.controller = null; this.$emit('busy-change', false); }
      }
    },
    exportExcel() {
      if (this.busy || !this.loaded || !this.filteredRows.length) return;
      this.exportError = '';
      try {
        const projectHeaders = ['Project name', ...this.metrics.map(metric => metric.label), 'On Prem Values', 'Databricks Values', 'Total value'];
        const projects = [...this.summary.projects].sort((a, b) => this.projectName(a).localeCompare(this.projectName(b))).map(entry => [this.projectName(entry), ...this.metrics.map(metric => exportCombinedMoney(entry.metrics[metric.field])), exportCombinedMoney(entry.sourceCounts.onPrem ? entry.sources.onPrem : knownZero()), exportCombinedMoney(entry.sourceCounts.databricks ? entry.sources.databricks : knownZero()), exportCombinedMoney(entry.total)]);
        const recordHeaders = ['Project name', 'Month end', 'Source', ...this.metrics.map(metric => metric.label), 'Total value'];
        const records = [...this.filteredRows].sort((a, b) => b.date.localeCompare(a.date) || this.projectName(a).localeCompare(this.projectName(b))).map(entry => [this.projectName(entry), entry.date, this.sourceLabel(entry.source), ...this.metrics.map(metric => exportCombinedMoney(entry.metrics[metric.field])), exportCombinedMoney(entry.total)]);
        const scope = [['Combined Values'], ['Scope', this.scopeLabel], ['Search', this.search || 'None'], ['Complete refresh', this.fetchedAt], ['Matching projects', this.summary.projects.length], ['Monthly source records', this.filteredRows.length], ['On Prem Values', exportCombinedMoney(this.sourceCounts.onPrem ? this.summary.sources.onPrem : knownZero())], ['Databricks Values', exportCombinedMoney(this.sourceCounts.databricks ? this.summary.sources.databricks : knownZero())], ...this.metrics.map(metric => [metric.label, exportCombinedMoney(this.summary.metrics[metric.field])]), ['Combined total', exportCombinedMoney(this.summary.total)], ['Calculation', 'All matching monthly source records are included. Project-months appearing in both sources include both contributions.']];
        const workbook = XLSX.utils.book_new();
        [[scope, 'Summary', -1], [[projectHeaders, ...projects], 'Project totals', 1], [[recordHeaders, ...records], 'Source records', 3]].forEach(([data, name, moneyStart]) => {
          const sheet = XLSX.utils.aoa_to_sheet(data);
          sheet['!cols'] = data[0].map((label, index) => ({ wch: index === 0 ? 38 : Math.max(String(label).length + 2, 23) }));
          if (moneyStart >= 0) {
            sheet['!autofilter'] = { ref: sheet['!ref'] };
            for (let row = 1; row < data.length; row += 1) for (let column = moneyStart; column < data[0].length; column += 1) {
              const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
              if (cell?.t === 'n') cell.z = '$#,##0.00;[Red]($#,##0.00)';
            }
          } else sheet['!cols'] = [{ wch: 30 }, { wch: 85 }];
          XLSX.utils.book_append_sheet(workbook, sheet, name);
        });
        XLSX.writeFile(workbook, `Combined_Project_Values_${new Date().toISOString().slice(0, 10)}.xlsx`);
        this.notice = `Exported ${this.count(this.summary.projects.length)} project totals and all ${this.count(this.filteredRows.length)} matching source records.`;
      } catch { this.notice = ''; this.exportError = 'Excel export failed. Please try again.'; }
    }
  }
};
</script>

<style scoped>
.combined-values { color: #1f3b64; background: #fff; border: 1px solid #dbe3ed; border-radius: 14px; padding: 24px; min-width: 0; font-family: Arial, Helvetica, sans-serif; }
.combined-values *, .combined-values *::before, .combined-values *::after { box-sizing: border-box; }
.cv-header, .cv-actions, .cv-status-row, .cv-filter-heading, .cv-scope, .cv-panel-heading, .cv-table-toolbar, .cv-pagination, .cv-pagination nav { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.cv-header { align-items: flex-start; justify-content: space-between; gap: 20px; }
.cv-header > div:first-child, .cv-panel-heading > div, .cv-table-toolbar > div { min-width: 0; }
.cv-eyebrow { display: block; color: #53647a; font-size: .69rem; font-weight: 700; letter-spacing: .12em; margin-bottom: 8px; }
.cv-header h3 { margin: 0; color: #123454; font-size: 1.45rem; line-height: 1.3; }
.cv-header p, .cv-panel-heading p, .cv-table-toolbar p { margin: 7px 0 0; color: #53647a; font-size: .88rem; line-height: 1.5; }
.cv-button, .cv-page-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 42px; padding: 9px 15px; border: 1px solid #1f5fa8; border-radius: 7px; background: #1f5fa8; color: #fff; font: inherit; font-size: .88rem; font-weight: 600; cursor: pointer; }
.cv-button svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.cv-secondary { color: #1f5fa8; background: #fff; border-color: #aabbd0; }
.cv-button:hover:not(:disabled) { background: #184f8d; border-color: #184f8d; color: #fff; }
.cv-secondary:hover:not(:disabled) { background: #edf4fc; color: #184f8d; border-color: #1f5fa8; }
.combined-values button:disabled { opacity: .55; cursor: not-allowed; }
.combined-values button:focus-visible, .combined-values input:focus-visible, .combined-values select:focus-visible, .cv-table-scroll:focus-visible { outline: 3px solid #b77900; outline-offset: 3px; }
.cv-status-row { color: #53647a; font-size: .78rem; margin: 20px 0 16px; gap: 8px 12px; }
.cv-source-status { display: inline-flex; align-items: center; gap: 7px; background: #f0f3f7; color: #47576b; border-radius: 20px; padding: 6px 10px; font-weight: 600; }
.cv-status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.cv-status-description { font-weight: 400; }
.cv-status-ready { background: #e9f7f1; color: #116149; }.cv-status-loading { background: #edf4ff; color: #1d4e8a; }.cv-status-error { background: #fff1f1; color: #9c2525; }
.cv-updated { margin-left: auto; }
.cv-loading { margin: 16px 0; padding: 14px 16px; background: #f0f6ff; color: #244e7d; border: 1px solid #cedff4; border-radius: 8px; font-size: .85rem; }
.cv-loading p, .cv-alert p { margin: 0; line-height: 1.5; }.cv-alert p + p { margin-top: 6px; }
.cv-loading-track { height: 3px; background: #d8e5f6; overflow: hidden; border-radius: 3px; margin-top: 12px; }
.cv-loading-track span { display: block; width: 35%; height: 100%; background: #1f5fa8; animation: cv-loading 1.6s ease-in-out infinite; }
@keyframes cv-loading { from { transform: translateX(-100%); } to { transform: translateX(390%); } }
.cv-alert { margin: 16px 0; padding: 14px 16px; border: 1px solid; border-radius: 8px; font-size: .84rem; line-height: 1.5; overflow-wrap: anywhere; }
.cv-alert ul { padding-left: 18px; margin: 8px 0; }.cv-error { color: #9c2525; border-color: #e5b6b6; background: #fff7f7; }.cv-warning { color: #78510c; border-color: #e5ca8e; background: #fffbf0; }
.cv-notice { font-size: .83rem; color: #116149; }
.cv-filters { background: #f7f9fc; border: 1px solid #e0e7f0; border-radius: 9px; padding: 16px; }
.cv-filter-heading { justify-content: space-between; margin-bottom: 12px; min-height: 28px; }.cv-filter-heading h4 { margin: 0; font-size: .9rem; }
.cv-filter-grid { display: grid; grid-template-columns: minmax(140px, 1.2fr) minmax(190px, 1.6fr) repeat(3, minmax(135px, 1fr)); gap: 12px; }
.cv-field { display: flex; flex-direction: column; gap: 7px; color: #42536b; font-size: .8rem; font-weight: 600; min-width: 0; }
.cv-field input, .cv-field select, .cv-page-size select { display: block; min-height: 40px; width: 100%; min-width: 0; padding: 8px 10px; border: 1px solid #aabbd0; border-radius: 6px; background: #fff; color: #243e60; font: inherit; font-weight: 400; }
.cv-field-error { color: #9c2525; font-size: .84rem; margin: 12px 0 0; }
.cv-text-button { border: 0; border-radius: 4px; padding: 6px 2px; min-height: 32px; background: transparent; color: #1f5fa8; cursor: pointer; font: inherit; font-size: .8rem; font-weight: 600; }.cv-text-button:hover { text-decoration: underline; }
.cv-scope { justify-content: space-between; margin: 18px 0 12px; color: #53647a; font-size: .8rem; line-height: 1.5; }.cv-scope strong { color: #314b69; }.cv-scope strong > span { margin: 0 6px; }
.cv-total-panel { display: grid; grid-template-columns: minmax(250px, 1.5fr) repeat(2, minmax(180px, 1fr)); background: #f2f6fc; border: 1px solid #d9e3ef; border-radius: 11px; padding: 24px; gap: 24px; margin-bottom: 16px; }
.cv-total-main, .cv-source-contribution { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.cv-total-main > span { color: #42536b; font-size: .85rem; font-weight: 600; }.cv-total-main strong { font-size: clamp(1.7rem, 2.6vw, 2.3rem); color: #0a2d55; line-height: 1.2; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.cv-total-main small, .cv-source-contribution small { color: #53647a; font-size: .76rem; line-height: 1.5; }
.cv-source-contribution { justify-content: center; border-left: 1px solid #c7d4e3; padding-left: 24px; }.cv-source-contribution > span { color: #42536b; font-size: .8rem; display: flex; align-items: center; gap: 8px; }.cv-source-contribution strong { font-size: 1.4rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.cv-source-contribution i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }.cv-onprem-dot { background: #117a65; }.cv-cloud-dot { background: #2563eb; }
.cv-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
.cv-kpi { padding: 18px; border: 1px solid #dce4ee; border-top: 3px solid var(--metric-color); border-radius: 9px; min-width: 0; }.cv-kpi h4 { color: #42536b; font-size: .8rem; font-weight: 600; margin: 0 0 10px; }.cv-kpi > strong { display: block; color: var(--metric-color); font-size: 1.35rem; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }.cv-kpi > span { display: block; font-size: .73rem; color: #53647a; margin-top: 8px; line-height: 1.5; }
.cv-chart-panel, .cv-table-panel { border: 1px solid #dce4ee; border-radius: 10px; background: #fff; min-width: 0; }.cv-chart-panel { padding: 18px 18px 0; margin-bottom: 20px; }.cv-panel-heading, .cv-table-toolbar { justify-content: space-between; align-items: flex-start; }.cv-panel-heading h4, .cv-table-toolbar h4 { margin: 0; font-size: .95rem; }.cv-period { color: #53647a; font-size: .78rem; padding-top: 3px; }
.cv-table-toolbar { padding: 18px; }.cv-table-toolbar h4 > span { display: inline-block; margin-left: 5px; border-radius: 20px; background: #edf3fa; padding: 3px 8px; color: #42536b; font-size: .72rem; }.cv-table-toolbar p { font-size: .78rem; }
.cv-view-switch { display: inline-flex; border: 1px solid #aabbd0; border-radius: 7px; padding: 3px; gap: 3px; }.cv-view-switch button { border: 0; background: transparent; color: #42536b; font: inherit; font-size: .78rem; cursor: pointer; min-height: 34px; padding: 7px 11px; border-radius: 4px; }.cv-view-switch button[aria-pressed="true"] { color: #fff; background: #1f5fa8; }
.cv-checkbox { display: flex; align-items: center; width: fit-content; gap: 8px; margin: 0 18px 16px; color: #42536b; font-size: .78rem; cursor: pointer; }.cv-checkbox input { width: 16px; height: 16px; margin: 0; accent-color: #1f5fa8; }
.cv-table-scroll { width: 100%; max-height: 540px; overflow: auto; border-top: 1px solid #e0e7ef; }
.cv-table-scroll table { width: 100%; min-width: 1010px; border-collapse: collapse; table-layout: auto; font-size: .8rem; background: #fff; }.cv-table-scroll th, .cv-table-scroll td { padding: 13px 15px; border-bottom: 1px solid #e5ebf2; text-align: left; white-space: nowrap; overflow: visible; text-overflow: clip; }.cv-table-scroll th { position: sticky; top: 0; z-index: 1; background: #f3f6fa; color: #42536b; font-size: .73rem; font-weight: 600; }.cv-table-scroll tbody tr:hover { background: #f7faff; }.cv-table-scroll .cv-numeric { text-align: right; font-variant-numeric: tabular-nums; }.cv-total-cell { color: #0a2d55; font-weight: 700; }.cv-table-scroll tfoot td { font-weight: 700; color: #0a2d55; background: #eef4fc; }
.cv-sort { display: inline-flex; width: 100%; justify-content: space-between; align-items: center; gap: 10px; padding: 3px 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: inherit; cursor: pointer; }.cv-numeric .cv-sort { justify-content: flex-end; }.cv-sort > span:last-child { color: #53647a; font-size: .8rem; }
.cv-project-name { display: block; min-width: 180px; max-width: 300px; white-space: normal; line-height: 1.45; color: #244566; font-weight: 600; overflow-wrap: anywhere; }.cv-row-meta { display: block; margin-top: 4px; color: #53647a; font-size: .71rem; }.cv-row-meta > span { margin: 0 3px; }
.cv-source-badge { display: inline-block; padding: 4px 7px; border-radius: 5px; font-size: .7rem; font-weight: 600; }.cv-badge-onPrem { background: #e8f5ef; color: #116149; }.cv-badge-databricks { background: #edf3ff; color: #1b4a98; }
.cv-empty { padding: 40px 24px; color: #53647a; text-align: center; font-size: .88rem; line-height: 1.6; }.cv-empty strong { color: #314b69; }.cv-empty p { margin: 7px 0 16px; }
.cv-pagination { justify-content: space-between; padding: 15px 18px; color: #53647a; font-size: .76rem; gap: 12px; }.cv-page-size { display: flex; align-items: center; gap: 9px; }.cv-page-size select { width: 70px; min-height: 34px; padding: 5px 8px; }.cv-pagination nav { gap: 10px; }.cv-page-button { min-height: 32px; min-width: 32px; padding: 5px; background: #fff; border-color: #aabbd0; color: #1f5fa8; font-size: 1.1rem; }.cv-footnote { font-size: .75rem; color: #53647a; line-height: 1.6; margin: 14px 0 0; }
.cv-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 1100px) { .cv-filter-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }.cv-search-field, .cv-project-field { grid-column: span 3; }.cv-field:not(.cv-search-field):not(.cv-project-field) { grid-column: span 2; }.cv-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }.cv-total-panel { gap: 20px; padding: 20px; grid-template-columns: minmax(200px, 1.3fr) repeat(2, minmax(150px, 1fr)); }.cv-source-contribution { padding-left: 20px; } }
@media (max-width: 760px) { .combined-values { padding: 16px; }.cv-total-panel { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }.cv-total-main { grid-column: 1 / -1; }.cv-source-contribution { padding-left: 0; border-left: 0; border-top: 1px solid #c7d4e3; padding-top: 16px; }.cv-source-contribution strong { font-size: 1.2rem; }.cv-updated { margin-left: 0; width: 100%; }.cv-pagination { justify-content: flex-start; } }
@media (max-width: 480px) { .combined-values { padding: 12px; }.cv-filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.cv-search-field, .cv-project-field { grid-column: 1 / -1; }.cv-field:not(.cv-search-field):not(.cv-project-field) { grid-column: span 1; }.cv-field[for="cv-source"] { grid-column: 1 / -1 !important; }.cv-actions { width: 100%; }.cv-actions .cv-button { flex: 1; padding: 9px; font-size: .8rem; }.cv-kpis { gap: 10px; }.cv-kpi { padding: 13px; }.cv-kpi > strong { font-size: 1.1rem; }.cv-kpi h4 { min-height: 32px; line-height: 1.4; }.cv-total-panel { padding: 16px; gap: 16px; }.cv-chart-panel { padding: 14px 8px 0; }.cv-table-toolbar { padding: 14px; }.cv-view-switch { width: 100%; }.cv-view-switch button { flex: 1; }.cv-pagination { padding: 14px; } }
@media (prefers-reduced-motion: reduce) { .cv-loading-track span { animation: none; width: 100%; } }
</style>
