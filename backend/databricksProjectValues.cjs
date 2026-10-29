'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { existsSync } = require('node:fs');
const { homedir } = require('node:os');
const path = require('node:path');
const { DBSQLClient } = require('@databricks/sql');

const runFile = promisify(execFile);
const TABLE = 'mds_prod_gold_experiment.uc_dev_projvalue.t_project_values_cloud';
const ROW_LIMIT = 100;

function appError(code, message, status = 503) {
  return Object.assign(new Error(message), { code, status });
}

function connectionSettings() {
  const host = process.env.DATABRICKS_SERVER_HOSTNAME || 'adb-2814849171309960.0.azuredatabricks.net';
  const httpPath = process.env.DATABRICKS_HTTP_PATH;
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || !httpPath || !/^\/[^\s]+$/.test(httpPath)) {
    throw appError('DATABRICKS_NOT_CONFIGURED', 'Set the backend DATABRICKS_HTTP_PATH to your warehouse HTTP path. The server hostname must not include https:// or a page URL.');
  }

  const windowsCli = path.join(homedir(), 'Tools', 'Databricks', 'databricks.exe');
  return {
    host,
    httpPath,
    profile: process.env.DATABRICKS_CONFIG_PROFILE || 'projectvalue',
    cli: process.env.DATABRICKS_CLI_PATH || (process.platform === 'win32' && existsSync(windowsCli) ? windowsCli : 'databricks')
  };
}

async function readProjectValues() {
  const config = connectionSettings();
  let accessToken;
  try {
    // CLI reads its own cache and refreshes tokens when necessary.
    // Run the backend as the same OS user who ran auth login.
    const { stdout } = await runFile(config.cli, [
      'auth', 'token', '--host', `https://${config.host}`, '--profile', config.profile
    ], { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 });
    accessToken = JSON.parse(stdout).access_token;
    if (typeof accessToken !== 'string' || !accessToken) throw new Error('Missing access token');
  } catch {
    // Do not log the child-process result: stdout can contain credentials.
    throw appError('DATABRICKS_LOGIN_REQUIRED', 'The backend could not obtain your Databricks login. Check DATABRICKS_CLI_PATH and run auth login for the configured workspace and profile under the same OS account.');
  }

  const client = new DBSQLClient();
  let session;
  let operation;
  try {
    await client.connect({ host: config.host, path: config.httpPath, token: accessToken });
    session = await client.openSession();
    // One fixed table and a bounded read. No SQL is accepted from the browser.
    // Fetch one extra row to tell the GUI when the preview is incomplete.
    operation = await session.executeStatement(`SELECT * FROM ${TABLE} LIMIT ${ROW_LIMIT + 1}`, { runAsync: true });
    const fetched = await operation.fetchAll();
    const rows = JSON.parse(JSON.stringify(fetched.slice(0, ROW_LIMIT), (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
    const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
    return {
      table: TABLE,
      columns,
      rows,
      row_limit: ROW_LIMIT,
      has_more: fetched.length > ROW_LIMIT,
      fetched_at: new Date().toISOString()
    };
  } catch {
    throw appError('DATABRICKS_QUERY_FAILED', 'Could not read the Databricks table. Check the warehouse HTTP path, warehouse availability, network access, and table permissions.', 502);
  } finally {
    // A cleanup failure must not hide a query failure or a valid result.
    for (const resource of [operation, session, client]) {
      if (resource) {
        try { await resource.close(); } catch { /* Connection is being discarded. */ }
      }
    }
  }
}

// Register this handler AFTER your existing JWT authentication middleware.
async function getProjectValues(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    return res.json(await readProjectValues());
  } catch (error) {
    return res.status(error.status || 502).json({
      code: error.code || 'DATABRICKS_QUERY_FAILED',
      message: error.message
    });
  }
}

module.exports = { readProjectValues, getProjectValues };

// Optional local smoke test: node databricksProjectValues.cjs
if (require.main === module) {
  require('dotenv').config();
  readProjectValues().then(result => {
    console.log(JSON.stringify({ table: result.table, rows_read: result.rows.length, columns: result.columns, has_more: result.has_more }, null, 2));
  }).catch(error => {
    console.error(`${error.code || 'DATABRICKS_QUERY_FAILED'}: ${error.message}`);
    process.exitCode = 1;
  });
}
