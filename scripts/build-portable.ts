import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(PROJECT_ROOT, 'release');

function main() {
  const platform = process.platform;
  const arch = process.arch;
  const appName = 'P2PScreenShare';
  const folderName = `${appName}-${platform}-${arch}`;
  const packageDir = path.join(RELEASE_DIR, folderName);
  const zipFileName = `${appName}-Portable-${platform}-${arch}.zip`;
  const zipPath = path.join(RELEASE_DIR, zipFileName);

  console.log(`\n==================================================`);
  console.log(`  📦 CROSS-PLATFORM PORTABLE BUILD: ${platform} (${arch})`);
  const includeModels = process.argv.includes('--include-models') || process.env.INCLUDE_MODELS === 'true';
  if (includeModels) {
    console.log(`  ⚠️ Mode: INCLUDING downloaded Whisper models in portable package`);
  } else {
    console.log(`  ⚡ Mode: LIGHTWEIGHT BUILD (Excluding heavy downloaded Whisper models ~500MB+)`);
    console.log(`  💡 Tip: Use 'npm run build:portable -- --include-models' if you want to bundle all local models.`);
  }
  console.log(`==================================================\n`);

  // Step 1: Run application build
  console.log('[Build Portable] 🔨 Step 1: Compiling application bundles...');
  execSync('npm run build', { stdio: 'inherit', cwd: PROJECT_ROOT });

  // Step 2: Package Electron app
  console.log(`[Build Portable] 📦 Step 2: Packaging Electron app for platform=${platform}, arch=${arch}...`);
  
  // Build ignore regex patterns for electron-packager
  const defaultIgnorePatterns = [
    '/(docs|Documentation|test|scratch|release|out|build|\\.git|\\.github|\\.vscode)($|/)',
    '\\.md$',
  ];

  if (!includeModels) {
    // Exclude heavy model downloads in vendor/whisper/models
    defaultIgnorePatterns.push('/vendor/whisper/models($|/)');
  }

  const ignoreFlags = defaultIgnorePatterns.map((pattern) => `--ignore="${pattern}"`).join(' ');

  const packageCmd = `npx -y electron-packager . ${appName} --platform=${platform} --arch=${arch} --out=release --overwrite ${ignoreFlags}`;
  console.log(`[Build Portable] 🏃 Executing: ${packageCmd}`);
  execSync(packageCmd, { stdio: 'inherit', cwd: PROJECT_ROOT });

  // Step 3: Cross-platform Zip archiving using pure Node.js (adm-zip)
  console.log(`[Build Portable] 🗜️  Step 3: Creating cross-platform portable zip archive: ${zipFileName}...`);

  if (!fs.existsSync(packageDir)) {
    console.error(`[Build Portable] ❌ Package directory not found at: ${packageDir}`);
    process.exit(1);
  }

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    zip.addLocalFolder(packageDir, `${appName}`);
    zip.writeZip(zipPath);
    console.log(`[Build Portable] ✅ Successfully generated portable package:`);
    console.log(`                 📍 ${zipPath}`);
  } catch (err: any) {
    console.warn(`[Build Portable] ⚠️ adm-zip fallback: Attempting platform native archive tool (${err.message})`);
    if (platform === 'win32') {
      execSync(`powershell Compress-Archive -Path "${packageDir}/*" -DestinationPath "${zipPath}" -Force`, {
        stdio: 'inherit',
      });
    } else {
      execSync(`zip -r "${zipPath}" .`, { cwd: packageDir, stdio: 'inherit' });
    }
    console.log(`[Build Portable] ✅ Generated portable package at ${zipPath}`);
  }

  console.log('\n==================================================');
  console.log('  🎉 PORTABLE BUILD COMPLETE!  ');
  console.log('==================================================\n');
}

main();
