import { MCPAdapter } from './MCPAdapter';

/**
 * Standard I/O (Stdio) JSON-RPC 2.0 MCP Server for Antigravity Integration.
 * Allows Antigravity to discover and call registered OS and application tools.
 */
export class MCPServerProcess {
  private adapter: MCPAdapter;
  private buffer = '';

  constructor() {
    this.adapter = new MCPAdapter();
    this.setupStdioBridge();
  }

  private setupStdioBridge(): void {
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', async (chunk: string) => {
      this.buffer += chunk;
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const request = JSON.parse(trimmed);
          const response = await this.adapter.handleJsonRpcRequest(request);
          this.sendResponse(response);
        } catch (err: any) {
          this.sendResponse({
            jsonrpc: '2.0',
            id: null as any,
            error: {
              code: -32700,
              message: `Parse error: ${err.message || 'Invalid JSON-RPC format'}`,
            },
          });
        }
      }
    });

    process.stdin.on('end', () => {
      process.exit(0);
    });

    // Notify initialization ready on stderr so stdout remains clean for JSON-RPC 2.0
    console.error('[Synapse P2P MCP Server] 🚀 Stdio MCP Server ready for Antigravity.');
  }

  private sendResponse(response: any): void {
    process.stdout.write(JSON.stringify(response) + '\n');
  }
}

// Start MCP Server process when executed directly
if (require.main === module || !module.parent) {
  new MCPServerProcess();
}
