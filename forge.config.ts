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
import { notarize } from "@electron/notarize";

// Only load .env if we're not in CI to avoid conflicting with GitHub Secrets
if (!process.env.GITHUB_ACTIONS) {
  dotenv.config({ override: true });
}

import { mainConfig } from "./webpack.main.config";
import { rendererConfig } from "./webpack.renderer.config";

function getOsxNotarizeConfig() {
  const {
    APPLE_API_KEY,
    APPLE_API_KEY_ID,
    APPLE_API_ISSUER_ID,
    APPLE_TEAM_ID,
    APPLE_ID,
    APPLE_PASSWORD,
  } = process.env;

  // Preferred for CI: App Store Connect API key (.p8) + notarytool
  if (APPLE_API_KEY && APPLE_API_KEY_ID && APPLE_API_ISSUER_ID) {
    console.log(
      "Forge: Configuring notarization via App Store Connect API Key"
    );

    // CRITICAL: @electron/notarize will pick up APPLE_ID/APPLE_PASSWORD
    // or keychain profiles from the environment if they are set,
    // leading to a conflict error. We explicitly clear them here.
    delete process.env.APPLE_ID;
    delete process.env.APPLE_ID_PASSWORD;
    delete process.env.APPLE_PASSWORD;
    delete process.env.APPLE_NOTARYTOOL_KEYCHAIN_PROFILE;
    delete process.env.APPLE_NOTARYTOOL_KEYCHAIN;

    return {
      tool: "notarytool" as const,
      appleApiKey: APPLE_API_KEY,
      appleApiKeyId: APPLE_API_KEY_ID,
      appleApiIssuer: APPLE_API_ISSUER_ID,
    };
  }

  // Local fallback: Apple ID + app-specific password
  if (APPLE_ID && APPLE_PASSWORD) {
    console.log("Forge: Configuring notarization via Apple ID / Password");

    // Clear API Key variables to prevent conflict
    delete process.env.APPLE_API_KEY;
    delete process.env.APPLE_API_KEY_ID;
    delete process.env.APPLE_API_ISSUER;

    return {
      tool: "notarytool" as const,
      appleId: APPLE_ID,
      appleIdPassword: APPLE_PASSWORD,
      teamId: APPLE_TEAM_ID,
    };
  }

  console.log(
    "Forge: Notarization credentials not found, skipping notarization step"
  );
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
        additionalDMGOptions: process.env.APPLE_IDENTITY
          ? {
              "code-sign": {
                "signing-identity": process.env.APPLE_IDENTITY,
              },
            }
          : undefined,
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
  hooks: {
    postMake: async (config, makeResults) => {
      const notarizeConfig = getOsxNotarizeConfig();
      if (process.platform !== "darwin" || !notarizeConfig) {
        return makeResults;
      }

      for (const makeResult of makeResults) {
        for (const artifact of makeResult.artifacts) {
          if (artifact.endsWith(".dmg")) {
            console.log(`Forge: Notarizing DMG artifact: ${artifact}`);
            await notarize({
              ...notarizeConfig,
              appPath: artifact,
            });
            console.log(`Forge: Stapling DMG artifact: ${artifact}`);
            const {
              spawn,
            } = require("./node_modules/@electron/notarize/lib/spawn");
            await spawn("xcrun", ["stapler", "staple", artifact]);
          }
        }
      }
      return makeResults;
    },
  },
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
