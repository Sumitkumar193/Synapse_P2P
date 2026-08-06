import { eventBus, EventMap } from '../shared/EventBus';
import { MCP_TOOL_DEFINITIONS } from '../shared/tools';

export interface WorkflowRule {
  id: string;
  name: string;
  enabled: boolean;
  triggerEvent: keyof EventMap;
  pattern?: string | RegExp;
  condition?: (payload: any) => boolean;
  actionTool?: string;
  actionArgs?: Record<string, any>;
  customHandler?: (payload: any) => Promise<any> | any;
}

export class WorkflowEngine {
  private rules = new Map<string, WorkflowRule>();
  private active = false;

  constructor() {
    this.registerDefaultInterviewRules();
  }

  public start(): void {
    this.active = true;
  }

  public stop(): void {
    this.active = false;
  }

  public addRule(rule: WorkflowRule): void {
    this.rules.set(rule.id, rule);
  }

  public removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  public getRules(): WorkflowRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Evaluate an incoming event against registered workflow rules.
   */
  public async evaluateRules<K extends keyof EventMap>(eventName: K, payload: EventMap[K]): Promise<WorkflowRule[]> {
    if (!this.active) return [];

    const matchedRules: WorkflowRule[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled || rule.triggerEvent !== eventName) continue;

      // Check text regex pattern if event payload has text property
      if (rule.pattern && typeof (payload as any).text === 'string') {
        const text = (payload as any).text;
        const reg = typeof rule.pattern === 'string' ? new RegExp(rule.pattern, 'i') : rule.pattern;
        if (!reg.test(text)) continue;
      }

      // Check custom boolean condition
      if (rule.condition && !rule.condition(payload)) continue;

      matchedRules.push(rule);
      await this.executeRuleAction(rule, payload);
    }

    return matchedRules;
  }

  private async executeRuleAction(rule: WorkflowRule, payload: any): Promise<void> {
    const timestamp = Date.now();

    if (rule.actionTool) {
      const toolDef = MCP_TOOL_DEFINITIONS[rule.actionTool];
      const requiresApproval = toolDef ? toolDef.requiresApproval : false;

      // Routing Rule: Any workflow rule triggering a requiresApproval tool must route through Pending Approval Queue
      if (requiresApproval) {
        eventBus.emit('tool_pending_approval', {
          id: `approval_${Math.random().toString(36).substring(2, 9)}`,
          toolName: rule.actionTool,
          args: rule.actionArgs || {},
          requestedBy: `WorkflowRule:${rule.name}`,
          timestamp,
        });
      } else {
        eventBus.emit('tool_executed', {
          toolName: rule.actionTool,
          args: rule.actionArgs || {},
          result: { status: 'executed', triggeredBy: rule.name },
          timestamp,
        });
      }
    }

    if (rule.customHandler) {
      try {
        await rule.customHandler(payload);
      } catch (err) {
        console.error(`[WorkflowEngine] Error executing custom handler for rule '${rule.name}':`, err);
      }
    }
  }

  private registerDefaultInterviewRules(): void {
    // Rule 1: Auto-capture desktop screenshot when interviewer asks a coding/architecture question
    this.addRule({
      id: 'rule_explain_question',
      name: 'Interview Coding Assistant Auto-Capture',
      enabled: true,
      triggerEvent: 'transcript.final',
      pattern: /explain|theorem|architecture|code|algorithm|system design/i,
      actionTool: 'capture_screen',
      actionArgs: { format: 'jpeg', quality: 80 },
    });
  }
}
