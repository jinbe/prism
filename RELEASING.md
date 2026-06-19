# Releasing

Prism ships as a signed, notarized macOS build via GitHub Releases. Pushing a
version tag runs `.github/workflows/release.yml`, which builds, signs, notarizes,
and uploads the `.dmg` (arm64 + x64) to a draft GitHub Release.

## Cutting a release

1. Bump `version` in `package.json` (land it on `main`).
2. Tag and push:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
3. The **Release** workflow builds on a macOS runner and creates a **draft**
   GitHub Release with the artifacts.
4. Review the draft on GitHub, add notes, and publish it.

Tags aren't covered by branch protection, so the push works directly; the version
bump in step 1 still goes through the normal `main` flow.

## Required repository secrets

Set these in **Settings → Secrets and variables → Actions**:

| Secret | What it is | Where to get it |
| --- | --- | --- |
| `CSC_LINK` | base64 of your *Developer ID Application* certificate (`.p12`) | export the cert from Keychain Access (with its private key) as `.p12`, then `base64 -i cert.p12 \| pbcopy` |
| `CSC_KEY_PASSWORD` | the password you set on that `.p12` export | you choose it at export time |
| `APPLE_ID` | your Apple ID email | your Apple Developer account |
| `APPLE_APP_SPECIFIC_PASSWORD` | an app-specific password for notarization | <https://appleid.apple.com> → Sign-In and Security → App-Specific Passwords |
| `APPLE_TEAM_ID` | your 10-character Team ID | <https://developer.apple.com/account> → Membership |

The certificate is a **Developer ID Application** cert (for distribution outside
the App Store), created at developer.apple.com or via Xcode → Settings →
Accounts → Manage Certificates.

## Building locally

```bash
pnpm run build:mac      # dist/Prism-<version>-<arch>.dmg
```

Without the signing cert in your Keychain and the `APPLE_*` env vars set, this
still produces a `.dmg`, just unsigned and un-notarized (the notarize step skips
itself). To produce a real signed build locally, install the Developer ID cert in
your login Keychain and export the notarization vars before running:

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
pnpm run build:mac
```

## Notes

- Output goes to `dist/` (git-ignored).
- Other platforms: `pnpm run build:win` / `pnpm run build:linux` exist but aren't
  wired into CI yet.
