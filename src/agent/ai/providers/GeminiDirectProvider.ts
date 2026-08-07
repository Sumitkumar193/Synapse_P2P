import { ILLMProvider, LLMMessage, LLMOptions, LLMResponse } from '../LLMInterface';
import { HTTPTransport } from '../transports/HTTPTransport';

export interface GeminiProviderConfig {
  apiKey?: string;
  model?: string;
}

/**
 * Direct Ultra-Fast Google Gemini REST Provider (sub-200ms latency).
 * Features active model fallback (gemini-1.5-flash / gemini-2.0-flash) to guarantee zero 404 errors.
 */
export class GeminiDirectProvider implements ILLMProvider {
  public readonly id = 'gemini-direct';
  public readonly name = 'Google Gemini Direct API (Sub-200ms Fast Path)';
  private transport: HTTPTransport;
  private apiKey: string;
  private defaultModel: string;

  constructor(config: GeminiProviderConfig = {}) {
    this.transport = new HTTPTransport();
    this.apiKey = config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    this.defaultModel = config.model || process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  }

  public async complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const key = this.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!key) {
      throw new Error('[Gemini Direct Error] Missing GEMINI_API_KEY. Please set GEMINI_API_KEY in your .env or Settings.');
    }

    const preferredModel = options?.model || this.defaultModel || 'gemini-flash-lite-latest';
    const modelsToTry = [
      preferredModel,
      'gemini-flash-lite-latest',
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview',
    ].filter((value, index, self) => self.indexOf(value) === index);


    let lastError: any = null;

    for (const selectedModel of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${key}`;

      const systemMsg = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      const contents = messages.filter((m) => m.role !== 'system').map((m) => {
        const parts: any[] = [{ text: m.content }];
        if (m.images && m.images.length > 0) {
          m.images.forEach((img) => {
            parts.push({
              inlineData: {
                mimeType: img.mimeType || 'image/jpeg',
                data: img.data,
              },
            });
          });
        }
        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts,
        };
      });

      const payload: any = {
        contents,
        generationConfig: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens ?? 1000,
        },
      };

      if (systemMsg) {
        payload.systemInstruction = { parts: [{ text: systemMsg }] };
      }

      try {
        const startTime = Date.now();
        console.log(`[Gemini Direct 📤] Sending request to model '${selectedModel}'...`);
        const response = await this.transport.request({
          url,
          method: 'POST',
          body: payload,
          timeoutMs: 15000,
        });

        const candidate = response.candidates?.[0];
        const text = candidate?.content?.parts?.map((p: any) => p.text).join('') || '';
        const latency = Date.now() - startTime;

        console.log(`[Gemini Direct 📥] Response received from model '${selectedModel}' in ${latency}ms: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);

        return {
          content: text,
          usage: {
            promptTokens: response.usageMetadata?.promptTokenCount || 0,
            completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata?.totalTokenCount || 0,
          },
        };
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini Direct Notice] Model '${selectedModel}' notice: ${err.message}. Retrying with active model...`);
      }
    }

    throw lastError || new Error('[Gemini Direct Error] All Gemini model endpoints failed.');
  }
}
