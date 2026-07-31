import { IPlugin, PluginManifest } from '../../shared/plugin';
import { CapabilityScopedAPI } from '../PluginManager';

export class AutoSummaryPlugin implements IPlugin {
  public readonly manifest: PluginManifest = {
    id: 'plugin_auto_summary',
    name: 'Interview Live Auto-Summary Plugin',
    version: '1.0.0',
    description: 'Listens to transcript.final events and posts periodic auto-summaries to chat stream.',
    author: 'Synapse Core AI Team',
  };
  public readonly metadata = this.manifest;


  private unsubscribes: Array<() => void> = [];
  private transcriptCount = 0;

  public async onLoad(api: CapabilityScopedAPI): Promise<void> {
    api.log('Loaded AutoSummaryPlugin inside Node.js vm sandbox');

    // Register custom tool via capability API
    api.registerTool(
      'auto_summarize_now',
      'Trigger an immediate interview auto-summary',
      {},
      async () => {
        api.log('Manual auto-summary tool invoked');
        return { summary: 'Interview candidate demonstrated strong WebRTC P2P expertise.' };
      }
    );

    // Listen to transcript.final events via capability API
    const unsub = api.onEvent('transcript.final', (evt) => {
      this.transcriptCount++;
      if (this.transcriptCount % 3 === 0) {
        api.log(`Auto-summary triggered after ${this.transcriptCount} transcript segments`);
        api.emitEvent('chat_received', {
          id: `summary_${Date.now()}`,
          sender: '📝 AutoSummary Plugin',
          text: `[Live Summary] Processed key topic: "${evt.text}"`,
          timestamp: Date.now(),
          isAi: true,
        });
      }
    });

    this.unsubscribes.push(unsub);
  }

  public async onDisable(): Promise<void> {
    this.unsubscribes.forEach((unsub) => unsub());
    this.unsubscribes = [];
  }
}
