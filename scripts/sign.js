const { execFileSync } = require('child_process');
const { signAsync } = require('@electron/osx-sign');
const path = require('path');
const os = require('os');
const fs = require('fs');

exports.default = async function customSign(opts) {
  const appPath = opts.app;
  const appName = path.basename(appPath);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-sign-'));
  const tmpAppPath = path.join(tmpDir, appName);

  try {
    console.log('  Copying app bundle to temp directory (outside iCloud)...');
    execFileSync('ditto', [appPath, tmpAppPath]);
    execFileSync('xattr', ['-cr', tmpAppPath]);

    console.log('  Signing app bundle...');
    await signAsync({ ...opts, app: tmpAppPath });

    console.log('  Copying signed app back...');
    execFileSync('rm', ['-rf', appPath]);
    execFileSync('ditto', [tmpAppPath, appPath]);
    console.log('  Signing complete.');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};
