import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

// The Vue CLI project uses CommonJS configuration. Import this pure ES module
// without changing the application's package type or adding a test dependency.
const source = await readFile(new URL('../src/utils/combinedProjectValues.js', import.meta.url), 'utf8');
const {
  COMBINED_METRICS, cumulativeCombinedSeries, decimalAmount, exportCombinedMoney,
  filterCombinedRows, formatCombinedMoney, loadCombinedValues, monthEndKey,
  normalizeCombinedRows, projectChoices, summarizeCombinedRows
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function record(code, date, values = {}, name = 'Project ' + code) {
  return { project_code: code, project_name: name, month_end: date,
    capacity_improvement: 0, yield_savings: 0, people_productivity: 0, quality_improvement: 0, ...values };
}
const onPrem = [
  record('PRJ-103', '2026-05-31', { capacity_improvement: '100.10', yield_savings: '20.20', quality_improvement: null }, 'AXI'),
  record('PRJ-104', '2026-05-31', { yield_savings: '-5.00' }, 'FlipChip'),
  record('PRJ-103', '2026-06-30', { capacity_improvement: 50 }, 'AXI')
];
const databricks = [
  record('PRJ-103', '2026-05-31T00:00:00.000Z', { capacity_improvement: 10, yield_savings: null, quality_improvement: '4.70' }, 'AXI'),
  record('PRJ-121', '2026-06-30T00:00:00.000Z', { capacity_improvement: '200.00' }, 'CVT')
];
const rows = () => [...normalizeCombinedRows(onPrem, 'onPrem'), ...normalizeCombinedRows(databricks, 'databricks')];
const cloudPayload = (records = databricks, overrides = {}) => ({
  auth_mode: 'server-cache', server_managed: true, complete: true,
  total_rows: records.length, columns: ['metric_id', 'project_code', 'project_name', 'month_end', ...COMBINED_METRICS.map(metric => metric.field)],
  rows: records, ...overrides
});
const response = (body, status = 200, contentType = 'application/json') => ({ ok: status >= 200 && status < 300, status,
  headers: { get: () => contentType }, json: async () => body });
const endpoints = { onPremEndpoint: '/api/project-values', databricksEndpoint: '/api/databricks/project-values' };

test('projects use project code, include both contributions and retain negative amounts', () => {
  const result = summarizeCombinedRows(rows());
  assert.equal(formatCombinedMoney(result.total), '$380.00');
  assert.equal(formatCombinedMoney(result.sources.onPrem), '$165.30');
  assert.equal(formatCombinedMoney(result.sources.databricks), '$214.70');
  assert.equal(formatCombinedMoney(result.projects.find(project => project.code === 'PRJ-103').total), '$185.00');
  assert.equal(formatCombinedMoney(result.projects.find(project => project.code === 'PRJ-104').total), '-$5.00');
  assert.equal(result.projects.length, 3);
  assert.equal(result.overlapping, 1);
  assert.equal(result.repeated, 0);
});

test('identical project names do not merge different codes', () => {
  const records = normalizeCombinedRows([record('A', '2026-05-31', { capacity_improvement: 1 }, 'Vision'), record('B', '2026-05-31', { capacity_improvement: 2 }, 'Vision')], 'onPrem');
  assert.equal(summarizeCombinedRows(records).projects.length, 2);
  assert.deepEqual(projectChoices(records).map(choice => choice.label), ['Vision (A)', 'Vision (B)']);
});

test('source, exact project and inclusive month filters define one scope for totals', () => {
  const filtered = filterCombinedRows(rows(), { project: 'PRJ-103', from: '2026-06', to: '2026-06' });
  assert.equal(filtered.length, 1);
  assert.equal(formatCombinedMoney(summarizeCombinedRows(filtered).total), '$50.00');
  assert.equal(formatCombinedMoney(summarizeCombinedRows(filterCombinedRows(rows(), { source: 'databricks' })).total), '$214.70');
  assert.equal(filterCombinedRows(rows(), { project: 'PRJ-10' }).length, 0);
  assert.equal(filterCombinedRows(rows(), { from: '2026-07', to: '2026-06' }).length, 0);
  assert.equal(filterCombinedRows(rows(), { search: 'CVT' }).length, 1);
});

test('the trend sums monthly amounts once before computing its running totals', () => {
  const result = cumulativeCombinedSeries(rows());
  assert.deepEqual(result.months, ['2026-05', '2026-06']);
  assert.deepEqual(result.data.total, [130, 380]);
  assert.deepEqual(result.data.onPrem, [115.3, 165.3]);
  assert.deepEqual(result.data.databricks, [14.7, 214.7]);
});

test('zero, missing and invalid amounts remain distinct', () => {
  const empty = record('A', '2026-05-31', Object.fromEntries(COMBINED_METRICS.map(metric => [metric.field, null])));
  const records = normalizeCombinedRows([empty, record('B', '2026-05-31'), record('C', '2026-05-31', { yield_savings: 'bad data' })], 'onPrem');
  assert.equal(formatCombinedMoney(records[0].total), '—');
  assert.deepEqual(cumulativeCombinedSeries([records[0]]).data.total, [null]);
  assert.deepEqual(cumulativeCombinedSeries([records[0]]).data.databricks, [0]);
  assert.equal(formatCombinedMoney(records[1].total), '$0.00');
  assert.equal(formatCombinedMoney(records[2].total), 'Check values');
  assert.equal(formatCombinedMoney(summarizeCombinedRows(records).metrics.yield_savings), 'Check values');
  assert.equal(formatCombinedMoney(summarizeCombinedRows(records).metrics.capacity_improvement), '$0.00');
  assert.deepEqual(cumulativeCombinedSeries(records).data.total, [null]);
});

test('decimal totals retain cents beyond floating point and Excel precision', () => {
  const records = normalizeCombinedRows([record('A', '2026-05-31', { capacity_improvement: '5000000000000.01' }), record('B', '2026-05-31', { capacity_improvement: '5000000000000.02' })], 'onPrem');
  const total = summarizeCombinedRows(records).total;
  assert.equal(formatCombinedMoney(total), '$10,000,000,000,000.03');
  assert.equal(exportCombinedMoney(total), '10000000000000.03');
  const small = normalizeCombinedRows([record('A', '2026-05-31', { capacity_improvement: 0.1, yield_savings: 0.2 })], 'onPrem');
  assert.equal(formatCombinedMoney(summarizeCombinedRows(small).total), '$0.30');
  assert.equal(exportCombinedMoney(summarizeCombinedRows(small).total), 0.3);
  assert.equal(formatCombinedMoney({ amount: decimalAmount('1.005'), count: 1, invalid: 0 }), '$1.01');
});

test('dates are normalized without timezone shifts and invalid records are not silently dropped', () => {
  assert.equal(monthEndKey('2026-05-31T00:00:00.000Z'), '2026-05-31');
  assert.equal(monthEndKey('31/05/2026'), '2026-05-31');
  assert.equal(monthEndKey('2026-02-30'), '');
  assert.throws(() => normalizeCombinedRows([record('A', '2026-02-30')], 'onPrem'), /invalid month-end/);
  const incomplete = record('A', '2026-05-31'); delete incomplete.yield_savings;
  assert.throws(() => normalizeCombinedRows([incomplete], 'databricks'), /missing Yield/);
});

test('within-source repeated project-months are counted and disclosed', () => {
  const repeated = normalizeCombinedRows([record('A', '2026-05-31', { yield_savings: 10 }), record('A', '2026-05-31', { yield_savings: 20 })], 'onPrem');
  const summary = summarizeCombinedRows(repeated);
  assert.equal(summary.repeated, 1);
  assert.equal(summary.overlapping, 0);
  assert.equal(formatCombinedMoney(summary.total), '$30.00');
});

test('a complete two-source load returns one snapshot including every row', async () => {
  const statuses = [];
  const snapshot = await loadCombinedValues(async endpoint => response(endpoint === endpoints.onPremEndpoint ? onPrem : cloudPayload()), { ...endpoints, onStatus: (source, status) => statuses.push([source, status]) });
  assert.equal(snapshot.rows.length, 5);
  assert.equal(formatCombinedMoney(summarizeCombinedRows(snapshot.rows).total), '$380.00');
  assert.equal(statuses.filter(([, status]) => status === 'ready').length, 2);
  assert.ok(Number.isFinite(Date.parse(snapshot.fetchedAt)));
});

test('an empty source is a successful load rather than a failed connection', async () => {
  const snapshot = await loadCombinedValues(async endpoint => response(endpoint === endpoints.onPremEndpoint ? [] : cloudPayload()), endpoints);
  assert.equal(snapshot.rows.length, 2);
  assert.equal(formatCombinedMoney(summarizeCombinedRows(snapshot.rows).total), '$214.70');
});

test('a partial or failed load never resolves to a new combined snapshot', async () => {
  const fetcher = async endpoint => endpoint === endpoints.onPremEndpoint ? response(onPrem) : response({ message: 'Warehouse unavailable' }, 503);
  await assert.rejects(loadCombinedValues(fetcher, endpoints), error => error.sourceErrors.databricks.message === 'Warehouse unavailable');
  await assert.rejects(loadCombinedValues(async endpoint => response(endpoint === endpoints.onPremEndpoint ? onPrem : cloudPayload(databricks, { complete: false, total_rows: 100 })), endpoints), error => /complete table/.test(error.sourceErrors.databricks.message));
  await assert.rejects(loadCombinedValues(async endpoint => response(endpoint === endpoints.onPremEndpoint ? onPrem : cloudPayload(databricks, { columns: ['project_code'] })), endpoints), error => /expected project names/.test(error.sourceErrors.databricks.message));
});

test('non-JSON responses, authentication failures and cancellation retain their failure semantics', async () => {
  await assert.rejects(loadCombinedValues(async () => response('', 404, 'text/html'), endpoints), error => /instead of JSON/.test(error.sourceErrors.onPrem.message));
  await assert.rejects(loadCombinedValues(async () => response({ code: 'GUI_LOGIN_REQUIRED', message: 'Session expired' }, 401), endpoints), error => error.sourceErrors.onPrem.code === 'GUI_LOGIN_REQUIRED');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(loadCombinedValues(async endpoint => response(endpoint === endpoints.onPremEndpoint ? onPrem : cloudPayload()), { ...endpoints, signal: controller.signal }), { name: 'AbortError' });
});
