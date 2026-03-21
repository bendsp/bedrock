import * as Sentry from "@sentry/electron/renderer";

let initialized = false;

export const initializeRendererTelemetry = async (): Promise<void> => {
  if (initialized) {
    return;
  }

  const runtimeInfo = await window.electronAPI.getRuntimeInfo();
  if (!runtimeInfo.telemetryEnabled || !runtimeInfo.sentryDsn || runtimeInfo.e2eMode) {
    return;
  }

  Sentry.init({
    dsn: runtimeInfo.sentryDsn,
    release: runtimeInfo.release,
    environment: runtimeInfo.environment,
    initialScope: (scope) => {
      scope.setTag("process", "renderer");
      scope.setTag("platform", navigator.platform);
      return scope;
    },
  });

  initialized = true;
};
