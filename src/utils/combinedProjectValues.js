// Monthly amounts from the existing read endpoints. No database writes occur here.
export const COMBINED_METRICS = Object.freeze([
  { field: 'capacity_improvement', label: 'Capacity Improvement', shortLabel: 'Capacity', color: '#2563EB' },
  { field: 'yield_savings', label: 'Yield Savings', shortLabel: 'Yield', color: '#117A65' },
  { field: 'people_productivity', label: 'People Productivity', shortLabel: 'People', color: '#124076' },
  { field: 'quality_improvement', label: 'Quality Improvement', shortLabel: 'Quality', color: '#6C3483' }
]);

export const SOURCE_LABELS = Object.freeze({ onPrem: 'On Prem Values', databricks: 'Databricks Values' });
const powerOfTen = scale => BigInt(10) ** BigInt(scale);
const missing = value => value === null || value === undefined || typeof value === 'string' && !value.trim();

// Keep decimal arithmetic exact for cards, tables and exports. Convert to Number
// only when passing coordinates to the chart library.
export function decimalAmount(value) {
  if (missing(value) || !['number', 'string'].includes(typeof value)) return null;
  const text = String(value).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match || !Number.isFinite(Number(text))) return null;
  const exponent = Number(match[4] || 0);
  if (Math.abs(exponent) > 30 || match[2].length + (match[3] || '').length > 60) return null;
  let coefficient = BigInt(match[2] + (match[3] || '')) * (match[1] === '-' ? BigInt(-1) : BigInt(1));
  let scale = (match[3] || '').length - exponent;
  if (scale < 0) { coefficient *= powerOfTen(-scale); scale = 0; }
  return { coefficient, scale };
}

export function addAmounts(left, right) {
  if (!left) return right;
  if (!right) return left;
  const scale = Math.max(left.scale, right.scale);
  return { coefficient: left.coefficient * powerOfTen(scale - left.scale) + right.coefficient * powerOfTen(scale - right.scale), scale };
}

export function emptyTotal() { return { amount: null, count: 0, invalid: 0 }; }

function addTotal(target, value) {
  target.amount = addAmounts(target.amount, value.amount);
  target.count += value.count;
  target.invalid += value.invalid;
  return target;
}

function moneyParts(amount) {
  let value = amount.coefficient;
  const negative = value < BigInt(0);
  if (negative) value = -value;
  if (amount.scale < 2) value *= powerOfTen(2 - amount.scale);
  else if (amount.scale > 2) {
    const divisor = powerOfTen(amount.scale - 2);
    const remainder = value % divisor;
    value /= divisor;
    if (remainder * BigInt(2) >= divisor) value += BigInt(1);
  }
  const text = value.toString().padStart(3, '0');
  return { sign: negative && value !== BigInt(0) ? '-' : '', whole: text.slice(0, -2), fraction: text.slice(-2) };
}

export function formatCombinedMoney(total) {
  if (total.invalid) return 'Check values';
  if (!total.amount) return '—';
  const parts = moneyParts(total.amount);
  return `${parts.sign}$${parts.whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${parts.fraction}`;
}

export function exportCombinedMoney(total) {
  if (total.invalid) return 'Invalid value';
  if (!total.amount) return '';
  const parts = moneyParts(total.amount);
  const value = `${parts.sign}${parts.whole}.${parts.fraction}`;
  // Excel preserves only 15 significant digits. Retain larger amounts as text.
  return (parts.whole + parts.fraction).replace(/^0+/, '').length > 15 ? value : Number(value);
}

export function chartValue(total) {
  return total.invalid || !total.amount ? null : Number(total.amount.coefficient) / (10 ** total.amount.scale);
}

export function compareTotals(left, right) {
  const a = left.invalid ? null : left.amount, b = right.invalid ? null : right.amount;
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  const scale = Math.max(a.scale, b.scale);
  const difference = a.coefficient * powerOfTen(scale - a.scale) - b.coefficient * powerOfTen(scale - b.scale);
  return difference < BigInt(0) ? -1 : difference > BigInt(0) ? 1 : 0;
}

export function monthEndKey(value) {
  const text = String(value ?? '').trim();
  let candidate = text.slice(0, 10);
  const display = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (display) candidate = `${display[3]}-${display[2]}-${display[1]}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return '';
  const date = new Date(`${candidate}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : '';
}

export function normalizeCombinedRows(rows, source) {
  if (!Array.isArray(rows)) throw new Error(`${SOURCE_LABELS[source]} returned an unexpected response.`);
  return rows.map((row, index) => {
    const label = `${SOURCE_LABELS[source]} record ${index + 1}`;
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`${label} is not a valid record.`);
    if (typeof row.project_code !== 'string' || !row.project_code.trim()) throw new Error(`${label} has no project code.`);
    const date = monthEndKey(row.month_end);
    if (!date) throw new Error(`${label} has an invalid month-end date.`);
    const metrics = {};
    const total = emptyTotal();
    COMBINED_METRICS.forEach(metric => {
      if (!Object.prototype.hasOwnProperty.call(row, metric.field)) throw new Error(`${label} is missing ${metric.label}.`);
      const raw = row[metric.field], amount = decimalAmount(raw);
      const cell = { amount, count: amount ? 1 : 0, invalid: !missing(raw) && !amount ? 1 : 0 };
      metrics[metric.field] = cell;
      addTotal(total, cell);
    });
    const code = row.project_code.trim();
    const name = typeof row.project_name === 'string' && row.project_name.trim() ? row.project_name.trim() : code;
    return { key: `${source}-${index}`, source, projectCode: code, projectName: name, date, month: date.slice(0, 7), metrics, total };
  });
}

export function projectChoices(rows) {
  const names = new Map();
  rows.forEach(row => {
    if (!names.has(row.projectCode) || names.get(row.projectCode) === row.projectCode) names.set(row.projectCode, row.projectName);
  });
  const counts = new Map();
  names.forEach(name => counts.set(name, (counts.get(name) || 0) + 1));
  return [...names].map(([code, name]) => ({ code, name, label: counts.get(name) > 1 ? `${name} (${code})` : name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.code.localeCompare(b.code));
}

export function filterCombinedRows(rows, { project = '', source = '', from = '', to = '', search = '' } = {}) {
  if (from && to && from > to) return [];
  const term = search.trim().toLocaleLowerCase();
  return rows.filter(row => (!project || row.projectCode === project) && (!source || row.source === source) &&
    (!from || row.month >= from) && (!to || row.month <= to) && (!term || [row.projectName, row.projectCode, row.date, SOURCE_LABELS[row.source]]
      .concat(COMBINED_METRICS.map(metric => formatCombinedMoney(row.metrics[metric.field]))).join(' ').toLocaleLowerCase().includes(term)));
}

export function summarizeCombinedRows(rows) {
  const metrics = Object.fromEntries(COMBINED_METRICS.map(metric => [metric.field, emptyTotal()]));
  const sources = { onPrem: emptyTotal(), databricks: emptyTotal() };
  const total = emptyTotal();
  const projects = new Map(), projectMonths = new Map();
  rows.forEach(row => {
    if (!projects.has(row.projectCode)) projects.set(row.projectCode, {
      code: row.projectCode, name: row.projectName, months: new Set(), recordCount: 0,
      metrics: Object.fromEntries(COMBINED_METRICS.map(metric => [metric.field, emptyTotal()])),
      sources: { onPrem: emptyTotal(), databricks: emptyTotal() }, sourceCounts: { onPrem: 0, databricks: 0 }, total: emptyTotal()
    });
    const project = projects.get(row.projectCode);
    if (project.name === project.code) project.name = row.projectName;
    project.months.add(row.month);
    project.recordCount += 1;
    project.sourceCounts[row.source] += 1;
    COMBINED_METRICS.forEach(metric => {
      addTotal(metrics[metric.field], row.metrics[metric.field]);
      addTotal(project.metrics[metric.field], row.metrics[metric.field]);
    });
    addTotal(total, row.total);
    addTotal(sources[row.source], row.total);
    addTotal(project.total, row.total);
    addTotal(project.sources[row.source], row.total);
    const key = JSON.stringify([row.projectCode, row.month]);
    if (!projectMonths.has(key)) projectMonths.set(key, { onPrem: 0, databricks: 0 });
    projectMonths.get(key)[row.source] += 1;
  });
  const overlapping = [...projectMonths.values()].filter(counts => counts.onPrem && counts.databricks).length;
  const repeated = [...projectMonths.values()].filter(counts => counts.onPrem > 1 || counts.databricks > 1).length;
  return { metrics, sources, total, projects: [...projects.values()], overlapping, repeated };
}

export function cumulativeCombinedSeries(rows) {
  const monthly = new Map();
  rows.forEach(row => {
    if (!monthly.has(row.month)) monthly.set(row.month, { onPrem: emptyTotal(), databricks: emptyTotal(), total: emptyTotal(), records: { onPrem: 0, databricks: 0, total: 0 } });
    addTotal(monthly.get(row.month)[row.source], row.total);
    addTotal(monthly.get(row.month).total, row.total);
    monthly.get(row.month).records[row.source] += 1;
    monthly.get(row.month).records.total += 1;
  });
  const months = [...monthly.keys()].sort();
  const running = { onPrem: emptyTotal(), databricks: emptyTotal(), total: emptyTotal() };
  const data = { onPrem: [], databricks: [], total: [] };
  const records = { onPrem: 0, databricks: 0, total: 0 };
  months.forEach(month => {
    ['onPrem', 'databricks', 'total'].forEach(key => {
      addTotal(running[key], monthly.get(month)[key]);
      records[key] += monthly.get(month).records[key];
      // A source with no contributions so far is a known zero, not a failed load.
      data[key].push(running[key].invalid ? null : chartValue(running[key]) ?? (records[key] ? null : 0));
    });
  });
  return { months, data };
}

async function readSource(apiFetch, endpoint, source, signal) {
  const response = await apiFetch(endpoint, { signal, cache: 'no-store' });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(`${SOURCE_LABELS[source]} returned HTTP ${response.status} instead of JSON. Check the API URL.`);
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.message || `${SOURCE_LABELS[source]} could not be loaded (HTTP ${response.status}).`), { code: result.code, status: response.status });
  if (source === 'onPrem') return normalizeCombinedRows(result, source);
  if (!result || result.auth_mode !== 'server-cache' || result.server_managed !== true) throw new Error('Databricks Values requires the current server connection. Update the backend and retry.');
  const required = ['project_code', 'project_name', 'month_end', ...COMBINED_METRICS.map(metric => metric.field)];
  if (!Array.isArray(result.rows) || !Array.isArray(result.columns) || !required.every(field => result.columns.includes(field))) throw new Error('Databricks Values did not return the expected project names and KPI columns.');
  if (result.complete !== true || result.total_rows !== result.rows.length) throw new Error('Databricks Values did not return the complete table. Combined totals require all records.');
  return normalizeCombinedRows(result.rows, source);
}

export async function loadCombinedValues(apiFetch, { onPremEndpoint, databricksEndpoint, signal, onStatus = () => {} }) {
  const errors = {};
  const endpoints = { onPrem: onPremEndpoint, databricks: databricksEndpoint };
  const responses = await Promise.allSettled(Object.keys(endpoints).map(async source => {
    onStatus(source, 'loading');
    try {
      const rows = await readSource(apiFetch, endpoints[source], source, signal);
      onStatus(source, 'ready');
      return rows;
    } catch (error) {
      errors[source] = error;
      onStatus(source, error.name === 'AbortError' ? 'idle' : 'error');
      throw error;
    }
  }));
  if (signal?.aborted) throw Object.assign(new Error('Request cancelled.'), { name: 'AbortError' });
  if (responses.some(response => response.status === 'rejected')) throw Object.assign(new Error('Both sources must load successfully before combined totals can be updated.'), { sourceErrors: errors });
  return { rows: responses.flatMap(response => response.value), fetchedAt: new Date().toISOString() };
}
