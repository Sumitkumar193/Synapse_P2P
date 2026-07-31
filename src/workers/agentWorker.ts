import { container } from '../shared/Container';
import { eventBus } from '../shared/EventBus';
import { ILLMProvider } from '../agent/ai/LLMInterface';
import { OpenAIProvider } from '../agent/ai/providers/OpenAIProvider';
import { ClaudeCLIProvider } from '../agent/ai/providers/ClaudeCLIProvider';
import { OllamaProvider } from '../agent/ai/providers/OllamaProvider';
import { WorkflowEngine } from '../workflow/WorkflowEngine';
import { AppSettings, DEFAULT_APP_SETTINGS } from '../shared/settings';
import { SettingsManager } from '../main/settingsManager';

export class AgentWorkerController {
  public readonly workflowEngine: WorkflowEngine;
  private activeProvider: ILLMProvider;
  private isRunning = false;
  private unsubscribers: Array<() => void> = [];

  constructor(providerId?: string, customSettings?: Partial<AppSettings>) {
    this.workflowEngine = new WorkflowEngine();
    
    let settings: AppSettings = DEFAULT_APP_SETTINGS;
    try {
      settings = SettingsManager.getInstance().getSettings();
    } catch {}

    if (customSettings) {
      settings = { ...settings, ...customSettings };
    }

    const selectedProvider = providerId || settings.llmProvider;

    if (selectedProvider === 'claude-cli') {
      this.activeProvider = new ClaudeCLIProvider(settings.claudeCommand);
    } else if (selectedProvider === 'ollama') {
      this.activeProvider = new OllamaProvider({
        baseUrl: settings.ollamaBaseUrl,
        defaultModel: settings.ollamaModel,
      });
    } else {
      this.activeProvider = new OpenAIProvider(settings.openAiApiKey);
    }

    container.register<ILLMProvider>('LLMProvider', this.activeProvider);
    container.register<WorkflowEngine>('WorkflowEngine', this.workflowEngine);
  }


  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.workflowEngine.start();

    // Subscribe to transcript.final events on EventBus
    const unsub = eventBus.on('transcript.final', async (payload) => {
      await this.handleTranscriptFinal(payload);
    });

    this.unsubscribers.push(unsub);
  }

  public stop(): void {
    this.isRunning = false;
    this.workflowEngine.stop();
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
  }

  public setProvider(provider: ILLMProvider): void {
    this.activeProvider = provider;
    container.register<ILLMProvider>('LLMProvider', this.activeProvider);
  }

  private async handleTranscriptFinal(payload: { text: string; speaker: 'local' | 'remote'; timestamp: number }): Promise<void> {

    if (!this.isRunning) return;

    // 1. Evaluate workflow engine rules
    await this.workflowEngine.evaluateRules('transcript.final', payload);

    // 2. Generate AI Copilot response for interview questions
    if (payload.text.length > 5) {
      try {
        const response = await this.activeProvider.complete([
          {
            role: 'system',
            content: 'You are an AI Interview Copilot. Provide concise, clear technical assistance.',
          },
          {
            role: 'user',
            content: payload.text,
          },
        ]);

        if (response.content) {
          eventBus.emit('chat_received', {
            id: `msg_${Math.random().toString(36).substring(2, 9)}`,
            sender: `🤖 Copilot (${this.activeProvider.id})`,
            text: response.content,
            timestamp: Date.now(),
            isAi: true,
          });
        }
      } catch (err) {
        console.error('[AgentWorker] LLM provider completion error:', err);
      }
    }
  }
}
