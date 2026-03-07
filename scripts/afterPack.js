const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log('  Stripping extended attributes (iCloud/Finder metadata)...');
  execFileSync('xattr', ['-cr', appPath]);
  console.log('  Done — app bundle is clean for code signing.');
};
