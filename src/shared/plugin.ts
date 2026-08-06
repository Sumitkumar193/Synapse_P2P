import { MCPToolDefinition } from './tools';

export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  enabled?: boolean;
}

export type PluginManifest = PluginMetadata;

/**
 * Interface defining the lifecycle and runtime hooks for an Extension Plugin.
 */
export interface IPlugin {
  readonly metadata?: PluginMetadata;
  readonly manifest: PluginManifest;

  // Lifecycle Hooks
  onInstall?(): void | Promise<void>;
  onLoad?(api?: any): void | Promise<void>;
  onEnable?(): void | Promise<void>;
  onDisable?(): void | Promise<void>;
  onUnload?(): void | Promise<void>;
  onUninstall?(): void | Promise<void>;
  dispose?(): void | Promise<void>;


  // Event & Runtime Hooks
  onTranscript?(payload: { text: string; speaker: 'local' | 'remote'; isFinal: boolean }): void | Promise<void>;
  onChat?(payload: { sender: string; text: string }): void | Promise<void>;
  onScreenCapture?(payload: { dataUrl: string; format: string }): void | Promise<void>;
  onParticipantJoined?(payload: { peerId: string; isHost: boolean }): void | Promise<void>;

  // Tool Registration Hook
  registerTools?(): MCPToolDefinition[] | Promise<MCPToolDefinition[]>;
}
