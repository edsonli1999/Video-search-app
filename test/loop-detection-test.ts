/**
 * Test harness for loop detection algorithm
 * 
 * Usage: npx tsx src/test/loop-detection-test.ts
 */

interface TranscriptionSegment {
    start: number;
    end: number;
    text: string;
    confidence: number;
  }
  
  // Copy of the deduplication and loop detection logic from whisper-worker
  function textsSimilar(text1: string, text2: string, threshold: number = 0.8): boolean {
    const clean1 = text1.toLowerCase().trim();
    const clean2 = text2.toLowerCase().trim();
    
    if (clean1 === clean2) return true;
    if (clean1.includes(clean2) || clean2.includes(clean1)) return true;
    
    const longer = clean1.length > clean2.length ? clean1 : clean2;
    const shorter = clean1.length > clean2.length ? clean2 : clean1;
    const commonChars = [...shorter].filter(char => longer.includes(char)).length;
    return commonChars / shorter.length > threshold;
  }
  
  function deduplicateAndDetectLoops(segments: TranscriptionSegment[]): TranscriptionSegment[] {
    if (segments.length === 0) return segments;
  
    // First, do standard deduplication (simplified for test)
    let processed = [...segments];
  
    console.log(`\n🔍 LOOP DETECTION TEST: Starting with ${processed.length} segments`);
  
    // Then, detect and remove looping patterns
    const loopDetectionWindow = 5;
    const loopsRemoved: number[] = [];
  
    for (let i = 0; i < processed.length - loopDetectionWindow; i++) {
      const currentText = processed[i].text.toLowerCase();
      
      let repetitions = 0;
      const repetitionIndices: number[] = [];
      
      for (let j = i + 1; j < Math.min(i + loopDetectionWindow, processed.length); j++) {
        if (textsSimilar(currentText, processed[j].text.toLowerCase(), 0.9)) {
          repetitions++;
          repetitionIndices.push(j);
          loopsRemoved.push(j);
        }
      }
      
      if (repetitions >= 2) {
        console.log(`\n🔴 LOOP DETECTED at segment ${i}:`);
        console.log(`   Text: "${currentText.substring(0, 80)}..."`);
        console.log(`   Repeated ${repetitions} times at indices: [${repetitionIndices.join(', ')}]`);
      }
    }
  
    // Remove detected loops
    if (loopsRemoved.length > 0) {
      const uniqueIndices = [...new Set(loopsRemoved)].sort((a, b) => b - a);
      console.log(`\n🔧 REMOVING ${uniqueIndices.length} looping segments`);
      
      for (const index of uniqueIndices) {
        console.log(`   - Removing segment ${index}: "${processed[index].text.substring(0, 60)}..."`);
        processed.splice(index, 1);
      }
    } else {
      console.log(`\n✅ No loops detected`);
    }
  
    return processed;
  }
  
  // Test case 1: Simple looping segments
  console.log('\n' + '='.repeat(80));
  console.log('TEST CASE 1: Simple Looping Pattern');
  console.log('='.repeat(80));
  
  const loopingSegments: TranscriptionSegment[] = [
    { start: 0, end: 5, text: 'Hello world', confidence: 0.9 },
    { start: 5, end: 10, text: 'This is a test', confidence: 0.9 },
    { start: 10, end: 15, text: 'Hello world', confidence: 0.9 },  // Loop
    { start: 15, end: 20, text: 'This is a test', confidence: 0.9 },  // Loop
    { start: 20, end: 25, text: 'Hello world', confidence: 0.9 },  // Loop
    { start: 25, end: 30, text: 'This is a test', confidence: 0.9 },  // Loop
    { start: 30, end: 35, text: 'Something new', confidence: 0.9 },
  ];
  
  const result1 = deduplicateAndDetectLoops(loopingSegments);
  console.log(`\n📊 RESULT: ${loopingSegments.length} → ${result1.length} segments`);
  console.log('\nRemaining segments:');
  result1.forEach((seg, i) => {
    console.log(`   ${i}: "${seg.text}"`);
  });
  
  // Test case 2: No loops (should pass through unchanged)
  console.log('\n' + '='.repeat(80));
  console.log('TEST CASE 2: No Looping (Clean Transcript)');
  console.log('='.repeat(80));
  
  const cleanSegments: TranscriptionSegment[] = [
    { start: 0, end: 5, text: 'Hello world', confidence: 0.9 },
    { start: 5, end: 10, text: 'This is a test', confidence: 0.9 },
    { start: 10, end: 15, text: 'Something different', confidence: 0.9 },
    { start: 15, end: 20, text: 'Another phrase', confidence: 0.9 },
    { start: 20, end: 25, text: 'Final words', confidence: 0.9 },
  ];
  
  const result2 = deduplicateAndDetectLoops(cleanSegments);
  console.log(`\n📊 RESULT: ${cleanSegments.length} → ${result2.length} segments (should be same)`);
  
  // Test case 3: Realistic looping pattern from Whisper
  console.log('\n' + '='.repeat(80));
  console.log('TEST CASE 3: Realistic Whisper Looping Pattern');
  console.log('='.repeat(80));
  
  const realisticLoops: TranscriptionSegment[] = [
    { start: 0, end: 5, text: 'Welcome to the presentation', confidence: 0.9 },
    { start: 5, end: 10, text: 'Today we will discuss AI technology', confidence: 0.9 },
    { start: 10, end: 15, text: 'Today we will discuss AI technology', confidence: 0.9 },  // Loop start
    { start: 15, end: 20, text: 'and its applications in modern society', confidence: 0.9 },
    { start: 20, end: 25, text: 'Today we will discuss AI technology', confidence: 0.9 },  // Loop continues
    { start: 25, end: 30, text: 'and its applications in modern society', confidence: 0.9 },  // Loop continues
    { start: 30, end: 35, text: 'Let me show you some examples', confidence: 0.9 },
    { start: 35, end: 40, text: 'First example is machine learning', confidence: 0.9 },
  ];
  
  const result3 = deduplicateAndDetectLoops(realisticLoops);
  console.log(`\n📊 RESULT: ${realisticLoops.length} → ${result3.length} segments`);
  console.log('\nRemaining segments:');
  result3.forEach((seg, i) => {
    console.log(`   ${i}: "${seg.text}"`);
  });
  
  // Test case 4: Provide your actual looping segments here
  console.log('\n' + '='.repeat(80));
  console.log('TEST CASE 4: Your Actual Looping Segments (ADD YOUR DATA HERE)');
  console.log('='.repeat(80));
  console.log('\nTo test with your actual data:');
  console.log('1. Find the diagnostic JSON file in temp/ directory');
  console.log('2. Copy the looping segments from the database');
  console.log('3. Add them to actualLoopingSegments array below');
  console.log('4. Run: npx tsx src/test/loop-detection-test.ts');
  
  const actualLoopingSegments: TranscriptionSegment[] = [
    // TODO: Add your actual looping segments here
    // Example format:
    // { start: 120, end: 125, text: 'your looping text here', confidence: 0.9 },
    // { start: 125, end: 130, text: 'your looping text here', confidence: 0.9 },
  ];
  
  if (actualLoopingSegments.length > 0) {
    const result4 = deduplicateAndDetectLoops(actualLoopingSegments);
    console.log(`\n📊 RESULT: ${actualLoopingSegments.length} → ${result4.length} segments`);
    console.log('\nRemaining segments:');
    result4.forEach((seg, i) => {
      console.log(`   ${i}: [${seg.start}-${seg.end}] "${seg.text}"`);
    });
  } else {
    console.log('\n⚠️  No segments provided. Add your looping segments to test with real data.');
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Loop Detection Tests Complete');
  console.log('='.repeat(80) + '\n');