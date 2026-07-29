import { SessionStatsReport } from '../../types';

export interface IStatsProvider {
  getStats(): Promise<SessionStatsReport>;
  subscribe(handler: (stats: SessionStatsReport) => void, intervalMs?: number): () => void;
}
