import { EventBus, eventBus } from './EventBus';
import { Session } from '../sdk/session/Session';
import { MCPAdapter } from '../agent/mcp/MCPAdapter';

/**
 * DRY Unified Session Event Bridge.
 * Automatically handles:
 * 1. Live Whisper STT Closed Caption (CC) streaming over WebRTC DataChannels to peer joiners.
 * 2. Remote MCP Tool Execution & Approval Queue routing over DataChannels.
 */
export class SessionEventBridge {
  private session: Session;
  private mcpAdapter?: MCPAdapter;
  private unsubscribers: Array<() => void> = [];

  constructor(session: Session, mcpAdapter?: MCPAdapter) {
    this.session = session;
    this.mcpAdapter = mcpAdapter;
    this.setupListeners();
  }

  private setupListeners(): void {
    // 1. Broadcast local Whisper speech transcripts as Live Closed Captions (CC) over DataChannel
    const unsubPartial = eventBus.on('transcript.partial', (evt) => {
      this.broadcastClosedCaption(evt.text, evt.speaker, false);
    });

    const unsubFinal = eventBus.on('transcript.final', (evt) => {
      this.broadcastClosedCaption(evt.text, evt.speaker, true);
    });

    this.unsubscribers.push(unsubPartial, unsubFinal);

    // 2. Listen to incoming P2P DataChannel messages from peers
    const unsubData = this.session.data.onMessage(async (message) => {
      if (message.type === 'json' && message.payload) {
        await this.handleIncomingDataMessage(message.payload);
      }
    });

    this.unsubscribers.push(unsubData);
  }

  private broadcastClosedCaption(text: string, speaker: string, isFinal: boolean): void {
    const payload = {
      type: 'closed_caption',
      text,
      speaker,
      isFinal,
      timestamp: Date.now(),
    };

    // Emit locally on EventBus for local UI
    eventBus.emit('closed_caption', payload);

    if (isFinal) {
      eventBus.emit('cc.chat.local', {
        text: `🎙️ [CC - Me]: "${text}"`,
        tag: 'me',
        timestamp: payload.timestamp,
      });
    }

    // Stream over P2P DataChannel to connected joiners
    try {
      this.session.data.sendJson(payload);
    } catch {}
  }

  private async handleIncomingDataMessage(payload: any): Promise<void> {
    // Handle incoming Closed Caption from Host
    if (payload.type === 'closed_caption') {
      const timestamp = payload.timestamp || Date.now();
      eventBus.emit('closed_caption', {
        text: payload.text,
        speaker: payload.speaker || 'Host',
        isFinal: payload.isFinal,
        timestamp,
      });

      if (payload.isFinal) {
        eventBus.emit('cc.chat.remote', {
          text: `🎙️ [CC - Received]: "${payload.text}"`,
          tag: 'received',
          timestamp,
        });
      }
    }


    // Handle incoming remote MCP Tool Call request
    if (payload.type === 'mcp_request' && this.mcpAdapter && payload.request) {
      const response = await this.mcpAdapter.handleJsonRpcRequest(payload.request);
      this.session.data.sendJson({
        type: 'mcp_response',
        requestId: payload.request.id,
        response,
      });
    }
  }

  public destroy(): void {
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
  }
}
