import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const PROJECT_ROOT = path.resolve(__dirname, '..');

function build() {
  console.log('[Build] 🔨 Step 1: Emitting TypeScript declaration types...');
  execSync('npx tsc --emitDeclarationOnly', { stdio: 'inherit', cwd: PROJECT_ROOT });

  console.log('[Build] ⚡ Step 2: Bundling Main process...');
  execSync(
    'npx esbuild src/main/index.ts --bundle --platform=node --target=node20 --outfile=dist/main/index.js --external:electron',
    { stdio: 'inherit', cwd: PROJECT_ROOT }
  );

  console.log('[Build] ⚡ Step 3: Bundling Preload script...');
  execSync(
    'npx esbuild src/preload/index.ts --bundle --platform=node --target=node20 --outfile=dist/preload/index.js --external:electron',
    { stdio: 'inherit', cwd: PROJECT_ROOT }
  );

  console.log('[Build] ⚡ Step 4: Bundling Renderer React application...');
  execSync(
    'npx esbuild src/renderer/index.tsx --bundle --platform=browser --target=chrome120 --outfile=dist/renderer/index.js --jsx=automatic --define:process.env.NODE_ENV=\'"production"\'',
    { stdio: 'inherit', cwd: PROJECT_ROOT }
  );

  console.log('[Build] 📄 Step 5: Copying index.html to dist/renderer...');
  const distRenderer = path.join(PROJECT_ROOT, 'dist', 'renderer');
  fs.mkdirSync(distRenderer, { recursive: true });
  fs.copyFileSync(
    path.join(PROJECT_ROOT, 'src', 'renderer', 'index.html'),
    path.join(distRenderer, 'index.html')
  );

  console.log('[Build] ✅ Cross-platform build completed successfully!\n');
}

build();
