declare module "*.png" {
  const src: string;
  export default src;
}

declare module "markdown-it-mark" {
  import { PluginSimple } from "markdown-it";
  const plugin: PluginSimple;
  export default plugin;
}

declare module "markdown-it-task-lists" {
  import { PluginWithOptions } from "markdown-it";
  const plugin: PluginWithOptions<{ enabled?: boolean }>;
  export default plugin;
}

declare module "*.css" { const css: string; export default css; }
