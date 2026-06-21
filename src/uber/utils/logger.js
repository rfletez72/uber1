'use strict';

const { createLogger, format, transports } = require('winston');
const Transport = require('winston-transport');
const path = require('path');

const errorLogFile = path.join(__dirname, '../../../logs/ubererror.log');

// Captures 'warn' and 'error' — Winston routes both levels through a transport set to 'warn'
class DBLogTransport extends Transport {
  constructor(opts) {
    super({ ...opts, level: 'warn' }); // 'warn' = warn + error (error is more severe)
    // File transport used only when DB is unavailable
    this._file = new transports.File({ filename: errorLogFile, level: 'warn' });
  }

  log(info, callback) {
    const { level, message, timestamp, ...rest } = info;
    const meta = Object.keys(rest).length ? JSON.stringify(rest) : null;

    if (global.UberModels?.UberErrorLog) {
      global.UberModels.UberErrorLog.create({ level, message, meta })
        .catch(() => this._file.log(info, () => {})); // DB failed — fall back to file
    } else {
      this._file.log(info, () => {}); // DB not ready yet — fall back to file
    }

    callback();
  }
}

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      )
    }),
    new DBLogTransport(),
    // disabled — was for info/warn combined log:
    // new transports.File({
    //   filename: path.join(__dirname, '../../logs/combined.log')
    // })
  ]
});

module.exports = logger;
