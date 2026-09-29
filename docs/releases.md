# Builds and releases

## Install a local development app

Run `pnpm install:local`, or choose **Install Bedrock Dev** in the Codex environment.
pnpm uses the pinned Node 22.23.2 runtime, matching CI. The command installs locked dependencies, copies the current checkout into a temporary
build directory, packages for this Mac's architecture, verifies an ad-hoc signature,
and installs `~/Applications/Bedrock Dev.app`.

The installer includes tracked edits and non-ignored new files. It builds independently
of the checkout's development-server output and isolates Electron Packager's temporary files. It requests a normal quit from an existing
Bedrock Dev instance, allowing save prompts. If Dev remains running for 60 seconds,
installation stops. The previous Dev bundle is retained until the new bundle is staged
and macOS accepts the launch request. It never targets `/Applications/Bedrock.app`.

| | Production | Local development |
| --- | --- | --- |
| Bundle identifier | `com.electron.bedrock` | `com.electron.bedrock.dev` |
| Installed location | `/Applications/Bedrock.app` | `~/Applications/Bedrock Dev.app` |
| Settings directory | Existing Electron user-data directory | `~/Library/Application Support/Bedrock Dev` |
| Signing | Developer ID and Apple notarization | Local ad-hoc signature |
| Markdown and TXT registration | Finder Open With | No file association registration |

Dev starts with separate settings and workspace selection. You can select the same
Bedrock folder to use your real notes. Those files are then shared, even though the
application settings are separate. Local installs do not publish releases or upload
telemetry. `Run Dev` remains available for hot reload.

An interrupted install may leave `~/Applications/.bedrock-dev-install.lock`. Confirm
that no installer is running before removing that empty directory. If rollback fails,
the command prints the retained previous bundle's path.

## Stable and nightly releases

Stable builds use a SemVer tag such as `1.5.2`. CI sets `package.json` to the tag's
version in the build checkout, then checks the source manifest, packaged ASAR, and
macOS bundle versions. It never pushes a version commit to protected main.
All checks and platform builds must pass before CI uploads a stable draft.
Review the draft, then publish it as the latest release.

Nightlies build on main pushes. A 30-minute schedule retries unfinished work and
builds a new commit if a push was missed. Unchanged published commits are skipped.
A manual run on main forces a new nightly. Failed jobs reuse their draft and tag.
Nightly versions use the next patch followed by `-nightly.YYYYMMDD.RUN_NUMBER`.
They pass the same gates as stable, then publish automatically as prereleases with
`make_latest=false`. Stable installations never follow these prereleases.

Each published tag is immutable. CI refuses to replace a published release's
assets. Downloads include macOS arm64 and x64 DMG/ZIP files, a Windows x64 NSIS
installer, checksums, and architecture-specific updater metadata. The updater
pins its download to one tag so a newer nightly cannot change an active download.

The macOS Build environment supplies the Developer ID certificate and App Store
Connect key. Missing credentials fail the build. Forge signs and notarizes the
app and DMG; CI validates the signatures and stapled tickets. Windows installers
are currently unsigned. Publishing requires no Windows signing credentials.

## In-app updates, starting with 1.5.2

Settings → Updates shows the running version, selected channel, download progress,
release notes, and restart action. Bedrock checks every 30 minutes and downloads
new versions in the background. Installation requires an explicit restart.
Unsaved documents block that restart, and editing stays locked while installation
starts. Failed downloads leave the current app usable.

Changing the channel and choosing Apply saves the preference, checks the channel,
and downloads its current release. Returning from Nightly to Stable can install an
older version. Bedrock shows the version before restart. Cancelling or switching
channels invalidates the previous download. A native installation failure requires
restarting Bedrock before another update attempt.

Both channels share the same application identity and settings directory. Nightly
changes must preserve compatibility with the latest stable settings and document
formats. Any future irreversible migration needs a separate migration design before
it can ship on Nightly. The updater never rewrites workspace documents.

Versions before 1.5.2 need one manual installation to gain the updater. On macOS,
quit Bedrock and replace the app with the downloaded release. On Windows, uninstall
the old Squirrel installation through Installed Apps before installing the new NSIS
release. Keep your workspace and `%APPDATA%/Bedrock` settings folder. The two
installer systems cannot update each other, and leaving both installed can leave
old shortcuts pointing at the old version. Future NSIS versions update in place.

Local Bedrock Dev builds and unpackaged development sessions have updates disabled.
The production updater accepts only the repository's release feeds. The native CI
smoke test uses a loopback feed only with explicit test mode, CI mode, and isolated
user data.

## Verification

The baseline is `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`,
`pnpm test:release`, and `pnpm test:e2e`. Updater coverage includes channel filtering,
cancelled and stale downloads, cross-channel downgrades, dirty-document protection,
preference failures, offline checks, and failed downloads.

Release CI also installs two builds from the same source with different versions
on disposable macOS arm64 and Windows x64 runners. It performs a native update to
Nightly and a downgrade to Stable, launches each replaced app, and checks version,
channel preference, and preserved document/settings bytes. macOS uses actual
Developer ID signatures and notarization. Intel builds receive signature and
artifact checks; the native round trip runs on arm64. Evidence is uploaded as
`update-smoke-*` artifacts. A failed round trip prevents release publication.

## App icon

The approved source is `src/assets/bedrock.icon`, including the original Lucide
folder-pen artwork and its license. The filled shape and sharp notch are intentional.
Run `python3 scripts/generate-icons.py` on macOS with Xcode and Pillow to export
Icon Composer's macOS rendition and generate the committed PNG, ICNS, and ICO.
The app About screen uses the PNG; app bundles, DMGs, and Windows installers use
the platform formats. Keep the website icon synchronized with this PNG.

## Version checks

Release CI still derives the build version from the tag, then verifies `package.json`, the packaged ASAR manifest, and both macOS bundle version fields before uploading artifacts. A mismatch fails the build.
