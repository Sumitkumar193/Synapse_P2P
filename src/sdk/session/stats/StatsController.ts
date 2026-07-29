import { IStatsProvider } from './IStatsProvider';
import { ITransportProvider } from '../../transport/interfaces/ITransportProvider';
import { SessionStatsReport } from '../../types';

export class StatsController implements IStatsProvider {
  private transportProvider: () => ITransportProvider | undefined;
  private trackerUrlProvider: () => string;

  constructor(transportProvider: () => ITransportProvider | undefined, trackerUrlProvider: () => string) {
    this.transportProvider = transportProvider;
    this.trackerUrlProvider = trackerUrlProvider;
  }

  public async getStats(): Promise<SessionStatsReport> {
    const transport = this.transportProvider();
    const rawStats = transport ? await transport.getConnectionStats() : null;
    const activeTrackerUrl = this.trackerUrlProvider();

    if (!rawStats) {
      return {
        candidateType: 'host',
        connectionType: 'direct',
        connectionTypeDescription: 'Idle / Disconnected',
        activeStunTurnUrl: 'None',
        activeTrackerUrl,
      };
    }

    const isRelay = rawStats.candidateType === 'relay';

    return {
      rttMs: rawStats.rttMs,
      inboundBitrateKbps: rawStats.inboundBitrateKbps,
      outboundBitrateKbps: rawStats.outboundBitrateKbps,
      packetLossRate: rawStats.packetLossRate,
      candidateType: rawStats.candidateType || 'host',
      connectionType: isRelay ? 'relay' : 'direct',
      connectionTypeDescription: rawStats.connectionTypeDescription,
      activeStunTurnUrl: rawStats.activeStunTurnUrl,
      activeTrackerUrl,
      localIp: rawStats.localIp,
      remoteIp: rawStats.remoteIp,
      protocol: rawStats.protocol,
      videoCodec: rawStats.videoCodec,
      audioCodec: rawStats.audioCodec,
      frameWidth: rawStats.frameWidth,
      frameHeight: rawStats.frameHeight,
      framesPerSecond: rawStats.framesPerSecond,
    };
  }

  public subscribe(handler: (stats: SessionStatsReport) => void, intervalMs: number = 2000): () => void {
    let active = true;
    const timer = setInterval(async () => {
      if (!active) return;
      try {
        const report = await this.getStats();
        if (active) handler(report);
      } catch (err) {
        // Ignore stats polling errors
      }
    }, intervalMs);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }
}
