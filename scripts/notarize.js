const { execFileSync } = require('child_process');

const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_ATTEMPTS = 120;

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`  [${ts}] ${msg}`);
}

function runNotarytool(args, appleId, password, teamId) {
  return JSON.parse(
    execFileSync('xcrun', [
      'notarytool', ...args,
      '--apple-id', appleId,
      '--password', password,
      '--team-id', teamId,
      '--output-format', 'json',
    ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notarize(artifactPath) {
  const appleId = process.env.APPLE_ID;
  const password = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !password || !teamId) {
    throw new Error('Missing APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, or APPLE_TEAM_ID');
  }

  console.log('');
  console.log('  ══════════════════════════════════════════');
  console.log('  NOTARIZATION');
  console.log('  ══════════════════════════════════════════');
  log(`Artifact: ${artifactPath}`);
  console.log('');

  log('Uploading to Apple notarization service...');
  let submitResult;
  try {
    submitResult = runNotarytool(['submit', artifactPath], appleId, password, teamId);
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    log('ERROR: Submission failed');
    console.error(output);
    throw new Error('Notarization submission failed');
  }

  const submissionId = submitResult.id;
  log(`Submitted successfully (ID: ${submissionId})`);

  log('Waiting for Apple to process...');
  let status = 'In Progress';
  let attempts = 0;

  while (status === 'In Progress') {
    attempts++;
    if (attempts > MAX_POLL_ATTEMPTS) {
      throw new Error(`Notarization timed out after ${MAX_POLL_ATTEMPTS} checks (~${Math.round(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 60000)} min)`);
    }

    await sleep(POLL_INTERVAL_MS);

    let info;
    try {
      info = runNotarytool(['info', submissionId], appleId, password, teamId);
    } catch (err) {
      log(`WARNING: Status check failed (attempt ${attempts}), retrying...`);
      continue;
    }

    status = info.status;
    log(`Status: ${status} (check ${attempts})`);
  }

  if (status !== 'Accepted') {
    log(`ERROR: Notarization finished with status "${status}"`);
    log('Fetching notarization log for details...');
    try {
      const logResult = execFileSync('xcrun', [
        'notarytool', 'log', submissionId,
        '--apple-id', appleId,
        '--password', password,
        '--team-id', teamId,
      ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      console.error(logResult);
    } catch (_) { /* log fetch is best-effort */ }
    throw new Error(`Notarization failed: ${status}`);
  }

  log('Notarization accepted! Stapling ticket...');
  try {
    execFileSync('xcrun', ['stapler', 'staple', artifactPath], { encoding: 'utf8' });
  } catch (err) {
    log('WARNING: Stapling failed — the artifact is notarized but the ticket was not stapled.');
    console.error(err.stderr || err.message);
    return;
  }

  log('Stapled successfully.');
  console.log('');
  console.log('  ══════════════════════════════════════════');
  log('Notarization complete!');
  console.log('  ══════════════════════════════════════════');
  console.log('');
}

if (require.main === module) {
  const artifact = process.argv[2];
  if (!artifact) {
    console.error('Usage: node notarize.js <path-to-dmg>');
    process.exit(1);
  }
  notarize(artifact).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { notarize };
