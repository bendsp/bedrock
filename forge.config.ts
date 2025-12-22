import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { PublisherGithub } from "@electron-forge/publisher-github";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { WebpackPlugin } from "@electron-forge/plugin-webpack";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import * as dotenv from "dotenv";

dotenv.config({ override: true });

import { mainConfig } from "./webpack.main.config";
import { rendererConfig } from "./webpack.renderer.config";

function getOsxNotarizeConfig():
  | {
      tool?: "notarytool";
      appleApiKey?: string;
      appleApiKeyId?: string;
      appleApiIssuer?: string;
      appleId?: string;
      appleIdPassword?: string;
      teamId?: string;
    }
  | undefined {
  // Preferred for CI: App Store Connect API key (.p8) + notarytool
  if (
    process.env.APPLE_API_KEY &&
    process.env.APPLE_API_KEY_ID &&
    process.env.APPLE_API_ISSUER_ID
  ) {
    return {
      tool: "notarytool",
      appleApiKey: process.env.APPLE_API_KEY,
      appleApiKeyId: process.env.APPLE_API_KEY_ID,
      appleApiIssuer: process.env.APPLE_API_ISSUER_ID,
      teamId: process.env.APPLE_TEAM_ID,
    };
  }

  // Local fallback: Apple ID + app-specific password
  if (process.env.APPLE_ID && process.env.APPLE_PASSWORD) {
    return {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    };
  }

  // Notarization disabled if credentials aren't present
  return undefined;
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: "./src/assets/icon",
    osxSign: process.env.APPLE_IDENTITY
      ? { identity: process.env.APPLE_IDENTITY }
      : {},
    osxNotarize: getOsxNotarizeConfig(),
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      setupExe: "Bedrock.exe",
    }),
    new MakerZIP({}, ["darwin"]),
    new MakerDMG(
      {
        name: "Bedrock",
        icon: "./src/assets/icon.icns",
      },
      ["darwin"]
    ),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  publishers: [
    new PublisherGithub({
      repository: {
        owner: "bendsp",
        name: "bedrock",
      },
      tagPrefix: "",
      prerelease: false,
      draft: true,
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: "./src/renderer/index.html",
            js: "./src/renderer/renderer.ts",
            name: "main_window",
            preload: {
              js: "./src/main/preload.ts",
            },
          },
        ],
      },
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
