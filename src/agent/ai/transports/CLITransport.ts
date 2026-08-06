import { execFile, execFileSync, ChildProcess } from 'child_process';


export interface CLIExecutionOptions {
  command: string;
  args?: string[];
  input?: string;
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * Transport abstraction for CLI subprocess execution (e.g. system-installed claude / copilot CLI tools).
 */
export class CLITransport {
  public async execute(options: CLIExecutionOptions): Promise<string> {
    const { command, args = [], input, timeoutMs = 30000, cwd, env } = options;

    return new Promise((resolve, reject) => {
      const child = execFile(
        command,
        args,
        {
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024,
          cwd,
          env: { ...process.env, ...env },
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`CLI command '${command}' failed: ${stderr || error.message}`));
            return;
          }
          resolve(stdout.trim());
        }
      );

      if (input && child.stdin) {
        child.stdin.write(input);
        child.stdin.end();
      }
    });
  }

  /**
   * Check if a CLI command is installed and executable on the host system.
   */
  public isAvailable(command: string): boolean {
    try {
      const checkCmd = process.platform === 'win32' ? 'where' : 'which';
      execFileSync(checkCmd, [command], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
