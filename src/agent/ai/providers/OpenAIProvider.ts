import { ILLMProvider, LLMMessage, LLMOptions, LLMResponse } from '../LLMInterface';
import { HTTPTransport } from '../transports/HTTPTransport';

export class OpenAIProvider implements ILLMProvider {
  public readonly id = 'openai';
  public readonly name = 'OpenAI REST Provider';
  private transport: HTTPTransport;

  constructor(private apiKey?: string, private baseUrl: string = 'https://api.openai.com/v1') {
    this.transport = new HTTPTransport();
  }

  public async complete(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
    const key = this.apiKey || process.env.OPENAI_API_KEY;

    // Offline / Mock fallback if no API key present during local test execution
    if (!key) {
      const lastUserMsg = messages.filter((m) => m.role === 'user').pop()?.content || '';
      return {
        content: `[OpenAI Mock Response] Analyzed request: ${lastUserMsg}. Recommendation: Use CAP theorem principles (Consistency vs Availability under Partition).`,
        usage: { promptTokens: 10, completionTokens: 25, totalTokens: 35 },
      };
    }

    const endpoint = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const model = options.model || 'gpt-4o-mini';

    const payload: any = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1000,
    };

    if (options.tools && options.tools.length > 0) {
      payload.tools = options.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
    }

    const response = await this.transport.request({
      url: endpoint,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
      },
      body: payload,
    });

    const choice = response.choices?.[0]?.message;
    const content = choice?.content || '';

    let toolCalls: any[] | undefined;
    if (choice?.tool_calls && choice.tool_calls.length > 0) {
      toolCalls = choice.tool_calls.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments || '{}'),
      }));
    }

    return {
      content,
      toolCalls,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  }
}
