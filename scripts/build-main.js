const fs = require('fs');
const path = require('path');

function copyDirectory(src, dest) {
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Read directory contents
  const items = fs.readdirSync(src);

  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      // Recursively copy subdirectories
      copyDirectory(srcPath, destPath);
    } else if (stat.isFile() && (item.endsWith('.js') || item.endsWith('.sql'))) {
      // Copy JavaScript and SQL files
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied: ${srcPath} -> ${destPath}`);
    }
  }
}

function buildMain() {
  const srcDir = path.join(__dirname, '../src/main');
  const destDir = path.join(__dirname, '../dist/main');
  const sharedSrcDir = path.join(__dirname, '../src/shared');
  const sharedDestDir = path.join(__dirname, '../dist/shared');

  console.log('🔨 Building main process...');
  
  // Copy main process files
  copyDirectory(srcDir, destDir);
  
  // Copy shared files
  copyDirectory(sharedSrcDir, sharedDestDir);
  
  console.log('✅ Main process build complete!');
}

// Handle watch mode if --watch flag is passed
if (process.argv.includes('--watch')) {
  console.log('👀 Watching for changes...');
  const chokidar = require('chokidar');
  
  const watcher = chokidar.watch(['src/main/**/*.js', 'src/shared/**/*.js'], {
    ignored: /node_modules/,
    persistent: true
  });

  watcher.on('change', (filePath) => {
    console.log(`File changed: ${filePath}`);
    buildMain();
  });

  watcher.on('add', (filePath) => {
    console.log(`File added: ${filePath}`);
    buildMain();
  });
} else {
  buildMain();
} 