const logger = require('./logger');

function createTraceId() {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getTraceId(req = null) {
  if (!req) return createTraceId();

  if (!req._traceId) {
    req._traceId =
      req.headers['x-trace-id']
      || req.headers['X-Trace-Id']
      || createTraceId();
  }

  return req._traceId;
}

function buildLogMeta(req = null, meta = {}) {
  const baseMeta = {
    traceId: req ? getTraceId(req) : createTraceId()
  };

  if (req) {
    baseMeta.method = req.method;
    baseMeta.path = req.originalUrl || req.url || null;
  }

  const safeMeta = {};

  for (const [key, value] of Object.entries(meta || {})) {
    if (
      value === null
      || value === undefined
      || typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
    ) {
      safeMeta[key] = value;
    } else if (Array.isArray(value)) {
      safeMeta[key] = value.map((v) => {
        if (
          v === null
          || v === undefined
          || typeof v === 'string'
          || typeof v === 'number'
          || typeof v === 'boolean'
        ) {
          return v;
        }
        return String(v);
      });
    } else {
      try {
        safeMeta[key] = JSON.parse(JSON.stringify(value));
      } catch (err) {
        safeMeta[key] = String(value);
      }
    }
  }

  return {
    ...baseMeta,
    ...safeMeta
  };
}

function traceStart(functionName, req = null, meta = {}) {
  const startTime = Date.now();
  const logMeta = buildLogMeta(req, meta);

  logger.debug(`START ${functionName}`, {
    ...logMeta,
    phase: 'start',
    startTime
  });

  return {
    functionName,
    req,
    startTime,
    meta: logMeta
  };
}

function traceEnd(trace, meta = {}) {
  if (!trace) return;

  const durationMs = Date.now() - trace.startTime;
  const logMeta = buildLogMeta(trace.req, {
    ...trace.meta,
    ...meta
  });

  logger.debug(`END ${trace.functionName}`, {
    ...logMeta,
    phase: 'end',
    durationMs
  });
}

function traceError(trace, err, meta = {}) {
  if (!trace) {
    logger.error('ERROR unknown_trace', {
      ...buildLogMeta(null, meta),
      errorMessage: err?.message || String(err),
      errorName: err?.name || 'Error',
      stack: err?.stack || null,
      code: err?.code || null
    });
    return;
  }

  const durationMs = Date.now() - trace.startTime;
  const logMeta = buildLogMeta(trace.req, {
    ...trace.meta,
    ...meta
  });

  logger.error(`ERROR ${trace.functionName}`, {
    ...logMeta,
    phase: 'error',
    durationMs,
    errorMessage: err?.message || String(err),
    errorName: err?.name || 'Error',
    stack: err?.stack || null,
    code: err?.code || null
  });
}

module.exports = {
  createTraceId,
  getTraceId,
  buildLogMeta,
  traceStart,
  traceEnd,
  traceError
};