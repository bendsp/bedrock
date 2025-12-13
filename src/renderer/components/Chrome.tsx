import React, { useMemo } from "react";
import {
  FolderOpen,
  Save,
  SaveAll,
  Settings as SettingsIcon,
} from "lucide-react";

import { Button } from "./ui/button";
import { TooltipProvider } from "./ui/tooltip";

export type ChromeProps = {
  title: string;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpenSettings: () => void;
  children: React.ReactNode;
};

export function Chrome({
  title,
  onOpen,
  onSave,
  onSaveAs,
  onOpenSettings,
  children,
}: ChromeProps) {
  const isMac = useMemo(() => {
    // Renderer-safe platform check (nodeIntegration is disabled).
    return navigator.platform.toLowerCase().includes("mac");
  }, []);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="h-full w-full bg-sidebar p-2">
        <div className="h-full w-full text-sidebar-foreground flex flex-col gap-2">
          <header
            className={`bed-drag-region relative flex h-6 items-center gap-2 px-1 ${
              isMac ? "pl-[72px]" : ""
            }`}
          >
            <span className="absolute left-1/2 -translate-x-1/2 text-[13px] text-muted-foreground">
              {title}
            </span>
          </header>

          <div className="flex-1 min-h-0 flex items-stretch gap-2">
            <aside className="w-8 shrink-0 bg-transparent text-sidebar-foreground flex flex-col items-center py-2 gap-2">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label="Open…"
                onClick={onOpen}
              >
                <FolderOpen className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label="Save"
                onClick={onSave}
              >
                <Save className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label="Save As…"
                onClick={onSaveAs}
              >
                <SaveAll className="size-4" />
              </Button>
              <div className="flex-1" />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label="Settings"
                onClick={onOpenSettings}
              >
                <SettingsIcon className="size-4" />
              </Button>
            </aside>

            <div className="flex-1 min-w-0 overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl flex flex-col">
              <div className="flex-1 min-h-0 overflow-hidden">
                <div className="app-shell">
                  <div className="flex-1 min-h-0">{children}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
