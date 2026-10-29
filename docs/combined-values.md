# Combined Values

The Project Value page now has an **On Prem Values** tab (renamed from Data Grid) and a new **Combined Values** tab.

## Install

Copy these complete source files into the existing frontend project:

- `src/views/project-values.vue`
- `src/components/CombinedProjectValues.vue`
- `src/utils/combinedProjectValues.js`

The existing `src/components/DatabricksProjectValues.vue` stays in place. The main view remains in `src/views`, matching the router's current import. No router, backend, database, package or environment change is required.

Rebuild the frontend with the existing production environment:

```powershell
npm run build
```

Deploy the generated `dist` contents beside `server.js`, as in the current server layout. For local development, restart `npm run serve`. Vue CLI reads `VUE_APP_API_URL` at build/start time.

## Data and scope

Combined Values reads the same complete datasets as the existing tabs:

- On Prem: `GET /api/project-values`
- Databricks: `GET /api/databricks/project-values`, using the existing server account and cloud Project Master join

It does not query Databricks `t_project_values`, the consolidated reporting view or a history table. It does not copy records into either database.

The combined value is the sum of Capacity Improvement, Yield Savings, People Productivity and Quality Improvement for all matching monthly source records. Projects are grouped by `project_code`; duplicate display names remain separate projects. All cards, the cumulative trend, project totals and exports use the same filters across every table page. The cumulative trend sums monthly amounts once and starts at the first matching month in the selected period.

Contributions from both sources are additive. If the same project and month occur in both, both amounts are included and the interface identifies the overlap. Multiple records in a single source for the same project and month are also identified. No undocumented deduplication or source-precedence rule is applied. Review Monthly records or the source breakdown before treating overlapping contributions as separate benefits.

Both requests must succeed before a new combined snapshot is displayed. The Databricks response must confirm completeness and a matching row count. If a refresh fails, the previous complete snapshot and its timestamp remain visible; a first failed load shows no combined total. Switching away cancels the browser request and prevents late updates. A warehouse query already submitted to the server may finish independently.

Missing and zero amounts remain distinct. Invalid amounts mark affected totals as `Check values`. Decimal addition remains exact for cards, tables and Excel output; conversion to JavaScript numbers occurs at the chart boundary. Excel keeps amounts exceeding its 15-digit numeric precision as text.

## Export

Excel contains three sheets: Summary, Project totals and Source records. Every matching record is exported, including records outside the visible table page. The existing PDF action captures the active dashboard as before; use Excel for the complete paginated dataset.

## Verification

The data and request checks use Node's built-in test runner without a new dependency:

```bash
node --test tests/combinedProjectValues.test.mjs
```

They cover project identity, additive source contributions, overlap disclosure, negative/zero/missing/invalid amounts, exact decimal addition, month normalization, filtered totals, cumulative totals, complete loads, failed/partial responses and cancellation.

### Verification performed for this update

- All 12 data and request tests passed using Node 24.22.1.
- The actual updated main-view template and new component template compiled and mounted in a Vue 3.5.28 custom renderer. The smoke check exercised authenticated source loading, combined totals, filtering, export input, the tab title and unmounting. Charts, the existing table, PDF and XLSX were test doubles in this check; it did not validate their production rendering or generated files.
- A full production build and ESLint run remain unverified: the environment rejected npm package downloads with HTTP 403. Browser layout verification also remains unverified because the Chromium download was blocked. Run `npm run lint` and `npm run build` in the existing project environment and check the Combined Values tab at desktop and narrow widths before deployment. The locked application Vue version is 3.5.21.
