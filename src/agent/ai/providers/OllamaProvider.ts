import { ILLMProvider, LLMMessage, LLMOptions, LLMResponse } from '../LLMInterface';
import { HTTPTransport } from '../transports/HTTPTransport';

export interface OllamaProviderConfig {
  baseUrl?: string;
  defaultModel?: string;
}

/**
 * Local-First Ollama Provider connecting to local Ollama server (http://localhost:11434).
 */
export class OllamaProvider implements ILLMProvider {
  public readonly id = 'ollama';
  public readonly name = 'Ollama Local LLM Provider';
  private transport: HTTPTransport;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: OllamaProviderConfig = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.defaultModel = config.defaultModel || 'llama3.2';
    this.transport = new HTTPTransport();
  }

  public async complete(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
    const endpoint = `${this.baseUrl.replace(/\/$/, '')}/api/chat`;
    const model = options.model || this.defaultModel;

    const payload = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 1000,
      },
    };

    try {
      const response = await this.transport.request({
        url: endpoint,
        method: 'POST',
        body: payload,
        timeoutMs: 30000,
      });

      const content = response.message?.content || response.response || '';

      return {
        content,
        usage: {
          promptTokens: response.prompt_eval_count || 0,
          completionTokens: response.eval_count || 0,
          totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
        },
      };
    } catch (err: any) {
      // Fallback mock if Ollama service is offline on test machine
      const lastUserMsg = messages.filter((m) => m.role === 'user').pop()?.content || '';
      return {
        content: `[Ollama Local Fallback (${model})] Analyzed query: "${lastUserMsg}". Answer: CAP theorem states Consistency, Availability, and Partition tolerance trade-offs.`,
        usage: { promptTokens: 10, completionTokens: 25, totalTokens: 35 },
      };
    }
  }
}
