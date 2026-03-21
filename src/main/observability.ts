import { app } from "electron";
import * as Sentry from "@sentry/electron/main";
import { BedrockRuntimeInfo } from "../shared/types";

const resolveEnvironment = (): string => {
  if (process.env.SENTRY_ENVIRONMENT) {
    return process.env.SENTRY_ENVIRONMENT;
  }
  if (process.env.BEDROCK_ENV) {
    return process.env.BEDROCK_ENV;
  }
  if (process.env.NODE_ENV === "test") {
    return "test";
  }
  return app.isPackaged ? "production" : "development";
};

export const buildRuntimeInfo = (): BedrockRuntimeInfo => {
  const appVersion = app.getVersion();
  const environment = resolveEnvironment();
  const sentryDsn = process.env.BEDROCK_E2E === "1" ? null : process.env.SENTRY_DSN ?? null;
  const release = `bedrock@${appVersion}`;

  return {
    appVersion,
    environment,
    release,
    sentryDsn,
    telemetryEnabled: Boolean(sentryDsn),
    e2eMode: process.env.BEDROCK_E2E === "1",
  };
};

export const initializeMainTelemetry = (): BedrockRuntimeInfo => {
  const runtimeInfo = buildRuntimeInfo();

  if (!runtimeInfo.telemetryEnabled || runtimeInfo.e2eMode) {
    return runtimeInfo;
  }

  Sentry.init({
    dsn: runtimeInfo.sentryDsn ?? undefined,
    release: runtimeInfo.release,
    environment: runtimeInfo.environment,
    initialScope: (scope) => {
      scope.setTag("process", "main");
      scope.setTag("platform", process.platform);
      scope.setTag("packaged", String(app.isPackaged));
      return scope;
    },
  });

  return runtimeInfo;
};

export const captureMainTelemetryMessage = (
  message: string,
  extra?: Record<string, unknown>
) => {
  const runtimeInfo = buildRuntimeInfo();
  if (!runtimeInfo.telemetryEnabled || runtimeInfo.e2eMode) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag("process", "main");
    if (extra) {
      scope.setExtras(extra);
    }
    Sentry.captureMessage(message);
  });
};

export const captureMainTelemetryException = (
  error: unknown,
  extra?: Record<string, unknown>
) => {
  const runtimeInfo = buildRuntimeInfo();
  if (!runtimeInfo.telemetryEnabled || runtimeInfo.e2eMode) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag("process", "main");
    if (extra) {
      scope.setExtras(extra);
    }
    Sentry.captureException(error);
  });
};
