// run-tests-with-electron.js - Run Jest directly as module
const { spawn } = require('child_process');
const path = require('path');

const electronPath = require('electron');

// Run Jest directly via its main entry point
const jestCliPath = path.join(__dirname, 'node_modules', 'jest', 'bin', 'jest.js');

console.log('Running Jest with Electron Node.js...');
console.log('Electron path:', electronPath);
console.log('Jest CLI path:', jestCliPath);

const child = spawn(electronPath, [jestCliPath], {
  stdio: 'inherit',
  env: { 
    ...process.env, 
    ELECTRON_RUN_AS_NODE: '1'
  }
});

child.on('exit', (code) => {
  process.exit(code);
});

child.on('error', (error) => {
  console.error('Failed to start test process:', error);
  process.exit(1);
});