import { DefinePlugin, type Configuration } from "webpack";

import { rules, nativeRules } from "./webpack.rules";
import { plugins } from "./webpack.plugins";

export const mainConfig: Configuration = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: "./src/main/index.ts",
  // Put your normal webpack config below here
  module: {
    rules: [...nativeRules, ...rules, { test: /\.css$/, type: "asset/source" }],
  },
  plugins: [...plugins, new DefinePlugin({
    BEDROCK_LOCAL_BUILD: JSON.stringify(process.env.BEDROCK_LOCAL_BUILD === "1"),
  })],
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css", ".json"],
  },
};
