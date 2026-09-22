import type { ModuleOptions } from "webpack";

export const rules: Required<ModuleOptions>["rules"] = [
  {
    test: /\.tsx?$/,
    exclude: /(node_modules|\.webpack)/,
    use: {
      loader: "ts-loader",
      options: {
        transpileOnly: true,
        // Keep one ESM dependency graph for static and lazy language imports.
        // Mixing CJS CodeMirror state with ESM language chunks breaks highlighting.
        compilerOptions: { module: "ESNext" },
      },
    },
  },
  // Static assets (icons, images) used in the renderer bundle
  {
    test: /\.(png|jpe?g|gif|webp|svg|ico|icns)$/i,
    type: "asset/resource",
  },
];

export const nativeRules: Required<ModuleOptions>["rules"] = [
  // Add support for native node modules
  {
    // We're specifying native_modules in the test because the asset relocator loader generates a
    // "fake" .node file which is really a cjs file.
    test: /native_modules[/\\].+\.node$/,
    use: "node-loader",
  },
  {
    test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: "@vercel/webpack-asset-relocator-loader",
      options: {
        outputAssetBase: "native_modules",
      },
    },
  },
];
