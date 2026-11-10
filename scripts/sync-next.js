const fs = require('fs');
const path = require('path');

try {
  let gitRoot = process.cwd();
  while (gitRoot !== path.dirname(gitRoot)) {
    if (fs.existsSync(path.join(gitRoot, '.git'))) {
      break;
    }
    gitRoot = path.dirname(gitRoot);
  }

  const possibleSources = [
    path.resolve('.next'),
    path.resolve(__dirname, '../apps/web/.next'),
    path.resolve(gitRoot, 'apps/web/.next')
  ];

  const source = possibleSources.find((p) => fs.existsSync(p));

  if (source) {
    const target = path.join(gitRoot, '.next');
    if (path.resolve(source) !== path.resolve(target)) {
      console.log(`[sync-next] Synchronizing ${source} -> ${target}`);
      fs.cpSync(source, target, { recursive: true });
      console.log(`[sync-next] Succeeded! Manifest exists: ${fs.existsSync(path.join(target, 'routes-manifest.json'))}`);
    } else {
      console.log('[sync-next] Target and source are identical, no copy needed.');
    }
  } else {
    console.warn('[sync-next] No .next folder found to synchronize.');
  }
} catch (err) {
  console.warn('[sync-next] Warning during synchronization:', err.message);
}
