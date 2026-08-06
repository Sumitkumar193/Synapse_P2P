import * as path from 'path';
import { execSync } from 'child_process';

const PROJECT_ROOT = path.resolve(__dirname, '..');

function main() {
  const platform = process.platform;
  console.log(`\n==================================================`);
  console.log(`  💿 CROSS-PLATFORM INSTALLER BUILD: ${platform}`);
  console.log(`==================================================\n`);

  // Step 1: Run application build
  console.log('[Build Installer] 🔨 Step 1: Compiling application bundles...');
  execSync('npm run build', { stdio: 'inherit', cwd: PROJECT_ROOT });

  // Step 2: Determine target flag for current OS
  let flag = '--win';
  if (platform === 'darwin') {
    flag = '--mac';
  } else if (platform === 'linux') {
    flag = '--linux';
  }

  // Step 3: Run electron-builder
  console.log(`[Build Installer] 💿 Step 2: Generating OS installer package (${flag})...`);
  const builderCmd = `npx -y electron-builder ${flag}`;

  try {
    execSync(builderCmd, { stdio: 'inherit', cwd: PROJECT_ROOT });
    console.log(`\n==================================================`);
    console.log(`  🎉 INSTALLER BUILD COMPLETE! (Check release/) `);
    console.log(`==================================================\n`);
  } catch (err: any) {
    console.error(`[Build Installer] ❌ Installer generation failed:`, err.message);
    process.exit(1);
  }
}

main();
