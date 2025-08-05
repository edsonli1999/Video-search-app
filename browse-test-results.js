#!/usr/bin/env node
// browse-test-results.js - Browse and display test results
const fs = require('fs');
const path = require('path');

const testResultsDir = path.join(__dirname, 'jest_test_results');

function listTestResults() {
  if (!fs.existsSync(testResultsDir)) {
    console.log('No test results found. Run some tests first!');
    return;
  }

  const dates = fs.readdirSync(testResultsDir)
    .filter(item => fs.statSync(path.join(testResultsDir, item)).isDirectory())
    .sort()
    .reverse(); // Most recent first

  if (dates.length === 0) {
    console.log('No test results found.');
    return;
  }

  console.log('📊 Available Test Results:\n');

  dates.forEach((date, index) => {
    const dateDir = path.join(testResultsDir, date);
    const files = fs.readdirSync(dateDir)
      .filter(file => file.endsWith('.log'))
      .sort()
      .reverse(); // Most recent first

    console.log(`${index + 1}. ${date} (${files.length} test run${files.length === 1 ? '' : 's'})`);
    
    files.forEach((file, fileIndex) => {
      const filePath = path.join(dateDir, file);
      const stats = fs.statSync(filePath);
      const time = file.match(/test-results-(.+)\.log/)?.[1]?.replace(/-/g, ':').substring(11, 19) || 'unknown';
      
      console.log(`   ${String.fromCharCode(97 + fileIndex)}. ${time} (${Math.round(stats.size / 1024)}KB)`);
    });
    console.log();
  });
}

function showTestResult(dateIndex, fileIndex = 0) {
  const dates = fs.readdirSync(testResultsDir)
    .filter(item => fs.statSync(path.join(testResultsDir, item)).isDirectory())
    .sort()
    .reverse();

  if (dateIndex < 1 || dateIndex > dates.length) {
    console.log('Invalid date selection.');
    return;
  }

  const selectedDate = dates[dateIndex - 1];
  const dateDir = path.join(testResultsDir, selectedDate);
  const files = fs.readdirSync(dateDir)
    .filter(file => file.endsWith('.log'))
    .sort()
    .reverse();

  if (fileIndex < 0 || fileIndex >= files.length) {
    console.log('Invalid file selection.');
    return;
  }

  const selectedFile = files[fileIndex];
  const filePath = path.join(dateDir, selectedFile);
  
  console.log(`📄 Test Results: ${selectedDate} - ${selectedFile}`);
  console.log('='.repeat(80));
  
  const content = fs.readFileSync(filePath, 'utf8');
  console.log(content);
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  listTestResults();
} else if (args[0] === 'show' && args[1]) {
  const dateIndex = parseInt(args[1]);
  const fileIndex = args[2] ? parseInt(args[2]) - 1 : 0;
  showTestResult(dateIndex, fileIndex);
} else if (args[0] === 'latest') {
  // Show the most recent test result
  showTestResult(1, 0);
} else {
  console.log(`
Usage:
  node browse-test-results.js              # List all test results
  node browse-test-results.js show <date> [file]  # Show specific test result
  node browse-test-results.js latest       # Show most recent test result

Examples:
  node browse-test-results.js              # List all results
  node browse-test-results.js show 1       # Show first test run from most recent date
  node browse-test-results.js show 1 2     # Show second test run from most recent date
  node browse-test-results.js latest       # Show latest test result
`);
} 