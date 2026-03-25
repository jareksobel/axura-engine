type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function log(level: LogLevel, module: string, message: string, meta?: unknown): void {
  const entry: LogEntry = {
    level,
    module,
    message,
    timestamp: new Date().toISOString(),
  };

  if (meta !== undefined) {
    if (meta instanceof Error) {
      entry['error'] = meta.message;
      entry['stack'] = meta.stack;
    } else if (typeof meta === 'object' && meta !== null) {
      Object.assign(entry, meta);
    } else {
      entry['data'] = meta;
    }
  }

  const output = JSON.stringify(entry);

  if (level === 'error' || level === 'warn') {
    console.error(output);
  } else {
    console.log(output);
  }
}

export function createLogger(module: string) {
  return {
    debug: (message: string, meta?: unknown) => log('debug', module, message, meta),
    info:  (message: string, meta?: unknown) => log('info',  module, message, meta),
    warn:  (message: string, meta?: unknown) => log('warn',  module, message, meta),
    error: (message: string, meta?: unknown) => log('error', module, message, meta),
  };
}
