require('dotenv').config();

const express = require('express');
const cors = require('cors');
const ldap = require('ldapjs');
const mysql = require('mysql2');
const path = require('path');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const { DBSQLClient } = require('@databricks/sql');
const { createHash, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const os = require('node:os');

const {
  getTraceId,
  traceStart,
  traceEnd,
  traceError
} = require('./trace');

const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 5001;
const LDAP_URL = process.env.LDAP_URL;
const BASE_DN = process.env.LDAP_BASE_DN;

const PROJECT_MASTER_TABLE = process.env.PROJECT_MASTER_TABLE || 't_project_master';
const PROJECT_VALUES_TABLE = process.env.PROJECT_VALUES_TABLE || 't_project_values';
const PROJECT_UNIT_COST_TABLE = process.env.PROJECT_UNIT_COST_TABLE || 't_project_unit_cost';
const ACCESS_TABLE = process.env.ACCESS_TABLE || 't_project_access';

const HISTORY_TABLE = 't_project_values_history'; 
const MASTER_HISTORY_TABLE = 't_project_master_history'; 

const app = express();

// Set this only to the addresses of the reverse proxies you control.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY.split(',').map(value => value.trim()).filter(Boolean));
}

app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:8080,http://localhost:8081,http://muasxv4005.mua.st.com:8888,https://muasxv4005.mua.st.com').split(',').map(value => value.trim()).filter(Boolean),
  credentials: true
}));

// Avoid caching Databricks connection state and data over either HTTP or HTTPS.
app.use('/api/databricks', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json());

// =====================================
// Trace middleware
// =====================================
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) {
    return next();
  }

  getTraceId(req);

  const isDatabricks = req.path.startsWith('/api/databricks');
  const trace = traceStart('HTTP_REQUEST', isDatabricks ? safeDatabricksTraceRequest(req) : req, {
    params: req.params,
    query: isDatabricks ? {} : req.query
  });

  res.setHeader('X-Trace-Id', req._traceId);

  res.on('finish', () => {
    traceEnd(trace, {
      statusCode: res.statusCode
    });
  });

  next();
});

// =====================================
// Serve frontend build
// =====================================
app.use(express.static(path.join(__dirname, 'dist')));

app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// =====================================
// DB connections
// =====================================

// Original DB Connection (For Weekly Dashboard)
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});



// =====================================
// Helpers
// =====================================

function queryPromise(sql, params = [], req = null) {
  const trace = traceStart('queryPromise', req, {
    sqlPreview: typeof sql === 'string'
      ? sql.replace(/\s+/g, ' ').trim().slice(0, 200)
      : null,
    paramCount: Array.isArray(params) ? params.length : 0
  });

  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) {
        traceError(trace, err, {
          sqlPreview: typeof sql === 'string'
            ? sql.replace(/\s+/g, ' ').trim().slice(0, 200)
            : null
        });
        return reject(err);
      }

      traceEnd(trace, {
        rowCount: Array.isArray(results) ? results.length : undefined,
        affectedRows: results?.affectedRows
      });

      resolve(results);
    });
  });
}



function safeUnlink(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
}

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getCurrentUser(req) {
  return req?.user?.username || 'system';
}

function parseStandardDate(value) {
  if (!value) return null;

  if (typeof value === 'number') {
    const excelEpochUTC = Date.UTC(1899, 11, 30);
    const dateUTC = new Date(excelEpochUTC + value * 86400000);
    return dateUTC.toISOString().split('T')[0];
  }

  let str = String(value).trim();
  str = str.substring(0, 10); 

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  
  const matchDDMM = str.match(/^(\d{1,2})[\s\-\/](\d{1,2})[\s\-\/](\d{2}|\d{4})$/);
  if (matchDDMM) {
    const day = matchDDMM[1].padStart(2, '0');
    const month = matchDDMM[2].padStart(2, '0');
    let year = matchDDMM[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${month}-${day}`; 
  }

  const matchYYYY = str.match(/^(\d{4})[\s\-\/](\d{1,2})[\s\-\/](\d{1,2})$/);
  if (matchYYYY) {
    const year = matchYYYY[1];
    const month = matchYYYY[2].padStart(2, '0');
    const day = matchYYYY[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const fallbackDate = new Date(str);
  if (!isNaN(fallbackDate.getTime())) {
    const year = fallbackDate.getFullYear();
    const month = String(fallbackDate.getMonth() + 1).padStart(2, '0');
    const day = String(fallbackDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return str; 
}

async function getTableColumns(tableName, req = null) {
  const rows = await queryPromise(
    `
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `,
    [process.env.DB_NAME, tableName],
    req
  );

  return rows.map(r => r.COLUMN_NAME);
}

async function findProjectByCode(projectCode, req = null) {
  if (!projectCode) return null;

  const rows = await queryPromise(
    `
      SELECT
        project_code,
        project_name,
        project_description,
        project_type,
        use_case_investment,
        project_status
      FROM ${PROJECT_MASTER_TABLE}
      WHERE project_code = ?
      LIMIT 1
    `,
    [projectCode],
    req
  );

  return rows[0] || null;
}

async function findProjectByName(projectName, req = null) {
  if (!projectName) return null;

  const rows = await queryPromise(
    `
      SELECT
        project_code,
        project_name,
        project_description,
        project_type,
        use_case_investment,
        project_status
      FROM ${PROJECT_MASTER_TABLE}
      WHERE project_name = ?
      LIMIT 1
    `,
    [projectName],
    req
  );

  return rows[0] || null;
}

async function resolveProject(req, body) {
  const projectCode = normalizeText(body.project_code);
  const projectName = normalizeText(body.project_name);

  if (projectCode) {
    return await findProjectByCode(projectCode, req);
  }

  if (projectName) {
    return await findProjectByName(projectName, req);
  }

  return null;
}

function validateProjectMasterPayload(payload) {
  if (!payload.project_code) return 'project_code is required.';
  if (!payload.project_name) return 'project_name is required.';
  if (!payload.project_type) return 'project_type is required.';
  return '';
}

function validateProjectValuePayload(payload) {
  if (!payload.project_code && !payload.project_name) {
    return 'project_code or project_name is required.';
  }

  if (
    payload.capacity_improvement === null &&
    payload.people_productivity === null &&
    payload.quality_improvement === null &&
    payload.yield_savings === null
  ) {
    return 'At least one KPI metric (Capacity, People, Quality, or Yield) must be provided.';
  }

  return '';
}

// =====================================
// Auth
// =====================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    const sessionKey = createHash('sha256').update(token).digest('hex');
    if (err) {
      forgetDatabricksSession(sessionKey);
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }
    if (revokedGuiSessions.has(sessionKey)) {
      return res.status(401).json({ message: 'Session ended. Please log in again.' });
    }

    req.user = user;
    req.authSessionKey = sessionKey;
    next();
  });
}

async function requireAdmin(req, res, next) {
  if (req.user?.access_right !== 'admin') {
    return res.status(403).json({ message: 'Forbidden: Admins only.' });
  }

  // A role embedded in a JWT can be up to seven days old. Check the live row
  // so removing admin access takes effect on the next protected request.
  try {
    const rows = await queryPromise(
      `SELECT access_right FROM ${ACCESS_TABLE} WHERE username = ? LIMIT 2`,
      [req.user.username], req
    );
    if (rows.length !== 1 || rows[0].access_right !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: Admins only.' });
    }
    next();
  } catch (err) {
    return res.status(500).json({ message: 'Could not verify admin access.' });
  }
}

app.post('/api/login', (req, res) => {
  const trace = traceStart('POST /api/login', req, {
    username: req.body?.username || null
  });

  const { username, password } = req.body;

  if (!username || !password) {
    traceEnd(trace, { outcome: 'missing_credentials' });
    return res.status(400).json({
      success: false,
      message: 'Username and password are required.'
    });
  }

  const client = ldap.createClient({ url: LDAP_URL });

  const opts = {
    filter: `(uid=${username})`,
    scope: 'one',
    attributes: ['dn']
  };

  client.search(BASE_DN, opts, (err, search) => {
    if (err) {
      traceError(trace, err, { step: 'ldap_search' });
      client.unbind();
      return res.status(500).json({
        success: false,
        message: 'LDAP search failed.'
      });
    }

    let userDN = null;
    let responded = false;

    search.on('searchEntry', entry => {
      userDN = entry.dn.toString();
    });

    search.on('error', streamErr => {
      if (!responded) {
        responded = true;
        traceError(trace, streamErr, { step: 'ldap_search_stream' });
        client.unbind();
        return res.status(500).json({
          success: false,
          message: 'LDAP search error.'
        });
      }
    });

    search.on('end', () => {
      client.unbind();

      if (responded) return;

      if (!userDN) {
        responded = true;
        traceEnd(trace, {
          outcome: 'user_not_found',
          username
        });
        return res.status(401).json({
          success: false,
          message: 'User not found.'
        });
      }

      const userClient = ldap.createClient({ url: LDAP_URL });

      userClient.bind(userDN, password, async bindErr => {
        userClient.unbind();

        if (responded) return;

        if (bindErr) {
          responded = true;
          traceEnd(trace, {
            outcome: 'invalid_credentials',
            username
          });
          return res.status(401).json({
            success: false,
            message: 'Invalid username or password.'
          });
        }

        let access_right = '';

        try {
          const results = await queryPromise(
            `SELECT access_right FROM ${ACCESS_TABLE} WHERE username = ?`,
            [username],
            req
          );

          if (results.length > 0) {
            access_right = results[0].access_right || '';
          }
        } catch (dbErr) {
          traceError(trace, dbErr, {
            step: 'load_access_right',
            username
          });
        }

        const token = jwt.sign(
          { username, access_right },
          JWT_SECRET,
          { expiresIn: '7d', jwtid: randomUUID() }
        );

        responded = true;

        traceEnd(trace, {
          outcome: 'login_success',
          username,
          access_right
        });

        return res.json({
          success: true,
          message: 'LDAP authentication successful.',
          token,
          access_right
        });
      });
    });
  });
});

app.get('/api/check-auth', authenticateToken, (req, res) => {
  res.json({ loggedIn: true, user: req.user });
});

// =====================================
// DATABRICKS: SHARED SERVER CLI LOGIN
// The CLI owns ~/.databricks/token-cache.json and refreshes its OAuth tokens.
// Only authenticated GUI users can query the fixed table. No token reaches Vue.
// =====================================
const DATABRICKS_PROJECT_VALUES_TABLE = 'mds_prod_gold_experiment.uc_dev_projvalue.t_project_values_cloud';
const DATABRICKS_PROJECT_MASTER_TABLE = 'mds_prod_gold_experiment.uc_dev_projvalue.t_project_master';
const DATABRICKS_VALUE_COLUMNS = ['metric_id', 'project_code', 'project_name', 'month_end', 'capacity_improvement', 'people_productivity', 'quality_improvement', 'yield_savings'];
// One lookup row per code preserves the number of metric records and totals.
// Repeated identical names are harmless; conflicting names need correction.
const DATABRICKS_PROJECT_VALUES_SQL = `
  WITH project_names AS (
    SELECT project_code,
           CASE WHEN COUNT(DISTINCT NULLIF(TRIM(project_name), '')) > 1
                THEN raise_error('PROJECT_MASTER_NAME_CONFLICT')
                ELSE MAX(NULLIF(TRIM(project_name), ''))
           END AS project_name
    FROM ${DATABRICKS_PROJECT_MASTER_TABLE}
    GROUP BY project_code
  )
  SELECT v.*,
         COALESCE(m.project_name, v.project_code) AS project_name
  FROM ${DATABRICKS_PROJECT_VALUES_TABLE} v
  LEFT JOIN project_names m ON v.project_code = m.project_code
`;
// Pending requests only; credentials are not stored against GUI logins.
const databricksSessions = new Map();
const revokedGuiSessions = new Map();
let databricksCliQueue = Promise.resolve();

function databricksError(code, message, status = 503) {
  return Object.assign(new Error(message), { code, status });
}

function safeDatabricksTraceRequest(req) {
  return { _traceId: req._traceId, method: req.method, path: req.path,
    originalUrl: req.path, headers: {}, user: { username: req.user?.username } };
}

function forgetDatabricksSession(sessionKey) {
  // Invalidates any pending response for this GUI login. Never deletes or logs
  // out the shared CLI cache used by other GUI users.
  databricksSessions.delete(sessionKey);
}

const databricksCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, state] of databricksSessions) {
    if (state.expiresAt <= now) forgetDatabricksSession(key);
  }
  for (const [key, expiresAt] of revokedGuiSessions) {
    if (expiresAt <= now) revokedGuiSessions.delete(key);
  }
}, 30000);
databricksCleanup.unref();

function getDatabricksSettings() {
  const host = process.env.DATABRICKS_SERVER_HOSTNAME || 'adb-2814849171309960.0.azuredatabricks.net';
  const httpPath = process.env.DATABRICKS_HTTP_PATH;
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || !httpPath || !/^\/[^\s?#]+$/.test(httpPath)) {
    throw databricksError('DATABRICKS_NOT_CONFIGURED', 'Ask the server administrator to check the Databricks hostname and SQL warehouse HTTP path in the backend configuration.');
  }
  return { host, httpPath };
}

async function acquireDatabricksCliToken(forceRefresh) {
  const { host } = getDatabricksSettings();
  // When Node runs as dsaadm, this resolves to the supplied server cache:
  // /home/dsaadm/.databricks/token-cache.json. Do not parse its private schema.
  const cachePath = path.join(os.homedir(), '.databricks', 'token-cache.json');
  try {
    await fs.promises.access(cachePath, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    throw databricksError('DATABRICKS_SERVER_LOGIN_REQUIRED', 'The server Databricks login cache is unavailable. Ask the administrator to run this application under the account that owns the cache and renew its Databricks login.');
  }
  const executable = process.env.DATABRICKS_CLI_PATH || 'databricks';
  // Explicit host selects the workspace cache even when multiple workspaces
  // are cached. Browser input never controls a command, host, path, or SQL.
  const args = ['auth', 'token', 'https://' + host, '--timeout', '20s'];
  if (forceRefresh) args.push('--force-refresh');
  const cliEnv = { ...process.env };
  // Old .env personal/service-principal settings must not select another login.
  for (const key of ['DATABRICKS_TOKEN', 'DATABRICKS_CLIENT_ID', 'DATABRICKS_CLIENT_SECRET',
    'DATABRICKS_HOST', 'DATABRICKS_CONFIG_PROFILE', 'DATABRICKS_AUTH_TYPE']) delete cliEnv[key];
  const stdout = await new Promise((resolve, reject) => {
    const child = execFile(executable, args, {
      env: cliEnv, encoding: 'utf8', timeout: 25000, maxBuffer: 256 * 1024,
      windowsHide: true, shell: false
    }, (err, output) => {
      if (err) {
        // Do not log/rethrow child-process errors or stderr: they may include
        // credentials. Only safe, fixed messages reach HTTP responses/logs.
        if (err.code === 'ENOENT') return reject(databricksError('DATABRICKS_CLI_UNAVAILABLE', 'The Databricks CLI is unavailable on the server. Ask the administrator to check DATABRICKS_CLI_PATH.'));
        return reject(databricksError('DATABRICKS_SERVER_LOGIN_REQUIRED', 'The server Databricks login could not provide a valid token. Ask the administrator to check network access and renew the server login, then refresh the table.'));
      }
      resolve(output);
    });
    // Token acquisition must not wait for interactive input in a web request.
    child.stdin?.end();
  });
  let result;
  try { result = JSON.parse(stdout); } catch {
    throw databricksError('DATABRICKS_CLI_RESPONSE_INVALID', 'The server Databricks CLI returned an unexpected response. Ask the administrator to check the CLI installation.');
  }
  const token = result?.access_token;
  const expiresAt = Date.parse(result?.expiry);
  if (typeof token !== 'string' || !/^[A-Za-z0-9._~+/=-]{20,16384}$/.test(token) ||
      !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 30000) {
    throw databricksError('DATABRICKS_SERVER_LOGIN_REQUIRED', 'The server Databricks token is expired or unavailable. Ask the administrator to renew the server login, then refresh the table.');
  }
  return token;
}

function getServerDatabricksToken(forceRefresh = false) {
  // Serialize CLI access within this process to avoid simultaneous refreshes of
  // the same rotating OAuth cache. SQL reads are independent after acquisition.
  const pending = databricksCliQueue.then(() => acquireDatabricksCliToken(forceRefresh));
  databricksCliQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

function safeDatabricksFailure(err) {
  const status = Number(err?.statusCode || err?.response?.status || err?.response?.statusCode || err?.cause?.statusCode);
  const description = String(err?.message || '') + ' ' + String(err?.response?.errorMessage || '') + ' ' + String(err?.cause?.message || '');
  if (description.includes('PROJECT_MASTER_NAME_CONFLICT')) {
    return databricksError('DATABRICKS_PROJECT_NAME_CONFLICT', 'The cloud Project Master contains different names for the same project code. Ask the administrator to correct those records, then refresh the table.', 409);
  }
  if (status === 401 || /unauthenticated|invalid[_ ](?:access[_ ])?token|token[^\n]{0,60}expir|invalid credential|\b401\b/i.test(description)) {
    return databricksError('DATABRICKS_CONNECTION_REQUIRED', 'The server Databricks login was rejected. Ask the administrator to renew the server login, then refresh the table.', 428);
  }
  if (status === 403 || err?.sqlState === '42501' || /insufficient[_ ]privilege|permission[_ ]denied|not authorized|\b403\b/i.test(description)) {
    return databricksError('DATABRICKS_PERMISSION_DENIED', 'The server Databricks account cannot read the project values and cloud Project Master. Ask the administrator to check CAN USE on the warehouse, USE CATALOG, USE SCHEMA, and SELECT on both tables.', 424);
  }
  return databricksError('DATABRICKS_QUERY_FAILED', 'Could not read Databricks. Ask the administrator to check warehouse availability, network access, the HTTP path, and table permissions, then refresh the table.', 502);
}

async function readDatabricksProjectValues(accessToken) {
  const config = getDatabricksSettings();
  const client = new DBSQLClient({ logger: { log() {} } });
  let session;
  let operation;
  try {
    await client.connect({ host: config.host, path: config.httpPath, token: accessToken });
    session = await client.openSession();
    operation = await session.executeStatement('SELECT current_user() AS databricks_user', { runAsync: true });
    const identity = await operation.fetchAll();
    await operation.close();
    operation = null;
    if (typeof identity[0]?.databricks_user !== 'string' || !identity[0].databricks_user) throw new Error('Missing Databricks identity');
    const user = identity[0].databricks_user;
    operation = await session.executeStatement(DATABRICKS_PROJECT_VALUES_SQL, { runAsync: true });
    const fetched = await operation.fetchAll();
    const rows = JSON.parse(JSON.stringify(fetched, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
    const discoveredColumns = [...new Set(rows.flatMap(row => Object.keys(row)))];
    return {
      table: DATABRICKS_PROJECT_VALUES_TABLE,
      project_master_table: DATABRICKS_PROJECT_MASTER_TABLE,
      columns: discoveredColumns.length ? discoveredColumns : DATABRICKS_VALUE_COLUMNS,
      rows, total_rows: rows.length, complete: true,
      fetched_at: new Date().toISOString(), databricks_user: user
    };
  } catch (err) {
    throw safeDatabricksFailure(err);
  } finally {
    for (const resource of [operation, session, client]) {
      if (resource) {
        try { await resource.close(); } catch { /* Discard this SQL connection. */ }
      }
    }
  }
}

async function readServerDatabricksProjectValues() {
  let token = await getServerDatabricksToken();
  try {
    return await readDatabricksProjectValues(token);
  } catch (err) {
    if (err.code !== 'DATABRICKS_CONNECTION_REQUIRED') throw err;
    // Retry a rejected/expired access token once using the refreshed CLI cache.
    token = await getServerDatabricksToken(true);
    return await readDatabricksProjectValues(token);
  } finally {
    token = '';
  }
}

function sendDatabricksError(req, res, err) {
  const known = ['DATABRICKS_NOT_CONFIGURED', 'DATABRICKS_SERVER_LOGIN_REQUIRED',
    'DATABRICKS_CLI_UNAVAILABLE', 'DATABRICKS_CLI_RESPONSE_INVALID', 'DATABRICKS_CONNECTION_REQUIRED',
    'DATABRICKS_PERMISSION_DENIED', 'DATABRICKS_PROJECT_NAME_CONFLICT', 'DATABRICKS_QUERY_FAILED', 'GUI_LOGIN_REQUIRED', 'DATABRICKS_BUSY'];
  const safe = known.includes(err.code) ? err : databricksError('DATABRICKS_QUERY_FAILED', 'The Databricks request failed. Refresh the table to retry.', 502);
  traceError(traceStart('DATABRICKS_REQUEST_FAILED', safeDatabricksTraceRequest(req)), new Error(safe.message), { code: safe.code });
  return res.status(safe.status || 502).json({ code: safe.code, message: safe.message });
}

app.get('/api/databricks/connection', authenticateToken, (req, res) => {
  try {
    getDatabricksSettings();
    // Configuration only. A successful table query verifies the live identity.
    return res.json({ auth_mode: 'server-cache', server_managed: true,
      status: 'server-managed', table: DATABRICKS_PROJECT_VALUES_TABLE });
  } catch (err) {
    return sendDatabricksError(req, res, err);
  }
});

// Old clients receive an explicit upgrade message instead of sending/retaining
// personal credentials. The new Vue component calls only the read endpoint.
app.post('/api/databricks/connection', authenticateToken, (req, res) => {
  if (req.body) delete req.body.token;
  return res.status(405).json({ code: 'DATABRICKS_SERVER_MANAGED',
    message: 'Databricks now uses the server login. Refresh the application to load the updated interface.' });
});

app.delete('/api/databricks/connection', authenticateToken, (req, res) => {
  forgetDatabricksSession(req.authSessionKey);
  return res.json({ auth_mode: 'server-cache', server_managed: true,
    message: 'Pending requests for this GUI login were cleared. The shared server login remains available.' });
});

app.get('/api/databricks/project-values', authenticateToken, async (req, res) => {
  let state;
  try {
    if (databricksSessions.has(req.authSessionKey)) throw databricksError('DATABRICKS_BUSY', 'A Databricks request is already running for this GUI login. Wait and refresh again.', 409);
    state = { expiresAt: Number(req.user?.exp) * 1000 };
    if (!Number.isFinite(state.expiresAt) || state.expiresAt <= Date.now()) throw databricksError('GUI_LOGIN_REQUIRED', 'Your GUI session expired. Please log in again.', 401);
    databricksSessions.set(req.authSessionKey, state);
    const result = await readServerDatabricksProjectValues();
    if (databricksSessions.get(req.authSessionKey) !== state || revokedGuiSessions.has(req.authSessionKey) || state.expiresAt <= Date.now()) {
      throw databricksError('GUI_LOGIN_REQUIRED', 'This GUI request ended. Please log in again if your session expired.', 401);
    }
    return res.json({ ...result, connected: true, auth_mode: 'server-cache', server_managed: true });
  } catch (err) {
    return sendDatabricksError(req, res, err);
  } finally {
    if (state && databricksSessions.get(req.authSessionKey) === state) forgetDatabricksSession(req.authSessionKey);
  }
});

app.post('/api/logout', authenticateToken, (req, res) => {
  forgetDatabricksSession(req.authSessionKey);
  revokedGuiSessions.set(req.authSessionKey, Number(req.user.exp) * 1000);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ message: 'GUI session ended. The shared server Databricks login remains available.' });
});



// =====================================
// Project access management
// =====================================
function validAccessUsername(username) {
  return typeof username === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(username);
}

function validAccessRight(accessRight) {
  return accessRight === 'admin' || accessRight === 'user';
}

app.get('/api/project-access', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await queryPromise(
      `SELECT username, access_right FROM ${ACCESS_TABLE} ORDER BY username`, [], req
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Could not load user access.' });
  }
});

app.post('/api/project-access', authenticateToken, requireAdmin, async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const accessRight = req.body?.access_right;

  if (!validAccessUsername(username) || !validAccessRight(accessRight)) {
    return res.status(400).json({ message: 'Enter a valid username and select User or Admin.' });
  }

  try {
    // The conditional insert avoids overwriting an existing user's role.
    const result = await queryPromise(
      `INSERT INTO ${ACCESS_TABLE} (username, access_right)
       SELECT ?, ? WHERE NOT EXISTS
         (SELECT 1 FROM ${ACCESS_TABLE} WHERE username = ?)`,
      [username, accessRight, username], req
    );
    if (!result.affectedRows) {
      return res.status(409).json({ message: 'This username already exists. Change its role in the list.' });
    }
    return res.status(201).json({ username, access_right: accessRight });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This username already exists.' });
    }
    return res.status(500).json({ message: 'Could not add user access.' });
  }
});

app.put('/api/project-access/:username', authenticateToken, requireAdmin, async (req, res) => {
  const username = req.params.username;
  const accessRight = req.body?.access_right;

  if (!validAccessUsername(username) || !validAccessRight(accessRight)) {
    return res.status(400).json({ message: 'Invalid username or access right.' });
  }
  if (username.toLowerCase() === String(req.user.username).toLowerCase() && accessRight !== 'admin') {
    return res.status(400).json({ message: 'You cannot remove your own admin access.' });
  }

  try {
    const rows = await queryPromise(
      `SELECT access_right FROM ${ACCESS_TABLE} WHERE username = ? LIMIT 2`,
      [username], req
    );
    if (!rows.length) return res.status(404).json({ message: 'User access not found.' });
    if (rows.length !== 1) {
      return res.status(409).json({ message: 'Duplicate access rows found for this username.' });
    }
    if (rows[0].access_right === accessRight) {
      return res.json({ username, access_right: accessRight });
    }

    const result = await queryPromise(
      `UPDATE ${ACCESS_TABLE} SET access_right = ? WHERE username = ? AND access_right = ?`,
      [accessRight, username, rows[0].access_right], req
    );
    if (result.affectedRows !== 1) {
      return res.status(409).json({ message: 'Access changed while you were editing. Refresh and try again.' });
    }
    return res.json({ username, access_right: accessRight });
  } catch (err) {
    return res.status(500).json({ message: 'Could not update user access.' });
  }
});

// =====================================
// Upload middleware
// =====================================
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// =====================================
// PROJECT MASTER ROUTES
// =====================================
app.get('/api/project-master/columns', authenticateToken, async (req, res) => {
  const trace = traceStart('GET /api/project-master/columns', req);

  try {
    const columns = await getTableColumns(PROJECT_MASTER_TABLE, req);
    traceEnd(trace, { outcome: 'success', rowCount: columns.length });
    return res.json(columns);
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message });
  }
});

app.get('/api/project-master/options', authenticateToken, async (req, res) => {
  const trace = traceStart('GET /api/project-master/options', req);

  try {
    const rows = await queryPromise(
      `
        SELECT
          project_code,
          project_name,
          project_description,
          project_type,
          use_case_investment,
          project_status
        FROM ${PROJECT_MASTER_TABLE}
        ORDER BY project_name ASC
      `,
      [],
      req
    );

    traceEnd(trace, { outcome: 'success', rowCount: rows.length });
    return res.json(rows);
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message });
  }
});

app.get('/api/project-master', authenticateToken, async (req, res) => {
  const trace = traceStart('GET /api/project-master', req);

  try {
    const rows = await queryPromise(
      `
        SELECT
          project_code,
          project_name,
          project_description,
          project_type,
          use_case_investment,
          project_status
        FROM ${PROJECT_MASTER_TABLE}
        ORDER BY project_name ASC
      `,
      [],
      req
    );

    traceEnd(trace, { outcome: 'success', rowCount: rows.length });
    return res.json(rows);
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message });
  }
});

app.get('/api/project-master/history/all', authenticateToken, requireAdmin, async (req, res) => {
  const trace = traceStart('GET /api/project-master/history/all', req);
  try {
    const rows = await queryPromise(
      `SELECT 
         history_id, project_code, project_name, project_type,
         use_case_investment, project_description, project_status, changed_by, 
         DATE_FORMAT(changed_at, '%Y-%m-%d %H:%i:%s') AS changed_at, 
         action_type
       FROM ${MASTER_HISTORY_TABLE}
       ORDER BY changed_at DESC`,
      [], req
    );
    traceEnd(trace, { outcome: 'success', rowCount: rows.length });
    return res.json(rows);
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message });
  }
});

app.get('/api/project-master/:projectCode/history', authenticateToken, async (req, res) => {
  const trace = traceStart('GET /api/project-master/:projectCode/history', req);
  try {
    const projectCode = req.params.projectCode;
    const rows = await queryPromise(
      `SELECT 
         history_id, 
         project_code, 
         project_name, 
         project_type,
         use_case_investment,
         project_description,
         project_status,
         changed_by, 
         DATE_FORMAT(changed_at, '%Y-%m-%d %H:%i:%s') AS changed_at, 
         action_type
       FROM ${MASTER_HISTORY_TABLE}
       WHERE project_code = ?
       ORDER BY changed_at DESC`,
      [projectCode], 
      req
    );
    traceEnd(trace, { outcome: 'success', rowCount: rows.length });
    return res.json(rows);
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message });
  }
});

// =====================================
// CONFIG / DROPDOWN ROUTES
// =====================================
app.get('/api/project-types', authenticateToken, async (req, res) => {
  const trace = traceStart('GET /api/project-types', req);
  try {
    const rows = await queryPromise(
      `SELECT type_name FROM t_project_types ORDER BY type_name ASC`,
      [],
      req
    );
    traceEnd(trace, { outcome: 'success', rowCount: rows.length });
    return res.json(rows.map(r => r.type_name));
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message });
  }
});

app.post('/api/project-types', authenticateToken, requireAdmin, async (req, res) => {
  const trace = traceStart('POST /api/project-types', req);
  const { type_name } = req.body;

  if (!type_name || !String(type_name).trim()) {
    traceEnd(trace, { outcome: 'validation_failed' });
    return res.status(400).json({ message: 'Project Type Name is required' });
  }

  try {
    await queryPromise(
      `INSERT INTO t_project_types (type_name) VALUES (?)`,
      [String(type_name).trim()],
      req
    );

    traceEnd(trace, { outcome: 'success', type_name });
    res.status(201).json({ message: 'Project type added successfully' });
  } catch (error) {
    traceError(trace, error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Project type already exists.' });
    }
    res.status(500).json({ message: 'Failed to add project type to the database' });
  }
});

app.get('/api/project-statuses', authenticateToken, async (req, res) => {
  const trace = traceStart('GET /api/project-statuses', req);
  try {
    const rows = await queryPromise(
      `SELECT status_name FROM t_project_statuses ORDER BY status_name ASC`,
      [],
      req
    );
    traceEnd(trace, { outcome: 'success', rowCount: rows.length });
    return res.json(rows.map(r => r.status_name));
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message });
  }
});

// =====================================
// PROJECT MASTER DATA MODIFICATION
// =====================================
app.post('/api/project-master', authenticateToken, requireAdmin, async (req, res) => {
  const trace = traceStart('POST /api/project-master', req);

  try {
    const payload = {
      project_code: normalizeText(req.body.project_code),
      project_name: normalizeText(req.body.project_name),
      project_description: normalizeText(req.body.project_description),
      project_type: normalizeText(req.body.project_type),
      use_case_investment: normalizeNumber(req.body.use_case_investment),
      project_status: normalizeText(req.body.project_status) || 'Active'
    };

    const validationError = validateProjectMasterPayload(payload);
    if (validationError) {
      traceEnd(trace, { outcome: 'validation_failed', validationError });
      return res.status(400).json({ message: validationError });
    }

    const duplicate = await queryPromise(
      `
        SELECT project_code
        FROM ${PROJECT_MASTER_TABLE}
        WHERE project_code = ?
           OR project_name = ?
        LIMIT 1
      `,
      [payload.project_code, payload.project_name],
      req
    );

    if (duplicate.length > 0) {
      traceEnd(trace, { outcome: 'duplicate' });
      return res.status(409).json({
        message: 'Project code or project name already exists.'
      });
    }

    await queryPromise(
      `
        INSERT INTO ${PROJECT_MASTER_TABLE}
        (
          project_code,
          project_name,
          project_description,
          project_type,
          use_case_investment,
          project_status
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        payload.project_code,
        payload.project_name,
        payload.project_description,
        payload.project_type,
        payload.use_case_investment ?? 0,
        payload.project_status
      ],
      req
    );

    const rows = await queryPromise(
      `
        SELECT
          project_code,
          project_name,
          project_description,
          project_type,
          use_case_investment,
          project_status
        FROM ${PROJECT_MASTER_TABLE}
        WHERE project_code = ?
      `,
      [payload.project_code],
      req
    );

    traceEnd(trace, { outcome: 'success', project_code: payload.project_code });
    return res.status(201).json(rows[0]);
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message });
  }
});

app.put('/api/project-master/:projectCode', authenticateToken, requireAdmin, async (req, res) => {
  const trace = traceStart('PUT /api/project-master/:projectCode', req, {
    projectCode: req.params.projectCode
  });

  try {
    const originalProjectCode = req.params.projectCode;
    const currentUser = getCurrentUser(req);

    const payload = {
      project_code: normalizeText(req.body.project_code),
      project_name: normalizeText(req.body.project_name),
      project_description: normalizeText(req.body.project_description),
      project_type: normalizeText(req.body.project_type),
      use_case_investment: normalizeNumber(req.body.use_case_investment),
      project_status: normalizeText(req.body.project_status) || 'Active'
    };

    const validationError = validateProjectMasterPayload(payload);
    if (validationError) {
      traceEnd(trace, { outcome: 'validation_failed', validationError });
      return res.status(400).json({ message: validationError });
    }

    const duplicate = await queryPromise(
      `
        SELECT project_code
        FROM ${PROJECT_MASTER_TABLE}
        WHERE (project_code = ? OR project_name = ?)
          AND project_code <> ?
        LIMIT 1
      `,
      [payload.project_code, payload.project_name, originalProjectCode],
      req
    );

    if (duplicate.length > 0) {
      traceEnd(trace, { outcome: 'duplicate' });
      return res.status(409).json({
        message: 'Another project with the same code or name already exists.'
      });
    }

    // LOG HISTORY BEFORE UPDATE
    await queryPromise(
      `INSERT INTO ${MASTER_HISTORY_TABLE} (
         project_code, project_name, project_description, project_type,
         use_case_investment, project_status, changed_by, action_type
       )
       SELECT
         project_code, project_name, project_description, project_type,
         use_case_investment, project_status, ?, 'UPDATE'
       FROM ${PROJECT_MASTER_TABLE}
       WHERE project_code = ?`,
      [currentUser, originalProjectCode], req
    );

    // EXECUTE UPDATE
    const result = await queryPromise(
      `
        UPDATE ${PROJECT_MASTER_TABLE}
        SET
          project_code = ?,
          project_name = ?,
          project_description = ?,
          project_type = ?,
          use_case_investment = ?,
          project_status = ?
        WHERE project_code = ?
      `,
      [
        payload.project_code,
        payload.project_name,
        payload.project_description,
        payload.project_type,
        payload.use_case_investment ?? 0,
        payload.project_status,
        originalProjectCode
      ],
      req
    );

    if (result.affectedRows === 0) {
      traceEnd(trace, { outcome: 'not_found' });
      return res.status(404).json({ message: 'Project not found.' });
    }

    const rows = await queryPromise(
      `
        SELECT
          project_code,
          project_name,
          project_description,
          project_type,
          use_case_investment,
          project_status
        FROM ${PROJECT_MASTER_TABLE}
        WHERE project_code = ?
      `,
      [payload.project_code],
      req
    );

    traceEnd(trace, { outcome: 'success', project_code: payload.project_code });
    return res.json(rows[0]);
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message });
  }
});

app.delete('/api/project-master/:projectCode', authenticateToken, requireAdmin, async (req, res) => {
  const trace = traceStart('DELETE /api/project-master/:projectCode', req, {
    projectCode: req.params.projectCode
  });

  try {
    const projectCode = req.params.projectCode;

    const usage = await queryPromise(
      `
        SELECT COUNT(*) AS cnt
        FROM ${PROJECT_VALUES_TABLE}
        WHERE project_code = ?
      `,
      [projectCode],
      req
    );

    if (usage[0].cnt > 0) {
      traceEnd(trace, { outcome: 'blocked_in_use', count: usage[0].cnt });
      return res.status(409).json({
        message: 'Cannot delete project master row because project values already exist for this project.'
      });
    }

    const result = await queryPromise(
      `
        DELETE FROM ${PROJECT_MASTER_TABLE}
        WHERE project_code = ?
      `,
      [projectCode],
      req
    );

    if (result.affectedRows === 0) {
      traceEnd(trace, { outcome: 'not_found' });
      return res.status(404).json({ message: 'Project not found.' });
    }

    traceEnd(trace, { outcome: 'success', projectCode });
    return res.json({ message: 'Project deleted successfully.' });
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message });
  }
});

app.post('/api/project-master/upload-excel', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  const trace = traceStart('POST /api/project-master/upload-excel', req);

  if (!req.file) {
    traceEnd(trace, { outcome: 'no_file' });
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  const currentUser = getCurrentUser(req);
  const filePath = req.file.path;

  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    const expectedColumns = [
      'project_code',
      'project_name',
      'project_type'
    ];

    const firstRowColumns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const missing = expectedColumns.filter(col => !firstRowColumns.includes(col));

    if (missing.length > 0) {
      traceEnd(trace, { outcome: 'missing_columns', missing });
      return res.status(400).json({
        message: `Excel missing columns: ${missing.join(', ')}`
      });
    }

    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const payload = {
        project_code: normalizeText(row['project_code']),
        project_name: normalizeText(row['project_name']),
        project_description: normalizeText(row['project_description']),
        project_type: normalizeText(row['project_type']),
        use_case_investment: normalizeNumber(row['use_case_investment']),
        project_status: normalizeText(row['project_status']) || 'Active'
      };

      const validationError = validateProjectMasterPayload(payload);
      if (validationError) continue;

      const existing = await queryPromise(
        `
          SELECT project_code
          FROM ${PROJECT_MASTER_TABLE}
          WHERE project_code = ?
          LIMIT 1
        `,
        [payload.project_code],
        req
      );

      if (existing.length > 0) {
        // LOG HISTORY BEFORE UPDATE
        await queryPromise(
          `INSERT INTO ${MASTER_HISTORY_TABLE} (
             project_code, project_name, project_description, project_type,
             use_case_investment, project_status, changed_by, action_type
           )
           SELECT
             project_code, project_name, project_description, project_type,
             use_case_investment, project_status, ?, 'UPDATE'
           FROM ${PROJECT_MASTER_TABLE}
           WHERE project_code = ?`,
          [currentUser, payload.project_code], req
        );

        await queryPromise(
          `
            UPDATE ${PROJECT_MASTER_TABLE}
            SET
              project_name = ?,
              project_description = ?,
              project_type = ?,
              use_case_investment = ?,
              project_status = ?
            WHERE project_code = ?
          `,
          [
            payload.project_name,
            payload.project_description,
            payload.project_type,
            payload.use_case_investment ?? 0,
            payload.project_status,
            payload.project_code
          ],
          req
        );
        updated += 1;
      } else {
        await queryPromise(
          `
            INSERT INTO ${PROJECT_MASTER_TABLE}
            (
              project_code,
              project_name,
              project_description,
              project_type,
              use_case_investment,
              project_status
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `,
          [
            payload.project_code,
            payload.project_name,
            payload.project_description,
            payload.project_type,
            payload.use_case_investment ?? 0,
            payload.project_status
          ],
          req
        );
        inserted += 1;
      }
    }

    traceEnd(trace, { outcome: 'success', inserted, updated });
    return res.json({
      message: `Project master Excel upload completed. Inserted: ${inserted}, Updated: ${updated}.`
    });
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message || 'Excel upload failed.' });
  } finally {
    safeUnlink(filePath);
  }
});

// =====================================
// PROJECT VALUES ROUTES
// =====================================
app.get('/api/project-unit-cost', authenticateToken, async (req, res) => {
  const trace = traceStart('GET /api/project-unit-cost', req);

  try {
    const rows = await queryPromise(
      `SELECT project_code,
              DATE_FORMAT(effective_date, '%Y-%m-%d') AS effective_date,
              avg_unit_cost,
              created_by,
              DATE_FORMAT(created_date, '%Y-%m-%d %H:%i:%s') AS created_date,
              updated_by,
              DATE_FORMAT(updated_date, '%Y-%m-%d %H:%i:%s') AS updated_date
       FROM ${PROJECT_UNIT_COST_TABLE}
       ORDER BY project_code, effective_date`,
      [], req
    );
    traceEnd(trace, { outcome: 'success', rowCount: rows.length });
    return res.json(rows);
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: 'Could not load project unit costs.' });
  }
});

function validUnitCostDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validUnitCostNumber(value) {
  return /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value) && Number.isFinite(Number(value));
}

app.post('/api/project-unit-cost', authenticateToken, async (req, res) => {
  const trace = traceStart('POST /api/project-unit-cost', req);
  const projectCode = typeof req.body?.project_code === 'string' ? req.body.project_code.trim() : '';
  const effectiveDate = req.body?.effective_date;
  const costText = String(req.body?.avg_unit_cost ?? '').trim();

  if (!projectCode || !validUnitCostDate(effectiveDate)) {
    traceEnd(trace, { outcome: 'invalid_project_or_date' });
    return res.status(400).json({ message: 'Select a project and a valid effective date.' });
  }

  if (!validUnitCostNumber(costText)) {
    traceEnd(trace, { outcome: 'invalid_unit_cost' });
    return res.status(400).json({ message: 'Average unit cost must be non-negative with up to four decimal places.' });
  }

  try {
    const project = await findProjectByCode(projectCode, req);
    if (!project) {
      traceEnd(trace, { outcome: 'project_not_found' });
      return res.status(404).json({ message: 'Project not found in Project Master.' });
    }

    const existing = await queryPromise(
      `SELECT 1 FROM ${PROJECT_UNIT_COST_TABLE}
       WHERE project_code = ? AND effective_date = ? LIMIT 1`,
      [projectCode, effectiveDate], req
    );
    if (existing.length) {
      traceEnd(trace, { outcome: 'duplicate_rate' });
      return res.status(409).json({ message: 'A unit cost rate already exists for this project and effective date.' });
    }

    await queryPromise(
      `INSERT INTO ${PROJECT_UNIT_COST_TABLE}
       (project_code, effective_date, avg_unit_cost, created_by, created_date, updated_by, updated_date)
       VALUES (?, ?, ?, ?, NOW(), NULL, NOW())`,
      [projectCode, effectiveDate, costText, getCurrentUser(req)], req
    );

    traceEnd(trace, { outcome: 'success', projectCode, effectiveDate });
    return res.status(201).json({
      message: 'Unit cost rate added successfully.',
      project_code: projectCode,
      effective_date: effectiveDate,
      avg_unit_cost: costText
    });
  } catch (err) {
    traceError(trace, err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A unit cost rate already exists for this project and effective date.' });
    }
    return res.status(500).json({ message: 'Could not save the unit cost rate.' });
  }
});

app.put('/api/project-unit-cost/:projectCode/:effectiveDate', authenticateToken, async (req, res) => {
  const trace = traceStart('PUT /api/project-unit-cost/:projectCode/:effectiveDate', req);
  const projectCode = req.params.projectCode;
  const originalDate = req.params.effectiveDate;
  const effectiveDate = req.body?.effective_date;
  const costText = String(req.body?.avg_unit_cost ?? '').trim();
  const originalCost = String(req.body?.original_avg_unit_cost ?? '').trim();

  if (!projectCode || !validUnitCostDate(originalDate) || !validUnitCostDate(effectiveDate) || !validUnitCostNumber(costText) || !validUnitCostNumber(originalCost)) {
    traceEnd(trace, { outcome: 'invalid_input' });
    return res.status(400).json({ message: 'Enter a valid effective date and a non-negative cost with up to four decimal places.' });
  }

  try {
    const existing = await queryPromise(
      `SELECT avg_unit_cost FROM ${PROJECT_UNIT_COST_TABLE} WHERE project_code = ? AND effective_date = ? LIMIT 2`,
      [projectCode, originalDate], req
    );
    if (!existing.length) {
      traceEnd(trace, { outcome: 'not_found' });
      return res.status(404).json({ message: 'Unit cost rate not found. Refresh and try again.' });
    }
    if (existing.length > 1) {
      traceEnd(trace, { outcome: 'duplicate_source_rows' });
      return res.status(409).json({ message: 'Duplicate rate rows exist for this project and date. Contact an admin.' });
    }
    if (Number(existing[0].avg_unit_cost) !== Number(originalCost)) {
      traceEnd(trace, { outcome: 'stale_rate' });
      return res.status(409).json({ message: 'This rate changed while you were editing. Refresh and try again.' });
    }

    if (effectiveDate === originalDate && Number(existing[0].avg_unit_cost) === Number(costText)) {
      traceEnd(trace, { outcome: 'unchanged' });
      return res.json({ message: 'No changes to save.', project_code: projectCode, effective_date: effectiveDate, avg_unit_cost: costText });
    }

    if (effectiveDate !== originalDate) {
      const conflict = await queryPromise(
        `SELECT 1 FROM ${PROJECT_UNIT_COST_TABLE} WHERE project_code = ? AND effective_date = ? LIMIT 1`,
        [projectCode, effectiveDate], req
      );
      if (conflict.length) {
        traceEnd(trace, { outcome: 'duplicate_target_date' });
        return res.status(409).json({ message: 'A rate already exists for this project and effective date.' });
      }
    }

    const result = await queryPromise(
      `UPDATE ${PROJECT_UNIT_COST_TABLE}
       SET effective_date = ?, avg_unit_cost = ?, updated_by = ?, updated_date = NOW()
       WHERE project_code = ? AND effective_date = ? AND avg_unit_cost = ?`,
      [effectiveDate, costText, getCurrentUser(req), projectCode, originalDate, originalCost], req
    );
    if (result.affectedRows !== 1) {
      traceEnd(trace, { outcome: 'concurrent_change' });
      return res.status(409).json({ message: 'This rate changed while you were editing. Refresh and try again.' });
    }

    traceEnd(trace, { outcome: 'success', projectCode, effectiveDate });
    return res.json({ message: 'Unit cost rate updated successfully.', project_code: projectCode, effective_date: effectiveDate, avg_unit_cost: costText });
  } catch (err) {
    traceError(trace, err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A rate already exists for this project and effective date.' });
    }
    return res.status(500).json({ message: 'Could not update the unit cost rate.' });
  }
});

app.delete('/api/project-unit-cost/:projectCode/:effectiveDate', authenticateToken, requireAdmin, async (req, res) => {
  const trace = traceStart('DELETE /api/project-unit-cost/:projectCode/:effectiveDate', req);
  const projectCode = req.params.projectCode;
  const effectiveDate = req.params.effectiveDate;
  const originalCost = String(req.body?.original_avg_unit_cost ?? '').trim();

  if (!projectCode || !validUnitCostDate(effectiveDate) || !validUnitCostNumber(originalCost)) {
    traceEnd(trace, { outcome: 'invalid_input' });
    return res.status(400).json({ message: 'Invalid project, effective date, or original rate.' });
  }

  try {
    const existing = await queryPromise(
      `SELECT avg_unit_cost FROM ${PROJECT_UNIT_COST_TABLE} WHERE project_code = ? AND effective_date = ? LIMIT 2`,
      [projectCode, effectiveDate], req
    );
    if (!existing.length) {
      traceEnd(trace, { outcome: 'not_found' });
      return res.status(404).json({ message: 'Unit cost rate not found. Refresh and try again.' });
    }
    if (existing.length > 1) {
      traceEnd(trace, { outcome: 'duplicate_source_rows' });
      return res.status(409).json({ message: 'Duplicate rate rows exist for this project and date. Contact an admin.' });
    }
    if (Number(existing[0].avg_unit_cost) !== Number(originalCost)) {
      traceEnd(trace, { outcome: 'stale_rate' });
      return res.status(409).json({ message: 'This rate changed while you were deleting. Refresh and try again.' });
    }

    const result = await queryPromise(
      `DELETE FROM ${PROJECT_UNIT_COST_TABLE} WHERE project_code = ? AND effective_date = ? AND avg_unit_cost = ?`,
      [projectCode, effectiveDate, originalCost], req
    );
    if (result.affectedRows !== 1) {
      traceEnd(trace, { outcome: 'concurrent_change' });
      return res.status(409).json({ message: 'This rate changed while you were deleting. Refresh and try again.' });
    }

    traceEnd(trace, { outcome: 'success', projectCode, effectiveDate });
    return res.json({ message: 'Unit cost rate deleted successfully.' });
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: 'Could not delete the unit cost rate.' });
  }
});

app.get('/api/project-values/columns', authenticateToken, async (req, res) => {
  const trace = traceStart('GET /api/project-values/columns', req);

  try {
    const columns = await getTableColumns(PROJECT_VALUES_TABLE, req);
    traceEnd(trace, { outcome: 'success', rowCount: columns.length });
    return res.json(columns);
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message });
  }
});

app.get('/api/project-values', authenticateToken, async (req, res) => {
  const trace = traceStart('GET /api/project-values', req);

  try {
    const rows = await queryPromise(
      `
        SELECT
          v.metric_id,
          v.project_code,
          m.project_name,
          m.project_type,
          m.project_description,
          m.project_status,
          m.use_case_investment,
          DATE_FORMAT(v.month_end, '%Y-%m-%d') AS month_end,
          v.capacity_improvement,
          v.people_productivity,
          v.quality_improvement,
          v.yield_savings
        FROM ${PROJECT_VALUES_TABLE} v
        LEFT JOIN ${PROJECT_MASTER_TABLE} m
          ON v.project_code = m.project_code
        ORDER BY v.month_end DESC, m.project_name ASC
      `,
      [],
      req
    );

    traceEnd(trace, { outcome: 'success', rowCount: rows.length });
    return res.json(rows);
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message });
  }
});

app.get('/api/project-values/history/all', authenticateToken, requireAdmin, async (req, res) => {
  const trace = traceStart('GET /api/project-values/history/all', req);
  try {
    const rows = await queryPromise(
      `SELECT 
         history_id, metric_id, project_code, 
         DATE_FORMAT(month_end, '%Y-%m-%d') AS month_end,
         capacity_improvement, yield_savings, people_productivity, quality_improvement,
         changed_by, DATE_FORMAT(changed_at, '%Y-%m-%d %H:%i:%s') AS changed_at, 
         action_type
       FROM ${HISTORY_TABLE}
       ORDER BY changed_at DESC`,
      [], req
    );
    traceEnd(trace, { outcome: 'success', rowCount: rows.length });
    return res.json(rows);
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message });
  }
});

app.get('/api/project-values/:metricId/history', authenticateToken, async (req, res) => {
  const trace = traceStart('GET /api/project-values/:metricId/history', req);
  try {
    const metricId = req.params.metricId;
    const rows = await queryPromise(
      `SELECT 
         history_id, 
         metric_id, 
         project_code, 
         DATE_FORMAT(month_end, '%Y-%m-%d') AS month_end,
         capacity_improvement, 
         yield_savings, 
         people_productivity, 
         quality_improvement,
         changed_by, 
         DATE_FORMAT(changed_at, '%Y-%m-%d %H:%i:%s') AS changed_at, 
         action_type
       FROM ${HISTORY_TABLE}
       WHERE metric_id = ?
       ORDER BY changed_at DESC`,
      [metricId], 
      req
    );
    traceEnd(trace, { outcome: 'success', rowCount: rows.length });
    return res.json(rows);
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message });
  }
});

app.post('/api/project-values', authenticateToken, async (req, res) => {
  const trace = traceStart('POST /api/project-values', req);

  try {
    const payload = {
      project_code: normalizeText(req.body.project_code),
      project_name: normalizeText(req.body.project_name),
      month_end: parseStandardDate(req.body.month_end), 
      capacity_improvement: normalizeNumber(req.body.capacity_improvement),
      people_productivity: normalizeNumber(req.body.people_productivity),
      quality_improvement: normalizeNumber(req.body.quality_improvement),
      yield_savings: normalizeNumber(req.body.yield_savings)
    };

    const validationError = validateProjectValuePayload(payload);
    if (validationError) {
      traceEnd(trace, { outcome: 'validation_failed', validationError });
      return res.status(400).json({ message: validationError });
    }

    const project = await resolveProject(req, payload);
    if (!project) {
      traceEnd(trace, { outcome: 'project_not_found' });
      return res.status(400).json({
        message: 'Selected project does not exist in project master.'
      });
    }

    const existing = await queryPromise(
      `SELECT metric_id FROM ${PROJECT_VALUES_TABLE} WHERE project_code = ? AND CAST(month_end AS DATE) = CAST(? AS DATE)`,
      [project.project_code, payload.month_end], req
    );

    if (existing.length > 0) {
      traceEnd(trace, { outcome: 'duplicate_prevented' });
      return res.status(409).json({
        message: `Data for ${project.project_name || project.project_code} for month ending ${payload.month_end} already exists. Please select it from the table and click 'Update' instead.`
      });
    }

    const result = await queryPromise(
      `
        INSERT INTO ${PROJECT_VALUES_TABLE}
        (
          project_code,
          month_end,
          capacity_improvement,
          people_productivity,
          quality_improvement,
          yield_savings
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        project.project_code,
        payload.month_end,
        payload.capacity_improvement,
        payload.people_productivity,
        payload.quality_improvement,
        payload.yield_savings
      ],
      req
    );

    const rows = await queryPromise(
      `
        SELECT
          v.metric_id,
          v.project_code,
          m.project_name,
          m.project_type,
          m.project_description,
          m.project_status,
          m.use_case_investment,
          DATE_FORMAT(v.month_end, '%Y-%m-%d') AS month_end,
          v.capacity_improvement,
          v.people_productivity,
          v.quality_improvement,
          v.yield_savings
        FROM ${PROJECT_VALUES_TABLE} v
        LEFT JOIN ${PROJECT_MASTER_TABLE} m
          ON v.project_code = m.project_code
        WHERE v.metric_id = ?
      `,
      [result.insertId],
      req
    );

    traceEnd(trace, { outcome: 'success', metric_id: result.insertId });
    return res.status(201).json(rows[0]);
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message });
  }
});

app.put('/api/project-values/:metricId', authenticateToken, async (req, res) => {
  const trace = traceStart('PUT /api/project-values/:metricId', req, {
    metricId: req.params.metricId
  });

  try {
    const metricId = req.params.metricId;
    const currentUser = getCurrentUser(req);

    const payload = {
      project_code: normalizeText(req.body.project_code),
      project_name: normalizeText(req.body.project_name),
      month_end: parseStandardDate(req.body.month_end), 
      capacity_improvement: normalizeNumber(req.body.capacity_improvement),
      people_productivity: normalizeNumber(req.body.people_productivity),
      quality_improvement: normalizeNumber(req.body.quality_improvement),
      yield_savings: normalizeNumber(req.body.yield_savings)
    };

    const validationError = validateProjectValuePayload(payload);
    if (validationError) {
      traceEnd(trace, { outcome: 'validation_failed', validationError });
      return res.status(400).json({ message: validationError });
    }

    const project = await resolveProject(req, payload);
    if (!project) {
      traceEnd(trace, { outcome: 'project_not_found' });
      return res.status(400).json({
        message: 'Selected project does not exist in project master.'
      });
    }

    const existing = await queryPromise(
      `SELECT metric_id FROM ${PROJECT_VALUES_TABLE} WHERE project_code = ? AND CAST(month_end AS DATE) = CAST(? AS DATE) AND metric_id != ?`,
      [project.project_code, payload.month_end, metricId], req
    );

    if (existing.length > 0) {
      traceEnd(trace, { outcome: 'update_conflict_prevented' });
      return res.status(409).json({
        message: `Cannot update: A different record for ${project.project_name || project.project_code} already exists for month ending ${payload.month_end}.`
      });
    }

    await queryPromise(
      `INSERT INTO ${HISTORY_TABLE} (
         metric_id, project_code, month_end, capacity_improvement,
         yield_savings, people_productivity, quality_improvement,
         changed_by, action_type
       )
       SELECT
         metric_id, project_code, month_end, capacity_improvement,
         yield_savings, people_productivity, quality_improvement,
         ?, 'UPDATE'
       FROM ${PROJECT_VALUES_TABLE}
       WHERE metric_id = ?`,
      [currentUser, metricId], req
    );

    const result = await queryPromise(
      `
        UPDATE ${PROJECT_VALUES_TABLE}
        SET
          project_code = ?,
          month_end = ?,
          capacity_improvement = ?,
          people_productivity = ?,
          quality_improvement = ?,
          yield_savings = ?
        WHERE metric_id = ?
      `,
      [
        project.project_code,
        payload.month_end,
        payload.capacity_improvement,
        payload.people_productivity,
        payload.quality_improvement,
        payload.yield_savings,
        metricId
      ],
      req
    );

    if (result.affectedRows === 0) {
      traceEnd(trace, { outcome: 'not_found' });
      return res.status(404).json({ message: 'Project value row not found.' });
    }

    const rows = await queryPromise(
      `
        SELECT
          v.metric_id,
          v.project_code,
          m.project_name,
          m.project_type,
          m.project_description,
          m.project_status,
          m.use_case_investment,
          DATE_FORMAT(v.month_end, '%Y-%m-%d') AS month_end,
          v.capacity_improvement,
          v.people_productivity,
          v.quality_improvement,
          v.yield_savings
        FROM ${PROJECT_VALUES_TABLE} v
        LEFT JOIN ${PROJECT_MASTER_TABLE} m
          ON v.project_code = m.project_code
        WHERE v.metric_id = ?
      `,
      [metricId],
      req
    );

    traceEnd(trace, { outcome: 'success', metricId });
    return res.json(rows[0]);
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message });
  }
});

app.delete('/api/project-values/:metricId', authenticateToken, requireAdmin, async (req, res) => {
  const trace = traceStart('DELETE /api/project-values/:metricId', req, {
    metricId: req.params.metricId
  });

  try {
    const metricId = req.params.metricId;

    const result = await queryPromise(
      `
        DELETE FROM ${PROJECT_VALUES_TABLE}
        WHERE metric_id = ?
      `,
      [metricId],
      req
    );

    if (result.affectedRows === 0) {
      traceEnd(trace, { outcome: 'not_found' });
      return res.status(404).json({ message: 'Project value row not found.' });
    }

    traceEnd(trace, { outcome: 'success', metricId });
    return res.json({ message: 'Project value row deleted successfully.' });
  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message });
  }
});

app.post('/api/project-values/import', authenticateToken, upload.single('file'), async (req, res) => {
  const trace = traceStart('POST /api/project-values/import', req);

  if (!req.file) {
    traceEnd(trace, { outcome: 'no_file' });
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  const overwrite = req.body.overwrite === 'true';
  const currentUser = getCurrentUser(req);

  const filePath = req.file.path;
  const errors = [];

  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    const minimumColumns = [
      'month_end',
      'capacity_improvement',
      'people_productivity',
      'quality_improvement',
      'yield_savings'
    ];

    const firstRowColumns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const missingMinimum = minimumColumns.filter(col => !firstRowColumns.includes(col));

    if (missingMinimum.length > 0) {
      traceEnd(trace, { outcome: 'missing_columns', missingMinimum });
      return res.status(400).json({
        message: `Excel missing columns: ${missingMinimum.join(', ')}`
      });
    }

    const hasProjectCodeColumn = firstRowColumns.includes('project_code');
    const hasProjectNameColumn = firstRowColumns.includes('project_name');

    if (!hasProjectCodeColumn && !hasProjectNameColumn) {
      traceEnd(trace, { outcome: 'missing_project_identifier' });
      return res.status(400).json({
        message: 'Excel must contain either "project_code" or "project_name".'
      });
    }

    let inserted = 0;
    let updated = 0;
    let failed = 0;

    const parsedMap = new Map();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const payload = {
          project_code: normalizeText(row['project_code']),
          project_name: normalizeText(row['project_name']),
          month_end: parseStandardDate(row['month_end']), 
          capacity_improvement: normalizeNumber(row['capacity_improvement']),
          people_productivity: normalizeNumber(row['people_productivity']),
          quality_improvement: normalizeNumber(row['quality_improvement']),
          yield_savings: normalizeNumber(row['yield_savings'])
        };

        const validationError = validateProjectValuePayload(payload);
        if (validationError) throw new Error(validationError);

        const project = await resolveProject(req, payload);
        if (!project) throw new Error('Project not found in project master.');
        
        payload.resolved_project_code = project.project_code;

        const uniqueKey = `${payload.resolved_project_code}_${payload.month_end}`;
        parsedMap.set(uniqueKey, payload);

      } catch (rowErr) {
        failed += 1;
        errors.push({ row: i + 2, message: rowErr.message });
      }
    }

    const uniquePayloads = Array.from(parsedMap.values());

    for (const payload of uniquePayloads) {
      const existing = await queryPromise(
        `SELECT metric_id FROM ${PROJECT_VALUES_TABLE} WHERE project_code = ? AND CAST(month_end AS DATE) = CAST(? AS DATE)`,
        [payload.resolved_project_code, payload.month_end], req
      );

      if (existing.length > 0) {
        if (!overwrite) {
          return res.status(409).json({ 
            requires_confirmation: true, 
            message: 'Duplicate months detected. Waiting for user confirmation.' 
          });
        }
        payload.metric_id = existing[0].metric_id;
        payload.isUpdate = true;
      } else {
        payload.isUpdate = false;
      }
    }

    for (const payload of uniquePayloads) {
      if (payload.isUpdate) {
        
        await queryPromise(
          `INSERT INTO ${HISTORY_TABLE} (
             metric_id, project_code, month_end, capacity_improvement,
             yield_savings, people_productivity, quality_improvement,
             changed_by, action_type
           )
           SELECT
             metric_id, project_code, month_end, capacity_improvement,
             yield_savings, people_productivity, quality_improvement,
             ?, 'UPDATE'
           FROM ${PROJECT_VALUES_TABLE}
           WHERE metric_id = ?`,
          [currentUser, payload.metric_id], req
        );

        await queryPromise(
          `UPDATE ${PROJECT_VALUES_TABLE} SET capacity_improvement=?, people_productivity=?, quality_improvement=?, yield_savings=? WHERE metric_id=?`,
          [payload.capacity_improvement, payload.people_productivity, payload.quality_improvement, payload.yield_savings, payload.metric_id], req
        );
        updated += 1;
      } else {
        await queryPromise(
          `INSERT INTO ${PROJECT_VALUES_TABLE} (project_code, month_end, capacity_improvement, people_productivity, quality_improvement, yield_savings) VALUES (?, ?, ?, ?, ?, ?)`,
          [payload.resolved_project_code, payload.month_end, payload.capacity_improvement, payload.people_productivity, payload.quality_improvement, payload.yield_savings], req
        );
        inserted += 1;
      }
    }

    traceEnd(trace, { outcome: 'success', total: rows.length, inserted, updated, failed });

    return res.json({
      message: `Import completed. Inserted: ${inserted}, Updated: ${updated}, Failed: ${failed}.`,
      summary: { total: rows.length, inserted, updated, failed },
      errors
    });

  } catch (err) {
    traceError(trace, err);
    return res.status(500).json({ message: err.message || 'Excel import failed.' });
  } finally {
    safeUnlink(filePath);
  }
});


// Databricks request errors must never expose a request body or credentials.
app.use((err, req, res, next) => {
  if (!req.path.startsWith('/api/databricks')) return next(err);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(err.status === 413 ? 413 : 400).json({
    code: 'DATABRICKS_INVALID_REQUEST', message: 'Invalid Databricks request. Refresh the table to retry.'
  });
});

// =====================================
// Start server
// =====================================
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
