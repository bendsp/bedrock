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
| Markdown registration | Finder Open With | No file association registration |

Dev starts with separate settings and workspace selection. You can select the same
Bedrock folder to use your real notes. Those files are then shared, even though the
application settings are separate. Local installs do not publish releases or upload
telemetry. `Run Dev` remains available for hot reload.

An interrupted install may leave `~/Applications/.bedrock-dev-install.lock`. Confirm
that no installer is running before removing that empty directory. If rollback fails,
the command prints the retained previous bundle's path.

## Release a version

Use an existing SemVer tag such as `1.5.0` or `v1.5.0-beta.1`. Pushing the tag starts
Release. A manual workflow run must also select a tag. The tag sets `package.json`'s
version only in the build checkout; the workflow does not push a version commit.
The source manifest can therefore lag the latest release and is not the release authority.

Release validates the tag and refuses to modify a published release. It runs the same
lint, typecheck, unit, release-script, and Linux Electron checks as CI. Builds then
produce macOS arm64 and x64 DMG/ZIP files and Windows x64 Squirrel artifacts. Every
platform must succeed before upload to a GitHub draft. Prerelease tags create prerelease
drafts. Review the draft and publish it manually.

Ordinary local packaging signs only when an explicit identity is configured.
The macOS build uses the GitHub **Build** environment's Developer ID certificate and
App Store Connect key. Missing credentials fail the release. Forge signs and notarizes
the app, then notarizes the DMG. The workflow validates signatures, Gatekeeper acceptance,
and stapled tickets. Artifact names distinguish architectures; SHA-256 files accompany
the downloads. Windows includes the installer, package, and RELEASES metadata.

## Review findings, 8 September 2026

The previous successful release was `1.4.0`, with arm64 ZIP, DMG, and Windows installer.
Its Apple credential names remain configured in the Build environment. Their presence
does not prove the certificate or key is still valid. The new signed release matrix
needs a real tagged run before its notarization and Intel builds can be called verified.
No release was published during this review.

Fixed gaps include missing test gates, branch names used as versions on manual runs,
missing Intel artifacts, uploads that assumed a release already existed, incomplete
Windows artifacts, and the possibility of replacing published downloads. CI now also
runs on main. A Linux trace-cleanup failure after the last window closed was corrected. Local packaging under Node 26 exited during ZIP extraction; pinning Node 22.23.2 restored complete builds. Trusted-frame URL comparison now normalizes URL encoding so installed paths containing spaces work.

Automatic updates are not implemented in the current source. There is no updater
initialization, feed selection, or install/restart flow. Preserving the production
installation keeps it available for future update testing, but does not establish an
existing update path. Add that as a separate feature and verify an actual upgrade
between two signed releases. macOS updates require a signed app and a compatible feed.
See [Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater/)
and [Forge ZIP update support](https://www.electronforge.io/config/makers/zip).

Windows signing is also not configured. The Windows installer remains unsigned.
This review does not introduce a signing provider or credentials for it.

## Verification

Local validation passed lint, typecheck, 82 unit checks, three release-script tests,
and 40 Electron workflows. `actionlint` passed for both workflows. Native computer use
confirmed the installed Dev app loads its Home screen without IPC errors. Reinstalling
while Dev was running exercised graceful quit and replacement. The production app's
`app.asar` SHA-256 remained unchanged. Local Dev builds use ad-hoc signing; this is not
proof of Apple notarization or a production auto-update.

## App icon

The approved source is `src/assets/bedrock.icon`, including the original Lucide
folder-pen artwork and its license. The filled shape and sharp notch are intentional.
Run `python3 scripts/generate-icons.py` on macOS with Xcode and Pillow to export
Icon Composer's macOS rendition and generate the committed PNG, ICNS, and ICO.
The app About screen uses the PNG; app bundles, DMGs, and Windows installers use
the platform formats. Keep the website icon synchronized with this PNG.
