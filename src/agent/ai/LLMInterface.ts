export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, any>;
  }>;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, any>;
  }>;
}

export interface LLMResponse {
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, any>;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export type LLMStreamCallback = (chunk: { delta: string; isComplete: boolean }) => void;

/**
 * Decoupled Interface for AI LLM Engine Providers.
 */
export interface ILLMProvider {
  readonly id: string;
  readonly name: string;

  /**
   * Execute a single non-streaming completion.
   */
  complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;

  /**
   * Execute a streaming completion.
   */
  stream?(messages: LLMMessage[], options?: LLMOptions, onChunk?: LLMStreamCallback): Promise<LLMResponse>;
}
