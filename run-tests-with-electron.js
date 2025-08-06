// run-tests-with-electron.js - Run Jest with output logging
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const electronPath = require('electron');

// Function to strip ANSI color codes from text
function stripAnsiCodes(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

// Setup output directory structure
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // Safe filename timestamp
const outputDir = path.join(__dirname, 'jest_test_results', today);
const outputFile = path.join(outputDir, `test-results-${timestamp}.log`);

// Create directories if they don't exist
fs.mkdirSync(outputDir, { recursive: true });

// Run Jest directly via its main entry point
const jestCliPath = path.join(__dirname, 'node_modules', 'jest', 'bin', 'jest.js');

console.log('Running Jest with Electron Node.js...');
console.log('Electron path:', electronPath);
console.log('Jest CLI path:', jestCliPath);
console.log(`Test results will be saved to: ${outputFile}`);
console.log('─'.repeat(80));

const child = spawn(electronPath, [jestCliPath, ...process.argv.slice(2)], {
  env: { 
    ...process.env, 
    ELECTRON_RUN_AS_NODE: '1'
  }
});

// Create write stream for logging
const logStream = fs.createWriteStream(outputFile, { flags: 'w' });

// Write header to log file
logStream.write(`Jest Test Results\n`);
logStream.write(`Run Date: ${new Date().toISOString()}\n`);
logStream.write(`Command: ${process.argv.join(' ')}\n`);
logStream.write(`Working Directory: ${__dirname}\n`);
logStream.write('='.repeat(80) + '\n\n');

// Capture and display stdout
child.stdout.on('data', (data) => {
  const output = data.toString();
  process.stdout.write(output); // Display to console (with colors)
  logStream.write(stripAnsiCodes(output)); // Write to file (without colors)
});

// Capture and display stderr
child.stderr.on('data', (data) => {
  const output = data.toString();
  process.stderr.write(output); // Display to console (with colors)
  logStream.write(stripAnsiCodes(output)); // Write to file (without colors)
});

child.on('exit', (code) => {
  logStream.write(`\n${'='.repeat(80)}\n`);
  logStream.write(`Test run completed with exit code: ${code}\n`);
  logStream.write(`End time: ${new Date().toISOString()}\n`);
  logStream.end();
  
  console.log('─'.repeat(80));
  console.log(`✅ Test results saved to: ${outputFile}`);
  process.exit(code);
});

child.on('error', (error) => {
  const errorMsg = `Failed to start test process: ${error.message}\n`;
  console.error(errorMsg);
  logStream.write(errorMsg);
  logStream.end();
  process.exit(1);
});