import type { PermissionKey, AstraState } from '../../shared/types';

export interface ToolDef {
  name: string;
  description: string;
  args: string;
  permission: PermissionKey;
  state?: Extract<AstraState, 'SEARCHING' | 'WORKING' | 'THINKING' | 'SPEAKING'>;
  describe(args: Record<string, unknown>): string;
  run(args: Record<string, unknown>): Promise<unknown>;
}

class Registry {
  private map = new Map<string, ToolDef>();

  register(t: ToolDef): void {
    this.map.set(t.name, t);
  }

  get(name: string): ToolDef | undefined {
    return this.map.get(name);
  }

  names(): string[] {
    return [...this.map.keys()];
  }

  docs(): string {
    return [...this.map.values()]
      .map((t) => `- ${t.name} (permission: ${t.permission}) - ${t.description}\n  args: ${t.args}`)
      .join('\n');
  }
}

export const toolRegistry = new Registry();

import { registerAppTools } from './apps';
import { registerFileTools } from './files';
import { registerResearchTools } from './research';
import { registerBrowserTools } from './browser';

registerAppTools(toolRegistry);
registerFileTools(toolRegistry);
registerResearchTools(toolRegistry);
registerBrowserTools(toolRegistry);
