# Releasing (GitHub Actions)

This repo publishes release artifacts on tag push via `.github/workflows/release.yml`.

## What gets built

- Windows: Squirrel installer (`Bedrock.exe`)
- macOS: `dmg` + `zip` (signed + notarized)

Releases are created as **drafts** and assets are uploaded to the GitHub Release for the tag.

## macOS signing + notarization (CI)

macOS builds require **both**:

- **Code signing** with a **Developer ID Application** certificate
- **Notarization** with Apple’s notarization service

For CI, notarization is configured to use **App Store Connect API keys** (`.p8`) via `notarytool`
(preferred over Apple ID + app-specific password).

### Required GitHub Secrets

Add these in GitHub → Settings → Secrets and variables → Actions → **Secrets**:

- **`MACOS_CERTIFICATE_P12_BASE64`**: base64 of your exported signing certificate `.p12`
  - Must contain a **Developer ID Application** identity (not “Mac App Distribution”)
- **`MACOS_CERTIFICATE_PASSWORD`**: password used when exporting the `.p12`
- **`APPLE_TEAM_ID`**: your Apple Developer Team ID (e.g. `ABCD123456`)
- **`APPLE_IDENTITY`** (optional but recommended): the exact signing identity string
  - Example: `Developer ID Application: Your Name (ABCD123456)`

App Store Connect API key (notarization):

- **`APPLE_API_KEY_P8_BASE64`**: base64 of the downloaded `.p8` key file contents
- **`APPLE_API_KEY_ID`**: the Key ID (10 chars, e.g. `ABC123DEFG`)
- **`APPLE_API_ISSUER_ID`**: the Issuer ID (UUID)

### One-time Apple setup

1. **Create an App Store Connect API key**
   - App Store Connect → Users and Access → Integrations → **API Keys**
   - Create a key with permissions that can notarize (commonly “App Manager”).
   - Download the `.p8` file once (you won’t be able to download it again).
2. **Create/export your Developer ID Application certificate**
   - Apple Developer → Certificates → **Developer ID Application**
   - Install it locally, then export as `.p12` from Keychain Access (include the private key).
3. Encode files for GitHub Secrets

```bash
base64 -i path/to/certificate.p12 | pbcopy
base64 -i path/to/AuthKey_XXXXXXXXXX.p8 | pbcopy
```

## Local notarization (fallback)

`forge.config.ts` still supports local notarization using:

- `APPLE_ID`
- `APPLE_PASSWORD` (app-specific password)
- `APPLE_TEAM_ID`

But CI is designed to use the `.p8` API key flow.
