import { eventBus } from '../../shared/EventBus';
import { MCP_TOOL_DEFINITIONS, MCPToolDefinition } from '../../shared/tools';
import { MCPServerConfig, DEFAULT_APP_SETTINGS } from '../../shared/settings';

export interface PendingToolApproval {
  id: string;
  toolName: string;
  args: Record<string, any>;
  requestedBy: string;
  timestamp: number;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * Embedded In-Memory MCP (Model Context Protocol) Adapter.
 * Bridges AI agent requests to Category A (Worker Local) and Category B (IPC-proxied OS) tools,
 * enforcing explicit user approval queues for sensitive permissions and supporting settings-driven MCP Servers.
 */
export class MCPAdapter {
  private registeredTools = new Map<string, MCPToolDefinition>();
  private pendingApprovals = new Map<string, PendingToolApproval>();
  private mcpServers = new Map<string, MCPServerConfig>();
  private ipcProxyHandler?: (toolName: string, args: Record<string, any>) => Promise<any>;

  constructor(serversConfig?: MCPServerConfig[]) {
    this.registerDefaultTools();
    this.setupApprovalListeners();
    this.loadServersFromSettings(serversConfig || DEFAULT_APP_SETTINGS.mcpServers);
  }

  public loadServersFromSettings(servers: MCPServerConfig[]): void {
    this.mcpServers.clear();
    servers.forEach((s) => this.mcpServers.set(s.id, s));
  }

  public getRegisteredServers(): MCPServerConfig[] {
    return Array.from(this.mcpServers.values());
  }

  public addServer(server: MCPServerConfig): void {
    this.mcpServers.set(server.id, server);
  }


  /**
   * Set custom IPC Proxy handler for Category B main-process OS tools.
   */
  public setIPCProxyHandler(handler: (toolName: string, args: Record<string, any>) => Promise<any>): void {
    this.ipcProxyHandler = handler;
  }

  public getRegisteredTools(): MCPToolDefinition[] {
    return Array.from(this.registeredTools.values());
  }

  public getPendingApprovals(): PendingToolApproval[] {
    return Array.from(this.pendingApprovals.values());
  }

  /**
   * Execute JSON-RPC 2.0 MCP request.
   */
  public async handleJsonRpcRequest(request: { jsonrpc: string; id: string | number; method: string; params?: any }): Promise<MCPResponse> {
    const { id, method, params } = request;

    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'P2P Media App In-Memory MCP Adapter', version: '1.0.0' },
        },
      };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: this.getRegisteredTools().map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
      };
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const args = params?.arguments || {};

      try {
        const result = await this.executeTool(toolName, args, 'JSON-RPC');
        return {
          jsonrpc: '2.0',
          id,
          result,
        };
      } catch (err: any) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: err.message || 'MCP Tool execution error',
          },
        };
      }
    }

    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    };
  }

  /**
   * Execute an MCP Tool by name, routing through approval queue if required.
   */
  public async executeTool(toolName: string, args: Record<string, any> = {}, requestedBy: string = 'Agent'): Promise<any> {
    const toolDef = this.registeredTools.get(toolName);
    if (!toolDef) {
      throw new Error(`MCP Tool '${toolName}' is not registered`);
    }

    // Routing Rule: If tool requires approval, place into Pending Approval Queue and emit event
    if (toolDef.requiresApproval) {
      const approvalId = `approval_${Math.random().toString(36).substring(2, 9)}`;
      const pending: PendingToolApproval = {
        id: approvalId,
        toolName,
        args,
        requestedBy,
        timestamp: Date.now(),
      };

      this.pendingApprovals.set(approvalId, pending);

      eventBus.emit('tool_pending_approval', pending);

      return {
        status: 'pending_approval',
        approvalId,
        message: `Tool '${toolName}' requires user approval in chat UI stream before execution.`,
      };
    }

    return await this.dispatchToolExecution(toolDef, args);
  }

  /**
   * Approve and execute a pending tool approval item.
   */
  public async approvePendingTool(approvalId: string): Promise<any> {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) {
      throw new Error(`Pending approval '${approvalId}' not found`);
    }

    this.pendingApprovals.delete(approvalId);
    const toolDef = this.registeredTools.get(pending.toolName)!;

    const result = await this.dispatchToolExecution(toolDef, pending.args);
    eventBus.emit('tool_approved', { approvalId, toolName: pending.toolName, result });
    return result;
  }

  /**
   * Dismiss/cancel a pending tool approval item.
   */
  public dismissPendingTool(approvalId: string): void {
    const pending = this.pendingApprovals.get(approvalId);
    if (pending) {
      this.pendingApprovals.delete(approvalId);
      eventBus.emit('tool_dismissed', { approvalId, toolName: pending.toolName });
    }
  }

  private async dispatchToolExecution(toolDef: MCPToolDefinition, args: Record<string, any>): Promise<any> {
    const timestamp = Date.now();
    let result: any;

    if (toolDef.category === 'local') {
      result = await this.executeWorkerLocalTool(toolDef.name, args);
    } else {
      result = await this.executeIPCProxiedOSTool(toolDef.name, args);
    }


    eventBus.emit('tool_executed', {
      toolName: toolDef.name,
      args,
      result,
      timestamp,
    });

    return result;
  }

  private async executeWorkerLocalTool(toolName: string, args: Record<string, any>): Promise<any> {
    switch (toolName) {
      case 'send_chat':
        const chatText = args.text || args.message || '';
        console.log('[MCPAdapter 📩] Executing "send_chat" tool, emitting chat_received on EventBus:', chatText.substring(0, 60));
        eventBus.emit('chat_received', {
          id: `msg_${Math.random().toString(36).substring(2, 9)}`,
          sender: args.sender || 'MCP Agent',
          text: chatText,
          timestamp: Date.now(),
          isAi: true,
        });
        return { success: true, message: 'Chat message posted' };


      case 'get_transcripts':
        return { transcripts: [{ text: 'Sample session transcript', speaker: 'interviewer' }] };

      case 'summarize_session':
        return { summary: 'Interview candidate discussed CAP theorem and WebRTC architecture.' };

      case 'get_system_status':
        return { status: 'healthy', uptime: process.uptime(), memoryUsage: process.memoryUsage() };

      case 'list_plugins':
        return { plugins: ['WhisperSTTPlugin', 'OpenAICopilotPlugin'] };

      default:
        return { success: true, tool: toolName, args };
    }
  }

  private async executeIPCProxiedOSTool(toolName: string, args: Record<string, any>): Promise<any> {
    if (this.ipcProxyHandler) {
      return await this.ipcProxyHandler(toolName, args);
    }
    return {
      status: 'simulated_ipc_execution',
      toolName,
      args,
      note: 'IPC proxy handler executed in main process context',
    };
  }

  private registerDefaultTools(): void {
    Object.values(MCP_TOOL_DEFINITIONS).forEach((toolDef) => {
      this.registeredTools.set(toolDef.name, toolDef);
    });
  }

  private setupApprovalListeners(): void {
    eventBus.on('tool_approved', async (payload) => {
      if (this.pendingApprovals.has(payload.approvalId)) {
        await this.approvePendingTool(payload.approvalId);
      }
    });

    eventBus.on('tool_dismissed', (payload) => {
      if (this.pendingApprovals.has(payload.approvalId)) {
        this.dismissPendingTool(payload.approvalId);
      }
    });
  }
}
