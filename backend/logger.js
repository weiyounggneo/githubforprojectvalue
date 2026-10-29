const winston = require('winston');
const path = require('path');

const safeJsonFormat = winston.format((info) => {
  const cloned = { ...info };

  for (const key of Object.keys(cloned)) {
    const value = cloned[key];

    if (value instanceof Error) {
      cloned[key] = {
        message: value.message,
        stack: value.stack,
        name: value.name
      };
      continue;
    }

    if (typeof value === 'object' && value !== null) {
      try {
        JSON.stringify(value);
      } catch (err) {
        cloned[key] = String(value);
      }
    }
  }

  return cloned;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  defaultMeta: { service: 'backend' },
  format: winston.format.combine(
    safeJsonFormat(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      let line = `[${timestamp}] ${level.toUpperCase()}: ${message}`;

      if (Object.keys(meta).length > 0) {
        try {
          line += ` | ${JSON.stringify(meta)}`;
        } catch (err) {
          line += ` | {"meta":"unserializable"}`;
        }
      }

      if (stack) {
        line += `\n${stack}`;
      }

      return line;
    })
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/combined.log'),
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

module.exports = logger;