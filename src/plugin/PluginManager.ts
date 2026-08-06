import { eventBus, EventMap } from '../shared/EventBus';
import { IPlugin, PluginManifest } from '../shared/plugin';
import { PluginSandbox } from './PluginSandbox';

export interface CapabilityScopedAPI {
  registerTool: (name: string, description: string, inputSchema: Record<string, any>, handler: (args: any) => Promise<any> | any) => void;
  onEvent: <K extends keyof EventMap>(eventName: K, listener: (payload: EventMap[K]) => void) => () => void;
  emitEvent: <K extends keyof EventMap>(eventName: K, payload: EventMap[K]) => void;
  log: (message: string) => void;
}

export interface LoadedPluginState {
  plugin: IPlugin;
  sandbox: PluginSandbox;
  enabled: boolean;
  registeredTools: string[];
  eventUnsubscribers: Array<() => void>;
}

export class PluginManager {
  private plugins = new Map<string, LoadedPluginState>();

  /**
   * Install and load a new plugin inside an isolated PluginSandbox.
   */
  public async installPlugin(plugin: IPlugin): Promise<void> {
    const pluginId = plugin.manifest.id;
    if (this.plugins.has(pluginId)) {
      throw new Error(`Plugin '${pluginId}' is already installed`);
    }

    const registeredTools: string[] = [];
    const eventUnsubscribers: Array<() => void> = [];

    // Capability-Scoped API Bridge passed to Plugin Sandbox
    const api: CapabilityScopedAPI = {
      registerTool: (name, description, inputSchema, handler) => {
        registeredTools.push(name);
        // Expose custom tool on EventBus for MCP execution
        eventBus.on('tool_executed', async (evt) => {
          if (evt.toolName === name) {
            try {
              await handler(evt.args);
            } catch (err) {
              console.error(`[Plugin:${pluginId}] Tool '${name}' execution error:`, err);
            }
          }
        });
      },

      onEvent: (eventName, listener) => {
        const unsub = eventBus.on(eventName, listener);
        eventUnsubscribers.push(unsub);
        return unsub;
      },

      emitEvent: (eventName, payload) => {
        eventBus.emit(eventName, payload);
      },

      log: (message) => {
        console.log(`[Plugin:${pluginId}] ${message}`);
      },
    };

    const sandbox = new PluginSandbox({ api });

    const state: LoadedPluginState = {
      plugin,
      sandbox,
      enabled: false,
      registeredTools,
      eventUnsubscribers,
    };

    this.plugins.set(pluginId, state);

    // Call plugin onLoad hook inside sandbox crash shield
    if (plugin.onLoad) {
      await sandbox.invokeSafe(() => plugin.onLoad!(api), [], 2000);
    }

    // Call plugin onInstall hook if present
    if (plugin.onInstall) {
      await sandbox.invokeSafe(() => plugin.onInstall!(), [], 2000);
    }
  }

  /**
   * Enable an installed plugin.
   */
  public async enablePlugin(pluginId: string): Promise<void> {
    const state = this.plugins.get(pluginId);
    if (!state) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    if (state.enabled) return;

    if (state.plugin.onEnable) {
      await state.sandbox.invokeSafe(() => state.plugin.onEnable!(), [], 2000);
    }

    state.enabled = true;
  }

  /**
   * Disable an enabled plugin.
   */
  public async disablePlugin(pluginId: string): Promise<void> {
    const state = this.plugins.get(pluginId);
    if (!state || !state.enabled) return;

    if (state.plugin.onDisable) {
      try {
        await state.sandbox.invokeSafe(() => state.plugin.onDisable!(), [], 2000);
      } catch (err) {
        console.error(`[PluginManager] Error disabling plugin '${pluginId}':`, err);
      }
    }

    state.enabled = false;
  }

  /**
   * Uninstall and clean up a plugin.
   */
  public async uninstallPlugin(pluginId: string): Promise<void> {
    const state = this.plugins.get(pluginId);
    if (!state) return;

    await this.disablePlugin(pluginId);

    if (state.plugin.onUnload) {
      try {
        await state.sandbox.invokeSafe(() => state.plugin.onUnload!(), [], 2000);
      } catch {}
    }

    if (state.plugin.onUninstall) {
      try {
        await state.sandbox.invokeSafe(() => state.plugin.onUninstall!(), [], 2000);
      } catch {}
    }

    // Clean up event listeners
    state.eventUnsubscribers.forEach((unsub) => unsub());
    this.plugins.delete(pluginId);
  }

  public getInstalledPlugins(): PluginManifest[] {
    return Array.from(this.plugins.values()).map((s) => ({
      ...s.plugin.manifest,
      enabled: s.enabled,
    }));
  }
}
