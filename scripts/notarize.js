// Notarization stub - to be implemented when Apple Developer account is available
exports.default = async function notarizing(context) {
  if (process.env.SKIP_NOTARIZE === 'true') {
    console.log('Skipping notarization (SKIP_NOTARIZE=true)');
    return;
  }
  
  // Future: Add notarization logic here when certificates are available
  console.log('Notarization not configured (no credentials)');
};
