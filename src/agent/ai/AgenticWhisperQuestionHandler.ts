import { eventBus } from '../../shared/EventBus';
import { MCPAdapter } from '../mcp/MCPAdapter';
import { ILLMProvider } from './LLMInterface';
import { prompts } from './promptManager';

export interface QuestionAssertion {
  intent: string; // 'question' | 'debug' | 'solve' | 'optimize' | 'explain' | 'ignore'
  normalizedQuery: string;
  needsScreenContext: boolean;
  needsClipboardContext: boolean;
  confidence: number;
}

export interface ProcessingResult {
  handled: boolean;
  question?: string;
  answer?: string;
  clipboardUsed?: boolean;
  screenshotCaptured?: boolean;
}

/**
 * Autonomous Agentic Question Evaluator & Multimodal Context Collector.
 * Listens to Whisper STT speech events, asserts question intent dynamically,
 * gathers host clipboard & screen capture context via MCP, and outputs answers to Chat UI.
 */
export class AgenticWhisperQuestionHandler {
  private mcpAdapter: MCPAdapter;
  private llmProvider: ILLMProvider;
  private isProcessing = false;
  private enabled = true;
  private cooldownUntil = 0;
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  constructor(mcpAdapter: MCPAdapter, llmProvider: ILLMProvider) {
    this.mcpAdapter = mcpAdapter;
    this.llmProvider = llmProvider;
    this.initListeners();
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setLLMProvider(provider: ILLMProvider): void {
    this.llmProvider = provider;
  }

  public clearHistory(): void {
    this.conversationHistory = [];
    console.log('[AgenticEvaluator] Conversation history cleared.');
  }

  public async triggerScreenAnalysis(customPrompt?: string): Promise<ProcessingResult> {
    const promptText = customPrompt || 'Please analyze the active screen screenshot, identify any visible code or errors, and provide a clear, surgical interview-aware solution.';
    console.log('[AgenticEvaluator 📸] Manual screen capture AI analysis triggered via shortcut!');
    return await this.processSpeechSegment(promptText, 'Shortcut (Ctrl+Shift+S)', true);
  }

  private initListeners(): void {
    eventBus.on('transcript.final', async (evt) => {
      if (!this.enabled || this.isProcessing) return;
      await this.processSpeechSegment(evt.text, evt.speaker, false);
    });

    eventBus.on('transcript.clear', () => {
      this.clearHistory();
    });

    eventBus.on('ai.trigger_screen_analysis', async (payload: any) => {
      if (!this.enabled || this.isProcessing) return;
      await this.triggerScreenAnalysis(payload?.prompt);
    });
  }

  /**
   * Process a single final speech transcript segment.
   */
  public async processSpeechSegment(
    transcriptText: string,
    speaker: string = 'local',
    forceScreenContext: boolean = false
  ): Promise<ProcessingResult> {
    const text = transcriptText.trim();
    if (!text) return { handled: false };

    // Check if system is in cooldown due to recent 429 quota exhaustion
    if (Date.now() < this.cooldownUntil) {
      return { handled: false };
    }

    // Step 1: Classify intent or bypass if triggered manually via shortcut
    let assertion: QuestionAssertion;
    if (forceScreenContext) {
      // Shortcuts & manual buttons: bypass classifier completely
      assertion = {
        intent: 'question',
        normalizedQuery: text,
        needsScreenContext: true,
        needsClipboardContext: true,
        confidence: 1.0,
      };
    } else {
      assertion = await this.assertQuestionIntent(text);

      // Guarantee screen context when user speech explicitly mentions screen, view, look, show, problem, question, solve, fix, or code
      const mentionsScreenOrProblem = /screen|on my screen|this screen|view|look|show|problem|question|solve|fix|debug|error|code|failing|stuck|solution/i.test(text);
      if (mentionsScreenOrProblem) {
        assertion.needsScreenContext = true;
      }

      // Fallback: If classifier mistakenly flagged longer speech or question text as 'ignore', recover it
      const looksLikeQuestionOrStatement = text.length > 20 || /[?]/i.test(text) || /what|how|why|explain|describe|solve|fix|debug|is|does|can|which|where|when|view|show/i.test(text);
      if (assertion.intent === 'ignore' && looksLikeQuestionOrStatement) {
        console.log(`[AgenticEvaluator 🛡️] Recovered falsely ignored speech segment: "${text}"`);
        assertion.intent = 'question';
        assertion.confidence = 0.8;
      }
    }

    if (assertion.intent === 'ignore' || assertion.confidence < 0.5) {
      console.log(`[AgenticEvaluator] Segment skipped (intent: ${assertion.intent}, confidence: ${assertion.confidence.toFixed(2)}): "${text}"`);
      return { handled: false };
    }

    // Use the normalized query for downstream LLM calls (fixes misheard speech)
    const normalizedQuery = assertion.normalizedQuery || text;
    console.log(`[AgenticEvaluator 🚀] Intent: ${assertion.intent} | Normalized: "${normalizedQuery}" | Confidence: ${assertion.confidence.toFixed(2)}`);
    this.isProcessing = true;

    try {
      let clipboardContext: string | null = null;
      let screenshotCaptured = false;
      let screenshotData: any = null;

      // Step 2A: Capture clipboard context ONLY if intent classifier determined it is explicitly needed
      if (assertion.needsClipboardContext) {
        try {
          const clipboardRes = await this.mcpAdapter.executeTool('clipboard_read', {}, 'AgenticEvaluator');
          if (clipboardRes && clipboardRes.text && clipboardRes.text.trim().length > 0) {
            // Cap clipboard text to 2000 characters to conserve LLM token budget
            clipboardContext = clipboardRes.text.trim().substring(0, 2000);
          }
        } catch (err) {
          console.warn('[AgenticEvaluator] Clipboard read notice:', err);
        }
      }

      // Step 2B: Capture screen screenshot ONLY if intent classifier determined screen context is needed
      if (assertion.needsScreenContext) {
        try {
          console.log('[AgenticEvaluator 📸] Capturing active screen context...');
          screenshotData = await this.mcpAdapter.executeTool(
            'capture_screen',
            { format: 'jpeg', quality: 75 },
            'AgenticEvaluator'
          );
          screenshotCaptured = Boolean(screenshotData);
        } catch (err) {
          console.warn('[AgenticEvaluator] Screen capture notice:', err);
        }
      }

      // Step 3: Synthesize multimodal prompt using normalized query
      let prompt = `User Spoken Question (${speaker}): "${normalizedQuery}"\n\n`;
      let imagesList: Array<{ mimeType: string; data: string }> | undefined = undefined;

      if (screenshotData) {
        const rawUrl =
          screenshotData.thumbnailDataUrl ||
          screenshotData.dataUrl ||
          screenshotData.thumbnail ||
          screenshotData.result?.thumbnailDataUrl ||
          screenshotData.result?.dataUrl;

        if (typeof rawUrl === 'string' && rawUrl.startsWith('data:image/')) {
          const parts = rawUrl.split(';base64,');
          if (parts.length === 2) {
            const mimeType = parts[0].replace('data:', '').trim();
            const base64Data = parts[1].replace(/[\r\n\s]/g, '');
            imagesList = [
              {
                mimeType,
                data: base64Data,
              },
            ];
            prompt += `--- Active Screen Screenshot Attached Inline ---\n\n`;
            console.log(`[AgenticEvaluator 🖼️] Active screen JPEG thumbnail attached to multimodal LLM request (${base64Data.length} chars base64).`);
          }
        } else {
          console.warn('[AgenticEvaluator ⚠️] Could not extract base64 image from capture_screen output:', screenshotData);
        }
      }

      // Attach clipboard context if explicitly requested by user query
      if (clipboardContext) {
        prompt += `--- Host OS Clipboard Context ---\n${clipboardContext}\n\n`;
      }

      prompt += `Please provide a clear, accurate, and concise answer to the spoken question.`;

      const messagesToSend: any[] = [
        {
          role: 'system',
          content: prompts.systemPrompts.technicalAssistant,
        },
        ...this.conversationHistory.map((h) => ({
          role: h.role,
          content: h.content,
        })),
        {
          role: 'user',
          content: prompt,
          images: imagesList,
        },
      ];

      const historyTurns = Math.floor(this.conversationHistory.length / 2);
      console.log(`[AgenticEvaluator 🧠] Querying LLM Provider (${this.llmProvider.name}) with ${imagesList ? 'multimodal image' : 'text'} prompt (${historyTurns} prior Q&A turns)...`);
      const response = await this.llmProvider.complete(messagesToSend);

      const answerText = response.content || 'I completed processing your question.';
      console.log(`[AgenticEvaluator ✅] AI Answer generated: "${answerText.substring(0, 60)}..."`);

      // Store Q&A exchange into multi-turn conversation history (up to 10 turns = 20 messages)
      this.conversationHistory.push({
        role: 'user',
        content: `User Spoken Question (${speaker}): "${normalizedQuery}"`,
      });
      this.conversationHistory.push({
        role: 'assistant',
        content: answerText,
      });

      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(this.conversationHistory.length - 20);
      }

      // Step 4: Post answer directly to Chat UI stream via MCP tool
      console.log('[AgenticEvaluator 📤] Executing send_chat MCP tool to post answer to Chat UI...');
      await this.mcpAdapter.executeTool(
        'send_chat',
        { text: `💡 **AI Assistant Answer:**\n${answerText}` },
        'AgenticQuestionHandler'
      );


      return {
        handled: true,
        question: normalizedQuery,
        answer: answerText,
        clipboardUsed: Boolean(clipboardContext),
        screenshotCaptured,
      };
    } catch (err: any) {
      if (err.message && (err.message.includes('429') || err.message.includes('quota'))) {
        console.warn('[AgenticEvaluator] LLM 429 Quota limit hit. Cooling down for 30 seconds.');
        this.cooldownUntil = Date.now() + 30000;
      } else {
        console.error('[AgenticEvaluator] Error processing question:', err);
      }
      return { handled: false };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Single-call intent classifier: detects intent, normalizes query, determines context needs.
   * Returns structured assertion with intent type, normalized speech, and confidence score.
   */
  private async assertQuestionIntent(text: string): Promise<QuestionAssertion> {
    const trimmed = text.trim();
    if (!trimmed) {
      return {
        intent: 'ignore',
        normalizedQuery: '',
        needsScreenContext: false,
        needsClipboardContext: false,
        confidence: 1.0,
      };
    }

    try {
      const response = await this.llmProvider.complete([
        {
          role: 'system',
          content: prompts.systemPrompts.intentClassifier,
        },
        {
          role: 'user',
          content: `Classify this spoken segment: "${trimmed}"`,
        },
      ]);

      const rawContent = response.content || '';
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          intent: parsed.intent || 'question',
          normalizedQuery: parsed.normalizedQuery || trimmed,
          needsScreenContext: Boolean(parsed.needsScreen),
          needsClipboardContext: Boolean(parsed.needsClipboard),
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
        };
      }

      // Fallback heuristic if JSON parsing fails
      return {
        intent: 'question',
        normalizedQuery: trimmed,
        needsScreenContext: /screen|code|error|diagram|ui|window|failing|bug|fix|stuck|debug/i.test(text),
        needsClipboardContext: /clipboard|copied|paste/i.test(text),
        confidence: 0.7,
      };
    } catch (err: any) {
      if (err.message && (err.message.includes('429') || err.message.includes('quota'))) {
        console.warn('[AgenticEvaluator] Intent assertion 429 quota hit. Cooling down for 30s.');
        this.cooldownUntil = Date.now() + 30000;
      } else {
        console.warn('[AgenticEvaluator Notice] Intent assertion model notice:', err.message || err);
      }
      return {
        intent: 'ignore',
        normalizedQuery: trimmed,
        needsScreenContext: false,
        needsClipboardContext: false,
        confidence: 0,
      };
    }
  }
}
