import { ResumeRAGService } from '../src/agent/rag/ResumeRAGService';

export function runResumeRAGTests(): boolean {
  console.log('\n--- 🧪 Running Resume RAG Service Unit Tests ---');
  let passed = true;

  const fs = require('fs');
  const path = require('path');
  const resumePath = path.resolve(__dirname, '../assets/resume.md');
  const rag = ResumeRAGService.getInstance();
  if (rag.getChunkCount() === 0 && fs.existsSync(resumePath)) {
    rag.indexResume(fs.readFileSync(resumePath, 'utf8'));
  }

  console.log(`[Test] Indexed resume chunks count: ${rag.getChunkCount()}`);
  if (rag.getChunkCount() === 0) {
    console.error('❌ Test failed: No resume chunks indexed.');
    return false;
  }

  // Test 1: Open-ended intro query ("Tell me about yourself")
  console.log('\n[Test 1] Searching query: "Tell me about yourself"');
  const introResults = rag.search('Tell me about yourself', 3);
  console.log(`Retrieved ${introResults.length} chunks:`);
  introResults.forEach((r) => console.log(`  - [${r.matchType}] ${r.chunk.title} (${(r.score * 100).toFixed(0)}%)`));

  if (introResults.length === 0) {
    console.error('❌ Test 1 failed: No chunks returned for intro query.');
    passed = false;
  } else {
    console.log('✅ Test 1 passed!');
  }

  // Test 2: Specific metric query ("you mentioned 500k+ users how did you scale your applications")
  console.log('\n[Test 2] Searching query: "you mentioned 500k+ users how did you scale your applications"');
  const metricResults = rag.search('you mentioned 500k+ users how did you scale your applications', 3);
  console.log(`Retrieved ${metricResults.length} chunks:`);
  metricResults.forEach((r) => console.log(`  - [${r.matchType}] ${r.chunk.title} (${(r.score * 100).toFixed(0)}%)`));

  if (metricResults.length === 0 || !metricResults.some((r) => r.chunk.content.toLowerCase().includes('500,000') || r.chunk.content.toLowerCase().includes('500k'))) {
    console.error('❌ Test 2 failed: 500k+ users metric chunk not returned.');
    passed = false;
  } else {
    console.log('✅ Test 2 passed!');
  }

  // Test 3: Technical stack query ("What experience do you have with pgvector and vector embeddings?")
  console.log('\n[Test 3] Searching query: "What experience do you have with pgvector and vector embeddings?"');
  const techResults = rag.search('What experience do you have with pgvector and vector embeddings?', 3);
  console.log(`Retrieved ${techResults.length} chunks:`);
  techResults.forEach((r) => console.log(`  - [${r.matchType}] ${r.chunk.title} (${(r.score * 100).toFixed(0)}%)`));

  if (techResults.length === 0 || !techResults.some((r) => r.chunk.content.toLowerCase().includes('pgvector') || r.chunk.content.toLowerCase().includes('carosa'))) {
    console.error('❌ Test 3 failed: pgvector chunk not returned.');
    passed = false;
  } else {
    console.log('✅ Test 3 passed!');
  }

  // Test 4: Key Projects Query ("What key projects have you worked on?")
  console.log('\n[Test 4] Searching query: "What key projects have you worked on?"');
  const projectResults = rag.search('What key projects have you worked on?', 3);
  console.log(`Retrieved ${projectResults.length} chunks:`);
  projectResults.forEach((r) => console.log(`  - [${r.matchType}] ${r.chunk.title} [${r.chunk.section}] (${(r.score * 100).toFixed(0)}%)`));

  if (projectResults.length === 0 || !projectResults.some((r) => r.chunk.section === 'projects')) {
    console.error('❌ Test 4 failed: Projects section chunks not returned.');
    passed = false;
  } else {
    console.log('✅ Test 4 passed!');
  }

  // Test 5: Work Experience Query ("Tell me about your work experience at Hono and Hestabit")
  console.log('\n[Test 5] Searching query: "Tell me about your work experience at Hono and Hestabit"');
  const expResults = rag.search('Tell me about your work experience at Hono and Hestabit', 3);
  console.log(`Retrieved ${expResults.length} chunks:`);
  expResults.forEach((r) => console.log(`  - [${r.matchType}] ${r.chunk.title} [${r.chunk.section}] (${(r.score * 100).toFixed(0)}%)`));

  if (expResults.length === 0 || !expResults.some((r) => r.chunk.section === 'experience')) {
    console.error('❌ Test 5 failed: Experience section chunks not returned.');
    passed = false;
  } else {
    console.log('✅ Test 5 passed!');
  }

  return passed;
}

if (require.main === module) {
  const success = runResumeRAGTests();
  process.exit(success ? 0 : 1);
}
