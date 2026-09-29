import { useEffect, useState } from "react";
import { UpdateChannel, UpdateStatus } from "../../shared/updates";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export default function UpdatesSettings({ dirty, onInstall }: { dirty: boolean; onInstall: () => Promise<void> }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [channel, setChannel] = useState<UpdateChannel | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const unsubscribe = window.electronAPI.onUpdateStatus(setStatus);
    void window.electronAPI.getUpdateStatus().then(value => { setStatus(value); setChannel(value.channel); }).catch(error => setError(String(error)));
    return unsubscribe;
  }, []);
  const run = async (action: () => Promise<void>) => {
    setError(null);
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Update failed. Try again."); }
  };
  if (!status) return <p role="status">{error ?? "Loading updates…"}</p>;
  const busy = ["checking", "downloading", "cancelling", "installing"].includes(status.phase);
  const disabled = status.phase === "disabled";
  const target = status.target;
  return <div className="space-y-5">
    <div><p className="font-medium">Bedrock {status.currentVersion}</p><p className="text-sm text-muted-foreground">Following {status.channel === "stable" ? "Stable" : "Nightly"}.</p></div>
    <div className="space-y-2">
      <label id="update-channel-label" className="text-sm font-medium">Update channel</label>
      <Select value={channel ?? status.channel} disabled={busy || disabled} onValueChange={value => setChannel(value as UpdateChannel)}>
        <SelectTrigger aria-labelledby="update-channel-label"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="stable">Stable</SelectItem><SelectItem value="nightly">Nightly</SelectItem></SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">Stable receives published releases. Nightly receives frequent test builds and may have bugs. You can return to Stable at any time.</p>
      {channel && channel !== status.channel ? <Button disabled={busy || disabled} onClick={() => void run(async () => {
        await window.electronAPI.setUpdateChannel(channel);
        await window.electronAPI.checkForUpdates();
        const result = await window.electronAPI.getUpdateStatus();
        if (result.phase === "available") await window.electronAPI.downloadUpdate();
      })}>Apply channel</Button> : null}
    </div>
    <div role="status" aria-live="polite" className="space-y-2 text-sm">
      {status.phase === "checking" ? <p>Checking for updates…</p> : null}
      {status.phase === "current" ? <p>You have the latest {status.channel} version.</p> : null}
      {status.phase === "downloading" ? <><p>Downloading {target?.version}… {status.progress === null ? "" : `${Math.round(status.progress)}%`}</p><progress aria-label="Update download" max={100} value={status.progress ?? undefined} className="w-full" /></> : null}
      {status.phase === "cancelling" ? <p>Cancelling download…</p> : null}
      {status.phase === "installing" ? <p>Installing and restarting…</p> : null}
      {target && ["available", "ready", "error"].includes(status.phase) ? <p>{target.version} {status.phase === "ready" ? "is ready to install." : "is available."}</p> : null}
      {target?.downgrade ? <p>Returning to {target.channel} installs the older version {target.version}. Your documents and settings stay in place.</p> : null}
      {status.message ? <p>{status.message}</p> : null}
    </div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy || disabled || status.phase === "ready"} onClick={() => void run(() => window.electronAPI.checkForUpdates())}>Check for updates</Button>
      {target && ["available", "error"].includes(status.phase) ? <Button onClick={() => void run(() => window.electronAPI.downloadUpdate())}>Download update</Button> : null}
      {status.phase === "downloading" ? <Button variant="outline" onClick={() => void run(() => window.electronAPI.cancelUpdate())}>Cancel download</Button> : null}
      {status.phase === "ready" ? <Button disabled={dirty} onClick={() => void run(onInstall)}>Restart with {target?.version}</Button> : null}
    </div>
    {dirty && status.phase === "ready" ? <p className="text-sm text-muted-foreground">Save your changes before restarting to update.</p> : null}
    {target ? <Button variant="link" onClick={() => void window.electronAPI.openExternal(target.releaseUrl)}>Release notes</Button> : null}
    <p className="text-xs text-muted-foreground">Bedrock checks every 30 minutes and downloads updates in the background. It only installs when you choose to restart.</p>
  </div>;
}
