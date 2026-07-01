import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

const LEVEL_COLOR: Record<string, string> = {
  error: '\x1b[31m',
  warn:  '\x1b[33m',
  log:   '\x1b[32m',
  info:  '\x1b[32m',
  debug: '\x1b[36m',
  verbose: '\x1b[37m',
};
const RESET = '\x1b[0m';
const DIM   = '\x1b[2m';

const devFormat = winston.format.printf(({ level, message, context, timestamp, ...meta }) => {
  const color = LEVEL_COLOR[level] ?? '';
  const ctx   = context ? `${DIM}[${context}]${RESET} ` : '';
  const ts    = timestamp ? `${DIM}${timestamp}${RESET}  ` : '';
  const extra = Object.keys(meta).length ? ` ${DIM}${JSON.stringify(meta)}${RESET}` : '';
  return `${ts}${color}${level.toUpperCase()}${RESET} ${ctx}${message}${extra}`;
});

export function createAppLogger() {
  return process.env.NODE_ENV === 'production'
    ? WinstonModule.createLogger({
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.json(),
            ),
          }),
        ],
      })
    : WinstonModule.createLogger({
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.timestamp({ format: 'HH:mm:ss' }),
              devFormat,
            ),
          }),
        ],
      });
}
