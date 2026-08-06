import * as vm from 'vm';

export interface SandboxExecutionOptions {
  timeoutMs?: number;
}

/**
 * Isolated Node.js vm Sandbox with Per-Plugin Crash Shielding and Execution Timeout Controls.
 */
export class PluginSandbox {
  private context: vm.Context;

  constructor(sandboxGlobals: Record<string, any> = {}) {
    // Expose only safe, capability-scoped globals inside the VM context
    const globals = {
      console: {
        log: (...args: any[]) => console.log('[Plugin VM]', ...args),
        warn: (...args: any[]) => console.warn('[Plugin VM Warning]', ...args),
        error: (...args: any[]) => console.error('[Plugin VM Error]', ...args),
      },
      setTimeout,
      clearTimeout,
      Date,
      Math,
      JSON,
      Buffer,
      ...sandboxGlobals,
    };

    this.context = vm.createContext(globals);
  }

  /**
   * Execute JavaScript code string inside isolated VM context with crash shield and timeout control.
   */
  public executeCode<T = any>(code: string, options: SandboxExecutionOptions = {}): T {
    const { timeoutMs = 2000 } = options;

    try {
      const script = new vm.Script(code);
      return script.runInContext(this.context, {
        timeout: timeoutMs,
        displayErrors: true,
      });
    } catch (err: any) {
      throw new Error(`Plugin Sandbox Execution Error: ${err.message}`);
    }
  }

  /**
   * Safe method invocation wrapper for plugin lifecycle callbacks (e.g. onLoad, onEnable).
   */
  public async invokeSafe<T = any>(fn: (...args: any[]) => any, args: any[] = [], timeoutMs: number = 2000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Plugin execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = fn(...args);
        if (result && typeof result.then === 'function') {
          result
            .then((val: any) => {
              clearTimeout(timer);
              resolve(val);
            })
            .catch((err: any) => {
              clearTimeout(timer);
              reject(err);
            });
        } else {
          clearTimeout(timer);
          resolve(result);
        }
      } catch (err: any) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }
}
