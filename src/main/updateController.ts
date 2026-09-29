import { UpdateChannel, UpdateStatus, UpdateTarget } from "../shared/updates";

export type UpdateCandidate = UpdateTarget & { feedUrl: string };
export interface UpdateBackend {
  check(channel: UpdateChannel): Promise<UpdateCandidate | null>;
  download(candidate: UpdateCandidate, progress: (percent: number) => void): Promise<void>;
  cancel(): void;
  install(): void;
  abortInstall?(): void;
}
/** A download is only installable in the channel and operation that produced it. */
export class UpdateController {
  private status: UpdateStatus;
  private candidate: UpdateCandidate | null = null;
  private operation: Promise<void> | null = null;
  private generation = 0;
  constructor(private readonly backend: UpdateBackend, version: string, channel: UpdateChannel,
    private readonly persist: (channel: UpdateChannel) => Promise<void>,
    private readonly emit: (status: UpdateStatus) => void, disabledReason: string | null = null) {
    this.status = { currentVersion: version, channel, phase: disabledReason ? "disabled" : "idle", target: null,
      progress: null, message: disabledReason, checkedAt: null };
  }
  getStatus(): UpdateStatus { return { ...this.status, target: this.status.target ? { ...this.status.target } : null }; }
  private publish(patch: Partial<UpdateStatus>) { this.status = { ...this.status, ...patch }; this.emit(this.getStatus()); }
  private available() {
    if (this.status.phase === "disabled") throw new Error(this.status.message ?? "Updates unavailable.");
    if (this.operation || this.status.phase === "installing") throw new Error("Wait for the current update operation to finish.");
  }
  private run(phase: "checking" | "downloading", work: (generation: number) => Promise<void>): Promise<void> {
    this.available();
    const generation = ++this.generation;
    this.publish({ phase, message: null, progress: null });
    const operation = Promise.resolve().then(() => work(generation)).catch(error => {
      if (generation === this.generation) this.publish({ phase: "error", message: error instanceof Error ? error.message : "Update failed. Try again." });
    }).finally(() => { if (this.operation === operation) this.operation = null; });
    this.operation = operation;
    return operation;
  }
  async selectChannel(channel: unknown): Promise<void> {
    if (channel !== "stable" && channel !== "nightly") throw new Error("Unknown update channel.");
    this.available();
    // Reserve the controller while preferences are written so check/apply cannot race a switch.
    const generation = ++this.generation;
    this.candidate = null;
    this.publish({ phase: "checking", target: null, progress: null, message: null });
    const operation = this.persist(channel).then(() => {
      if (generation === this.generation) this.publish({ channel, phase: "idle", checkedAt: null });
    }).catch(error => {
      this.publish({ phase: "error", message: error instanceof Error ? error.message : "Unable to save update channel." });
      throw error;
    }).finally(() => { this.operation = null; });
    this.operation = operation;
    await operation;
  }
  check(): Promise<void> {
    return this.run("checking", async generation => {
      this.candidate = null;
      this.publish({ target: null });
      const candidate = await this.backend.check(this.status.channel);
      if (generation !== this.generation) return;
      this.candidate = candidate;
      const target = candidate ? { version: candidate.version, channel: candidate.channel, downgrade: candidate.downgrade, releaseUrl: candidate.releaseUrl } : null;
      this.publish({ phase: candidate ? "available" : "current", target, checkedAt: new Date().toISOString() });
    });
  }
  download(): Promise<void> {
    if (!this.candidate || !["available", "error"].includes(this.status.phase)) throw new Error("Check for an update first.");
    const candidate = this.candidate;
    return this.run("downloading", async generation => {
      await this.backend.download(candidate, percent => {
        if (generation === this.generation) this.publish({ progress: Math.min(100, Math.max(0, percent)) });
      });
      if (generation === this.generation) this.publish({ phase: "ready", progress: 100 });
    });
  }
  async cancel(): Promise<void> {
    if (this.status.phase !== "downloading") return;
    ++this.generation;
    this.publish({ phase: "cancelling" });
    this.backend.cancel();
    await this.operation;
    this.candidate = null;
    this.publish({ phase: "idle", target: null, progress: null });
  }
  install(dirty: boolean): void {
    this.available();
    if (dirty) throw new Error("Save your changes before restarting to update.");
    if (this.status.phase !== "ready" || !this.candidate || this.candidate.channel !== this.status.channel)
      throw new Error("Download the selected channel's update first.");
    this.publish({ phase: "installing", message: null });
    try { this.backend.install(); } catch (error) { this.failed(error); }
  }
  failed(error: unknown) {
    this.backend.abortInstall?.();
    this.candidate = null;
    const reason = error instanceof Error ? error.message : "Unable to install the update.";
    this.publish({ phase: "disabled", target: null, message: `${reason} Restart Bedrock before trying another update.` });
  }
}
