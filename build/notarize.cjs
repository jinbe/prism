// electron-builder afterSign hook: notarize the signed .app with Apple.
// Skips gracefully when credentials aren't present (e.g. local dev builds), so
// `pnpm run build:mac` still works unsigned. CI provides the env vars.
const { notarize } = require('@electron/notarize')

exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== 'darwin') return

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log(
      'notarize: skipping (set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID to enable)'
    )
    return
  }

  const appName = context.packager.appInfo.productFilename
  console.log(`notarize: submitting ${appName}.app to Apple…`)
  await notarize({
    appPath: `${context.appOutDir}/${appName}.app`,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID
  })
  console.log('notarize: done')
}
