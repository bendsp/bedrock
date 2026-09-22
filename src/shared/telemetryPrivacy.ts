/** Keep diagnostic codes and stack locations, never note paths, contents or UI breadcrumbs. */
export function redactTelemetry<
  T extends {
    message?: string;
    exception?: {
      values?: Array<{
        value?: string;
        stacktrace?: {
          frames?: Array<{
            filename?: string;
            abs_path?: string;
            vars?: unknown;
            context_line?: unknown;
            pre_context?: unknown;
            post_context?: unknown;
          }>;
        };
      }>;
    };
    extra?: Record<string, unknown>;
    breadcrumbs?: unknown[];
    user?: unknown;
    request?: unknown;
    contexts?: unknown;
    server_name?: unknown;
    transaction?: unknown;
    logentry?: unknown;
    tags?: Record<string, unknown>;
  },
>(event: T): T {
  delete event.user;
  delete event.request;
  delete event.contexts;
  delete event.server_name;
  delete event.transaction;
  delete event.logentry;
  event.tags = Object.fromEntries(
    Object.entries(event.tags ?? {}).filter(([key]) =>
      ["process", "platform", "packaged"].includes(key),
    ),
  );
  if (event.message)
    event.message = "Application diagnostic. Private details omitted.";
  event.breadcrumbs = [];
  event.extra = Object.fromEntries(
    Object.entries(event.extra ?? {}).filter(([key]) =>
      ["operation", "reason", "exitCode"].includes(key),
    ),
  );
  for (const exception of event.exception?.values ?? []) {
    exception.value = "Application error. Private error details omitted.";
    for (const frame of exception.stacktrace?.frames ?? []) {
      if (frame.filename) frame.filename = frame.filename.split(/[/\\]/).pop();
      delete frame.abs_path;
      delete frame.vars;
      delete frame.context_line;
      delete frame.pre_context;
      delete frame.post_context;
    }
  }
  return event;
}
