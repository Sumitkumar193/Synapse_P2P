export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export class Logger {
  private static level: LogLevel = LogLevel.INFO;
  private prefix: string;

  constructor(prefix: string = 'P2PMediaSDK') {
    this.prefix = prefix;
  }

  public static setLogLevel(level: LogLevel): void {
    Logger.level = level;
  }

  public debug(message: string, ...args: any[]): void {
    if (Logger.level <= LogLevel.DEBUG) {
      console.log(`[DEBUG] [${this.prefix}] ${message}`, ...args);
    }
  }

  public info(message: string, ...args: any[]): void {
    if (Logger.level <= LogLevel.INFO) {
      console.info(`[INFO] [${this.prefix}] ${message}`, ...args);
    }
  }

  public warn(message: string, ...args: any[]): void {
    if (Logger.level <= LogLevel.WARN) {
      console.warn(`[WARN] [${this.prefix}] ${message}`, ...args);
    }
  }

  public error(message: string, ...args: any[]): void {
    if (Logger.level <= LogLevel.ERROR) {
      console.error(`[ERROR] [${this.prefix}] ${message}`, ...args);
    }
  }
}
