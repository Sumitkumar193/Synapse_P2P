import { eventBus } from '../../shared/EventBus';

export interface ChatMessageItem {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  isAi?: boolean;
  isPartial?: boolean;
  isPendingApproval?: boolean;
  approvalData?: {
    approvalId: string;
    toolName: string;
    args: Record<string, any>;
    requestedBy: string;
  };
}

/**
 * In-App Chat Bar & AI Copilot Drawer Component with Inline Tool Approval Cards.
 */
export class ChatStreamComponent {
  private messages: ChatMessageItem[] = [];
  private containerEl: HTMLElement | null = null;
  private unsubscribers: Array<() => void> = [];

  constructor() {
    this.setupEventListeners();
  }

  public mount(container: HTMLElement): void {
    this.containerEl = container;
    this.render();
  }

  public unmount(): void {
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
    if (this.containerEl) {
      this.containerEl.innerHTML = '';
    }
  }

  public getMessages(): ChatMessageItem[] {
    return [...this.messages];
  }

  /**
   * Add new message item and update UI stream.
   */
  public addMessage(msg: ChatMessageItem): void {
    // Remove transient partial transcript message if superseded by final
    if (msg.isPartial) {
      this.messages = this.messages.filter((m) => !m.isPartial);
    }

    this.messages.push(msg);

    if (this.messages.length > 100) {
      this.messages.shift();
    }

    this.render();
  }

  /**
   * User approved pending tool execution card.
   */
  public approveTool(approvalId: string): void {
    const item = this.messages.find((m) => m.approvalData?.approvalId === approvalId);
    if (item) {
      item.isPendingApproval = false;
      eventBus.emit('tool_approved', { approvalId, toolName: item.approvalData!.toolName });
      this.render();
    }
  }

  /**
   * User dismissed pending tool execution card.
   */
  public dismissTool(approvalId: string): void {
    const item = this.messages.find((m) => m.approvalData?.approvalId === approvalId);
    if (item) {
      this.messages = this.messages.filter((m) => m.approvalData?.approvalId !== approvalId);
      eventBus.emit('tool_dismissed', { approvalId, toolName: item.approvalData!.toolName });
      this.render();
    }
  }

  public render(): void {
    if (!this.containerEl) return;

    this.containerEl.innerHTML = `
      <div class="chat-stream-container">
        <div class="chat-messages-scroll" id="chatScrollArea">
          ${this.messages.map((m) => this.renderMessageItem(m)).join('')}
        </div>
        <div class="chat-input-bar">
          <input type="text" id="chatInputText" placeholder="Ask AI Copilot or type a message..." />
          <button id="chatSendBtn">Send</button>
        </div>
      </div>
    `;

    this.bindEvents();
    this.scrollToBottom();
  }

  private renderMessageItem(m: ChatMessageItem): string {
    if (m.isPendingApproval && m.approvalData) {
      return `
        <div class="chat-msg-card tool-approval-card" data-approval-id="${m.approvalData.approvalId}">
          <div class="approval-header">
            <span class="approval-badge">⚠️ TOOL APPROVAL REQUIRED</span>
            <span class="approval-tool">${m.approvalData.toolName}</span>
          </div>
          <div class="approval-body">
            <p>Requested by <strong>${m.approvalData.requestedBy}</strong></p>
            <pre class="approval-args">${JSON.stringify(m.approvalData.args, null, 2)}</pre>
          </div>
          <div class="approval-actions">
            <button class="btn-approve" onclick="window.chatComponentInstance?.approveTool('${m.approvalData.approvalId}')">Approve</button>
            <button class="btn-dismiss" onclick="window.chatComponentInstance?.dismissTool('${m.approvalData.approvalId}')">Dismiss</button>
          </div>
        </div>
      `;
    }

    const cssClass = m.isAi ? 'chat-msg-ai' : m.isPartial ? 'chat-msg-partial' : 'chat-msg-user';

    return `
      <div class="chat-msg-bubble ${cssClass}">
        <div class="chat-msg-sender">${m.sender} <span class="chat-msg-time">${new Date(m.timestamp).toLocaleTimeString()}</span></div>
        <div class="chat-msg-text">${m.text}</div>
      </div>
    `;
  }

  private bindEvents(): void {
    if (!this.containerEl) return;

    const inputEl = this.containerEl.querySelector('#chatInputText') as HTMLInputElement;
    const sendBtn = this.containerEl.querySelector('#chatSendBtn');

    const handleSend = () => {
      const text = inputEl?.value.trim();
      if (text) {
        eventBus.emit('chat_received', {
          id: `msg_${Date.now()}`,
          sender: 'You',
          text,
          timestamp: Date.now(),
          isAi: false,
        });
        inputEl.value = '';
      }
    };

    sendBtn?.addEventListener('click', handleSend);
    inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSend();
    });
  }

  private scrollToBottom(): void {
    if (!this.containerEl) return;
    const scrollArea = this.containerEl.querySelector('#chatScrollArea');
    if (scrollArea) {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }

  private setupEventListeners(): void {
    // Expose component instance on window for inline onclick handlers
    if (typeof window !== 'undefined') {
      (window as any).chatComponentInstance = this;
    }

    // Subscribe to EventBus chat events
    const unsubChat = eventBus.on('chat_received', (evt) => {
      this.addMessage({
        id: evt.id,
        sender: evt.sender,
        text: evt.text,
        timestamp: evt.timestamp,
        isAi: evt.isAi,
      });
    });

    // Subscribe to EventBus partial transcript events
    const unsubPartial = eventBus.on('transcript.partial', (evt) => {
      this.addMessage({
        id: `partial_${evt.timestamp}`,
        sender: `🎙️ Live STT (${evt.speaker})`,
        text: evt.text,
        timestamp: evt.timestamp,
        isPartial: true,
      });
    });

    // Subscribe to EventBus final transcript events
    const unsubFinal = eventBus.on('transcript.final', (evt) => {
      this.addMessage({
        id: `final_${evt.timestamp}`,
        sender: `🗣️ Transcribed (${evt.speaker})`,
        text: evt.text,
        timestamp: evt.timestamp,
        isPartial: false,
      });
    });

    // Subscribe to EventBus tool pending approval events
    const unsubApproval = eventBus.on('tool_pending_approval', (evt) => {
      this.addMessage({
        id: evt.id,
        sender: '🛡️ Security Gatekeeper',
        text: `Tool execution '${evt.toolName}' pending approval`,
        timestamp: evt.timestamp,
        isPendingApproval: true,
        approvalData: {
          approvalId: evt.id,
          toolName: evt.toolName,
          args: evt.args,
          requestedBy: evt.requestedBy,
        },
      });
    });

    this.unsubscribers.push(unsubChat, unsubPartial, unsubFinal, unsubApproval);
  }
}
