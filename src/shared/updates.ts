export type UpdateChannel = "stable" | "nightly";
export type UpdateTarget = {
  version: string;
  channel: UpdateChannel;
  downgrade: boolean;
  releaseUrl: string;
};
export type UpdateStatus = {
  currentVersion: string;
  channel: UpdateChannel;
  phase: "disabled" | "idle" | "checking" | "available" | "current" | "downloading" | "cancelling" | "ready" | "installing" | "error";
  target: UpdateTarget | null;
  progress: number | null;
  message: string | null;
  checkedAt: string | null;
};
