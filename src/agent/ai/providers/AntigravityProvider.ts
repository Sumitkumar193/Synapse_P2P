import { ILLMProvider, LLMMessage, LLMOptions, LLMResponse } from '../LLMInterface';
import { CLITransport } from '../transports/CLITransport';
import { HTTPTransport } from '../transports/HTTPTransport';

export interface AntigravityProviderConfig {
  command?: string;
  baseUrl?: string;
}

/**
 * Native Real Google Antigravity Agent Provider (Gemini 3.6 Flash Engine).
 * Executes live Antigravity CLI (`agy`) or Antigravity Python SDK bridge via STDIN transport.
 * Streams full untruncated answers directly to Chat UI.
 */
export class AntigravityProvider implements ILLMProvider {
  public readonly id = 'antigravity';
  public readonly name = 'Google Antigravity Engine (Gemini 3.6 Flash)';
  private cli: CLITransport;
  private http: HTTPTransport;
  private command: string;
  private baseUrl: string;

  constructor(config: AntigravityProviderConfig = {}) {
    this.cli = new CLITransport();
    this.http = new HTTPTransport();
    this.command = config.command || process.env.ANTIGRAVITY_COMMAND || 'agy';
    this.baseUrl = config.baseUrl || process.env.ANTIGRAVITY_BASE_URL || 'http://127.0.0.1:8080/v1';
  }

  public async complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const lastUserMsg = messages.filter((m) => m.role === 'user').pop()?.content || '';
    const selectedModel = options?.model || 'gemini-3.6-flash';

    // Method 1: Try real Antigravity HTTP API Endpoint if running locally
    try {
      const response = await this.http.request({
        url: `${this.baseUrl.replace(/\/$/, '')}/chat/completions`,
        method: 'POST',
        body: {
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          model: selectedModel,
        },
        timeoutMs: 30000,
      });

      const content = response.choices?.[0]?.message?.content || response.content;
      if (content && content.trim()) {
        return { content: content.trim() };
      }
    } catch {
      // Continue to Method 2: agy CLI with STDIN
    }

    // Method 2: Execute system `agy` CLI binary using STDIN (handles multiline prompts & Gemini 3.6 Flash)
    if (this.cli.isAvailable(this.command)) {
      try {
        console.log(`[Antigravity 🚀] Executing agy STDIN completion with ${selectedModel}...`);
        const stdout = await this.cli.execute({
          command: this.command,
          args: ['prompt', '--model', selectedModel],
          input: lastUserMsg,
          timeoutMs: 45000,
        });

        if (stdout && stdout.trim()) {
          return { content: stdout.trim() };
        }
      } catch {
        // Try agy chat command with STDIN
        try {
          const stdout = await this.cli.execute({
            command: this.command,
            args: ['chat', '--model', selectedModel],
            input: lastUserMsg,
            timeoutMs: 45000,
          });

          if (stdout && stdout.trim()) {
            return { content: stdout.trim() };
          }
        } catch (err: any) {
          console.warn(`[Antigravity CLI Warning] '${this.command}' notice:`, err.message);
        }
      }
    }

    // Method 3: Python Antigravity SDK bridge via STDIN with Gemini 3.6 Flash
    if (this.cli.isAvailable('python')) {
      try {
        console.log(`[Antigravity 🐍] Executing python google.antigravity bridge with ${selectedModel}...`);
        const pythonScript = `import sys, asyncio; from google.antigravity import Agent; async def m():\n p = sys.stdin.read(); async with Agent(model='${selectedModel}') as a:\n  r = await a.chat(p); print(await r.get_text())\nasyncio.run(m())`;
        const stdout = await this.cli.execute({
          command: 'python',
          args: ['-c', pythonScript],
          input: lastUserMsg,
          timeoutMs: 45000,
        });

        if (stdout && stdout.trim()) {
          return { content: stdout.trim() };
        }
      } catch (err: any) {
        console.warn('[Antigravity Python Bridge Notice]:', err.message);
      }
    }

    return {
      content: `[Antigravity Session Notice] Antigravity CLI '${this.command}' requires session authentication. Please run 'agy login' in your terminal or configure your OPENAI_API_KEY / Ollama in Settings.`,
    };
  }
}

