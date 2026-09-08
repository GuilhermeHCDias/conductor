const { execFile } = require('node:child_process');
const { join } = require('node:path');
const { promisify } = require('node:util');

const run = promisify(execFile);

/**
 * Ad-hoc signs the packaged .app before the dmg and zip are built from it.
 *
 * `identity: null` in electron-builder.yml means "no certificate of ours"
 * (.context.md §9.0), and that stays true: `--sign -` is an ad-hoc signature,
 * which needs no certificate, no team and no Apple account. What it does need
 * to exist at all is a real bundle signature — without this step the .app
 * ships carrying only the linker's own ad-hoc mark on the Mach-O binary, with
 * `Identifier=Electron`, no `_CodeSignature` and no sealed resources. macOS
 * reads that as a *broken* signature rather than a missing one, and a broken
 * signature is what makes another Mac say the app "is damaged and can't be
 * opened" — a dead end whose only button is Move to Trash. Signed properly,
 * the same unnotarized app reads as an unidentified developer instead, which
 * the person can actually get past.
 *
 * This never makes the app notarized: a copy that arrives carrying the
 * quarantine attribute still has to be cleared with `xattr -cr` on the machine
 * that received it.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  // Nested code (frameworks, helpers) has to be signed before the outer
  // bundle, which is the order `--deep` walks.
  await run('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app]);
  await run('codesign', ['--verify', '--deep', '--strict', app]);
};
