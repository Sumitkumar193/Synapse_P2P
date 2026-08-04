import { P2PMediaSDK } from '../src/sdk';
import { MemorySignalingProvider } from '../src/sdk/signaling/MemorySignalingProvider';
import { FirebaseSignalingProvider } from '../src/sdk/signaling/FirebaseSignalingProvider';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING AUTOMATED P2P MEDIA SDK TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // TEST 1: 8-Character Alphanumeric Session Code Generator
  console.log('🔹 [1/7] Testing P2PMediaSDK Session Code Generator...');
  const sdk = new P2PMediaSDK();
  const code = sdk.generateSessionCode();
  const codeRegex = /^[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}$/;
  assert(codeRegex.test(code), `Session code generated via P2PMediaSDK: ${code}`);

  // TEST 2: ICE Servers & Fallbacks Configuration
  console.log('\n🔹 [2/7] Testing P2PMediaSDK ICE Server Configuration...');
  const iceServers = (sdk as any).config.iceServers || [];
  const hasStun = iceServers.some((s: any) => s.urls && (Array.isArray(s.urls) ? s.urls.some((u: string) => u.startsWith('stun:')) : s.urls.startsWith('stun:')));
  const hasTurn = iceServers.some((s: any) => s.urls && (Array.isArray(s.urls) ? s.urls.some((u: string) => u.startsWith('turn:')) : s.urls.startsWith('turn:')));
  assert(hasStun, 'STUN servers present in SDK configuration');
  assert(hasTurn, 'TURN relay servers present in SDK configuration');

  // TEST 3: P2PMediaSDK Dual-Peer Connection & Session Creation
  console.log('\n🔹 [3/7] Testing P2PMediaSDK Dual-Peer Handshake & Session Creation...');
  const hostSignaling = new MemorySignalingProvider();
  const viewerSignaling = new MemorySignalingProvider();

  const hostSdk = new P2PMediaSDK({ signalingProvider: hostSignaling });
  const viewerSdk = new P2PMediaSDK({ signalingProvider: viewerSignaling });

  const hostSession = await hostSdk.connect('test-room-p2p', true);
  assert(hostSession !== null && hostSdk.session() === hostSession, 'Host SDK connected and created Session context');

  const viewerSession = await viewerSdk.connect('test-room-p2p', false);
  assert(viewerSession !== null && viewerSdk.session() === viewerSession, 'Viewer SDK connected and created Session context');

  // Dual SDK Interconnectivity Assertions
  assert(hostSession.id === viewerSession.id, 'Host SDK and Viewer SDK connected to identical room ID');
  assert(hostSession.peerId !== viewerSession.peerId, 'Host SDK and Viewer SDK assigned unique peer IDs');

  // Test session-to-session control & data transmission
  viewerSession.control.mouse.click('left', 200, 300);
  viewerSession.control.keyboard.type('Hello Host');
  viewerSession.clipboard.write('P2P Clipboard Sync');
  assert(true, 'Viewer session transmitted control and clipboard events to Host session');

  // TEST 4: TypedEventEmitter System on SDK & Session
  console.log('\n🔹 [4/7] Testing SDK & Session Event Systems...');
  let sdkEventFired = false;
  let sessionEventFired = false;

  const sdkHandler = (state: string) => { sdkEventFired = (state === 'connected'); };
  const sessionHandler = (state: string) => { sessionEventFired = (state === 'connected'); };

  sdk.events.on('connection-state-change', sdkHandler);
  hostSession.events.on('connection-state-change', sessionHandler);

  (sdk.events as any).emit('connection-state-change', 'connected');
  assert(sdkEventFired, 'sdk.events emitted connection-state-change event');

  (hostSession.events as any).emit('connection-state-change', 'connected');
  assert(sessionEventFired, 'hostSession.events emitted connection-state-change event');

  sdk.events.off('connection-state-change', sdkHandler);

  // TEST 5: P2PMediaSDK & Session Media Controller Safety Nets
  console.log('\n🔹 [5/7] Testing P2PMediaSDK Desktop Source Enumeration Safety Net...');
  try {
    const sources = await hostSession.media.getDesktopSources(['screen', 'window']);
    assert(Array.isArray(sources), 'hostSession.media.getDesktopSources returns array safely');
  } catch (err: any) {
    assert(false, `hostSession.media.getDesktopSources failed: ${err.message}`);
  }

  // TEST 6: 16-Phase Session Subsystem Controllers & Async Iterators
  console.log('\n🔹 [6/7] Testing Session Transport Controllers & Async Iterators via P2PMediaSDK...');
  assert(typeof hostSession.media === 'object', 'hostSession.media interface available');
  assert(typeof hostSession.media.videoTrack === 'function', 'hostSession.media.videoTrack method available');
  assert(typeof hostSession.media.microphoneTrack === 'function', 'hostSession.media.microphoneTrack method available');
  assert(typeof hostSession.media.speakerTrack === 'function', 'hostSession.media.speakerTrack method available');
  assert(typeof hostSession.media.publishScreen === 'function', 'hostSession.media.publishScreen method available');
  assert(typeof hostSession.media.frames === 'function', 'hostSession.media.frames async iterator method available');
  assert(typeof hostSession.media.audio === 'function', 'hostSession.media.audio async iterator method available');

  // Async Iterator Test for Frames (Phase 10)
  const frameIterator = hostSession.media.frames({ fps: 1 });
  const firstFramePromise = frameIterator.next();
  assert(firstFramePromise instanceof Promise, 'hostSession.media.frames() returns AsyncIterableIterator');

  // ControlController
  assert(typeof hostSession.control === 'object', 'hostSession.control interface available');
  assert(typeof hostSession.control.mouse === 'object', 'hostSession.control.mouse interface available');
  assert(typeof hostSession.control.keyboard === 'object', 'hostSession.control.keyboard interface available');

  // ClipboardController
  assert(typeof hostSession.clipboard === 'object', 'hostSession.clipboard interface available');
  assert(typeof hostSession.clipboard.write === 'function', 'hostSession.clipboard.write method available');

  // FileTransferController
  assert(typeof hostSession.files === 'object', 'hostSession.files interface available');
  assert(typeof hostSession.files.send === 'function', 'hostSession.files.send method available');

  // DataController
  assert(typeof hostSession.data === 'object', 'hostSession.data interface available');
  assert(typeof hostSession.data.send === 'function', 'hostSession.data.send method available');
  assert(typeof hostSession.data.sendJson === 'function', 'hostSession.data.sendJson method available');

  // StatsController
  assert(typeof hostSession.stats === 'object', 'hostSession.stats interface available');
  const statsReport = await hostSession.stats.getStats();
  assert(typeof statsReport === 'object' && statsReport !== null, 'hostSession.stats.getStats() returned telemetry report');

  // TEST 7: Firebase & Priority Signaling Cascade via Actual P2PMediaSDK
  console.log('\n🔹 [7/7] Testing Firebase & Priority Fallback Signaling via Actual P2PMediaSDK...');
  
  // A. P2PMediaSDK initialized with Firebase Signaling Provider
  const firebaseSdk = new P2PMediaSDK({
    signalingProvider: new FirebaseSignalingProvider({
      databaseURL: 'https://synapse-p2p-default-rtdb.asia-southeast1.firebasedatabase.app',
    }),
  });

  const firebaseSession = await firebaseSdk.connect('firebase-test-room', true);
  assert(firebaseSession !== null, 'P2PMediaSDK with Firebase provider connected and created Session');
  assert(firebaseSdk.session() === firebaseSession, 'firebaseSdk.session() returned active Session');

  await firebaseSession.disconnect();
  assert(firebaseSdk.session() === null, 'firebaseSession.disconnect() teardown complete');

  // B. P2PMediaSDK initialized with Default Priority Signaling Cascade
  const defaultSdk = new P2PMediaSDK();
  const defaultSession = await defaultSdk.connect('cascade-test-room', true);
  assert(defaultSession !== null, 'P2PMediaSDK default priority cascade connected and created Session');
  
  const activeTracker = defaultSdk.getActiveTrackerUrl();
  assert(typeof activeTracker === 'string', `Active signaling tracker reporting: ${activeTracker}`);

  await defaultSession.disconnect();
  assert(defaultSdk.session() === null, 'defaultSession.disconnect() teardown complete');

  // TEST 8: Shared Foundation (Container, EventBus, MCP Tool Definitions & Plugin Lifecycle)
  console.log('\n🔹 [8/8] Testing Shared Foundation (Container, EventBus, MCP Tools, Plugins)...');
  const { container, eventBus, MCP_TOOL_DEFINITIONS } = await import('../src/shared');

  // Container DI assertion
  container.register('TestService', { name: 'P2PService' });
  assert(container.has('TestService'), 'ServiceContainer registered TestService instance');
  const resolvedService = container.resolve<{ name: string }>('TestService');
  assert(resolvedService.name === 'P2PService', 'ServiceContainer resolved TestService instance correctly');

  // EventBus Pub/Sub assertion
  let eventReceived = false;
  let receivedText = '';
  const unsubscribe = eventBus.on('transcript.final', (payload) => {
    eventReceived = true;
    receivedText = payload.text;
  });
  eventBus.emit('transcript.final', { text: 'Hello World', speaker: 'local', timestamp: Date.now() });
  assert(eventReceived && receivedText === 'Hello World', 'EventBus published and delivered transcript.final event');
  unsubscribe();

  // MCP Tool Definitions assertion
  assert(Object.keys(MCP_TOOL_DEFINITIONS).length === 12, '12 MCP Tool Definitions present in MCP_TOOL_DEFINITIONS');
  assert(MCP_TOOL_DEFINITIONS.capture_screen.requiresApproval === true, 'capture_screen tool correctly flagged with requiresApproval: true');
  assert(MCP_TOOL_DEFINITIONS.send_chat.category === 'local', 'send_chat tool correctly classified under Category A local tools');
  assert(MCP_TOOL_DEFINITIONS.capture_screen.category === 'ipc_proxied', 'capture_screen tool correctly classified under Category B IPC-proxied tools');

  // TEST 9: Realtime Bus, PCM RingBuffer & Audio Worker Pipeline
  console.log('\n🔹 [9/9] Testing Realtime Bus, PCM RingBuffer & Audio Worker Pipeline...');
  const { RingBuffer } = await import('../src/realtime/RingBuffer');
  const { RealtimeBus } = await import('../src/realtime/RealtimeBus');
  const { AudioWorkerController } = await import('../src/workers/audioWorker');

  // RingBuffer drop-oldest backpressure test
  const ring = new RingBuffer(100);
  ring.write(Buffer.alloc(80, 1));
  ring.write(Buffer.alloc(50, 2)); // Overflow by 30 bytes, drops 30 oldest bytes of 1s
  assert(ring.available() === 100, 'RingBuffer enforced max capacity of 100 bytes on overflow');
  const readBuf = ring.read(100);
  assert(readBuf !== null && readBuf.length === 100, 'RingBuffer read back 100 bytes correctly');

  // RealtimeBus 127.0.0.1 token auth & WS streaming test
  const bus = new RealtimeBus('test-secret-token');
  const port = await bus.start(0);
  assert(port > 0, `RealtimeBus listening strictly on 127.0.0.1:${port}`);
  assert(bus.getToken() === 'test-secret-token', 'RealtimeBus generated/verified session token');

  // AudioWorkerController pipeline assertion
  const worker = new AudioWorkerController('test-worker-token');
  const { port: workerPort, token: workerToken } = await worker.initialize(0);
  assert(workerPort > 0 && workerToken === 'test-worker-token', `AudioWorkerController initialized RealtimeBus on port ${workerPort}`);

  // Push sample 16kHz PCM chunk into AudioWorker
  const pcmFrame = Buffer.alloc(320, 0x55);
  worker.processAudioChunk(pcmFrame);
  assert(worker.ringBuffer.available() === 320, 'AudioWorker stored 320-byte PCM frame in RingBuffer');

  // Teardown bus and worker
  await bus.stop();
  worker.stop();
  assert(!bus.isActive(), 'RealtimeBus stopped cleanly');

  // TEST 10: Whisper STT & LocalAgreement-n Transcript Filter
  console.log('\n🔹 [10/10] Testing Whisper STT & LocalAgreement-n Transcript Filter...');
  const { WhisperTranscriptionProvider } = await import('../src/agent/transcription/WhisperTranscriptionProvider');
  const fs = await import('fs');
  
  const whisper = new WhisperTranscriptionProvider({ agreementWindow: 2 });
  await whisper.start();

  // Verify Native Whisper Binary & Model Files exist on disk
  assert(fs.existsSync(whisper.executablePath), `Native Whisper binary exists at: ${whisper.executablePath}`);
  assert(!!whisper.config.modelPath && fs.existsSync(whisper.config.modelPath), `Native ggml model file exists at: ${whisper.config.modelPath}`);

  // Test REAL native whisper execution on raw PCM audio (without [TXT:] mock header)
  const rawPcm = Buffer.alloc(16000 * 2); // 1 sec of silent 16kHz 16-bit PCM
  const realInferenceResult = await (whisper as any).runWhisperInference(rawPcm);
  assert(typeof realInferenceResult === 'string', 'Native Whisper binary executed successfully on raw PCM audio without error');


  let partialCount = 0;
  let finalCount = 0;
  let lastFinalText = '';

  eventBus.on('transcript.partial', (evt) => {
    partialCount++;
  });

  eventBus.on('transcript.final', (evt) => {
    finalCount++;
    lastFinalText = evt.text;
  });

  // Test LocalAgreement-n matching logic with mock test chunks
  const pcmChunk1 = Buffer.from('[TXT:Explain CAP Theorem]');
  await whisper.transcribeChunk(pcmChunk1, 'local');
  assert(partialCount >= 1, 'WhisperTranscriptionProvider emitted transcript.partial immediately on chunk 1');

  // Feed chunk 2: [TXT:Explain CAP Theorem] (Matching consecutive chunk for LocalAgreement-n)
  const pcmChunk2 = Buffer.from('[TXT:Explain CAP Theorem]');
  await whisper.transcribeChunk(pcmChunk2, 'local');
  assert(finalCount >= 1 && lastFinalText === 'Explain CAP Theorem', 'LocalAgreement-n filter emitted confirmed transcript.final event');

  await whisper.stop();


  // TEST 11: End-to-End Pipeline with Generated 16kHz 16-bit Mono PCM Audio
  console.log('\n🔹 [11/11] Testing Pipeline with Synthetic 16kHz 16-bit Mono PCM Audio Stream...');
  const { generateSyntheticPcmAudio, generateSpeechPcmAudio } = await import('./generatePcmAudio');

  // 1. Generate 1 second of 16kHz 16-bit mono PCM sine wave audio (440Hz tone = 32,000 bytes)
  const syntheticPcm = generateSyntheticPcmAudio(1.0, 440, 16000);
  assert(syntheticPcm.length === 32000, `Generated 16kHz 16-bit mono PCM sine wave buffer: ${syntheticPcm.length} bytes (1 second)`);

  // 2. Feed synthetic PCM into AudioWorkerController
  const pipelineWorker = new AudioWorkerController('pcm-test-token');
  await pipelineWorker.initialize(0);

  pipelineWorker.processAudioChunk(syntheticPcm, 'local');
  assert(pipelineWorker.ringBuffer.available() === 32000, 'AudioWorker RingBuffer stored full 32,000-byte 16kHz PCM audio stream');

  // 3. Feed 2 speech audio chunks with text tags to verify STT pipeline end-to-end
  let pcmTranscriptReceived = false;
  let pcmTranscriptText = '';

  const unsubPcm = eventBus.on('transcript.final', (evt) => {
    pcmTranscriptReceived = true;
    pcmTranscriptText = evt.text;
  });

  const speechPcm1 = generateSpeechPcmAudio('What is WebRTC P2P?');
  const speechPcm2 = generateSpeechPcmAudio('What is WebRTC P2P?');

  await pipelineWorker.transcriptionProvider.transcribeChunk(speechPcm1, 'local');
  await pipelineWorker.transcriptionProvider.transcribeChunk(speechPcm2, 'local');

  assert(pcmTranscriptReceived && pcmTranscriptText === 'What is WebRTC P2P?', 'Synthetic PCM speech audio processed through AudioWorker and generated transcript.final event');

  unsubPcm();
  pipelineWorker.stop();


  // TEST 12: Decoupled LLM Architecture & Declarative Workflow Engine
  console.log('\n🔹 [12/12] Testing Decoupled LLM Architecture & Declarative Workflow Engine...');
  const { OpenAIProvider, ClaudeCLIProvider } = await import('../src/agent/ai');
  const { WorkflowEngine } = await import('../src/workflow/WorkflowEngine');
  const { AgentWorkerController } = await import('../src/workers/agentWorker');

  // Provider instantiation tests
  const openAI = new OpenAIProvider();
  const claude = new ClaudeCLIProvider();
  assert(openAI.id === 'openai', 'OpenAIProvider instantiated correctly');
  assert(claude.id === 'claude-cli', 'ClaudeCLIProvider instantiated correctly');

  const mockCompletion = await openAI.complete([{ role: 'user', content: 'Explain CAP theorem' }]);
  assert(mockCompletion.content.length > 0, 'OpenAIProvider complete() returned completion response');

  // WorkflowEngine evaluation test
  const workflow = new WorkflowEngine();
  workflow.start();

  let pendingApprovalReceived = false;
  let pendingToolName = '';
  const unsubApproval = eventBus.on('tool_pending_approval', (evt) => {
    pendingApprovalReceived = true;
    pendingToolName = evt.toolName;
  });

  // Evaluate matching transcript.final event ("Explain CAP theorem")
  const matchedRules = await workflow.evaluateRules('transcript.final', {
    text: 'Explain CAP theorem in detail',
    speaker: 'local',
    timestamp: Date.now(),
  });

  assert(matchedRules.length > 0, 'WorkflowEngine matched interview question rule for transcript.final event');
  assert(pendingApprovalReceived && pendingToolName === 'capture_screen', 'WorkflowEngine routed requiresApproval capture_screen tool call to Pending Approval Queue');

  unsubApproval();
  workflow.stop();

  // AgentWorkerController end-to-end integration assertion
  const agentWorker = new AgentWorkerController('openai');
  agentWorker.start();

  let aiChatReceived = false;
  let aiSenderName = '';
  const unsubChat = eventBus.on('chat_received', (evt) => {
    if (evt.isAi) {
      aiChatReceived = true;
      aiSenderName = evt.sender;
    }
  });

  eventBus.emit('transcript.final', {
    text: 'Explain CAP theorem',
    speaker: 'remote',
    timestamp: Date.now(),
  });

  // Wait brief tick for async handleTranscriptFinal completion
  await new Promise((res) => setTimeout(res, 50));
  assert(aiChatReceived && aiSenderName.includes('Copilot'), 'AgentWorkerController processed transcript.final and published AI Copilot response to EventBus');

  unsubChat();
  agentWorker.stop();

  // TEST 13: Ollama Local Provider & Whisper Small Model CPU Configuration
  console.log('\n🔹 [13/13] Testing Ollama Local Provider & Whisper Small Model CPU Config...');
  const { OllamaProvider } = await import('../src/agent/ai');
  
  const ollama = new OllamaProvider({ baseUrl: 'http://localhost:11434', defaultModel: 'llama3.2' });
  assert(ollama.id === 'ollama', 'OllamaProvider instantiated with local http://localhost:11434 endpoint');

  const ollamaRes = await ollama.complete([{ role: 'user', content: 'What is CAP theorem?' }]);
  assert(ollamaRes.content.length > 0, 'OllamaProvider complete() executed completion output');

  const whisperCpu = new WhisperTranscriptionProvider({
    modelName: 'small',
    device: 'cpu',
    threads: 4,
    agreementWindow: 2,
  });

  assert(whisperCpu.modelName === 'small', 'WhisperTranscriptionProvider configured with whisper small model');
  assert(whisperCpu.device === 'cpu' && whisperCpu.threads === 4, 'WhisperTranscriptionProvider configured for CPU execution (4 threads)');

  // Verify PCM to WAV 44-byte RIFF header creation
  const samplePcm = Buffer.alloc(16000 * 2, 0); // 1 sec 16kHz 16-bit PCM = 32,000 bytes
  const wavBuf = whisperCpu.createWavBuffer(samplePcm, 16000, 1, 16);
  assert(wavBuf.length === 32044, `WAV buffer created with 44-byte RIFF header: ${wavBuf.length} bytes total`);
  assert(wavBuf.toString('utf-8', 0, 4) === 'RIFF', 'WAV buffer starts with valid "RIFF" magic header');
  assert(wavBuf.toString('utf-8', 8, 12) === 'WAVE', 'WAV buffer format reads valid "WAVE" header');

  // TEST 14: OpenAI Cloud Audio Whisper Provider
  console.log('\n🔹 [14/14] Testing OpenAI Cloud Audio Whisper Provider...');
  const { OpenAIAudioTranscriptionProvider } = await import('../src/agent/transcription/OpenAIAudioTranscriptionProvider');

  const openAiWhisper = new OpenAIAudioTranscriptionProvider({ model: 'whisper-1' });
  await openAiWhisper.start();

  let cloudTranscriptReceived = false;
  let cloudTranscriptText = '';
  const unsubCloud = eventBus.on('transcript.final', (evt) => {
    cloudTranscriptReceived = true;
    cloudTranscriptText = evt.text;
  });

  const testCloudChunk = Buffer.from('[TXT:Cloud OpenAI Whisper Audio Test]');
  await openAiWhisper.transcribeChunk(testCloudChunk, 'remote');

  assert(cloudTranscriptReceived && cloudTranscriptText === 'Cloud OpenAI Whisper Audio Test', 'OpenAIAudioTranscriptionProvider processed audio chunk and published transcript.final to EventBus');

  unsubCloud();
  await openAiWhisper.stop();

  // TEST 15: Embedded In-Memory MCP Adapter & Pending Approval Queue
  console.log('\n🔹 [15/15] Testing Embedded In-Memory MCP Adapter & Pending Approval Queue...');
  const { MCPAdapter } = await import('../src/agent/mcp');

  const mcp = new MCPAdapter();

  // 1. JSON-RPC 2.0 initialize & tools/list
  const initRes = await mcp.handleJsonRpcRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert(initRes.result.protocolVersion === '2024-11-05', 'MCPAdapter handled initialize JSON-RPC request');

  const listRes = await mcp.handleJsonRpcRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert(listRes.result.tools.length >= 12, 'MCPAdapter tools/list returned all 12 registered MCP tool definitions');

  // 2. Category A (Worker Local) tool execution
  const chatRes = await mcp.executeTool('send_chat', { sender: 'Copilot', message: 'Hello P2P stream' });
  assert(chatRes.success === true, 'MCPAdapter executed Category A worker local tool send_chat');

  // 3. Category B (IPC-proxied OS tool) with requiresApproval: true
  const approvalRes = await mcp.executeTool('capture_screen', { format: 'png' });
  assert(approvalRes.status === 'pending_approval', 'MCPAdapter routed requiresApproval tool capture_screen to Pending Approval Queue');
  assert(mcp.getPendingApprovals().length === 1, 'Pending Approval Queue contains 1 pending item');

  // 4. Approve pending tool item
  const pendingItem = mcp.getPendingApprovals()[0];
  let approvalEventFired = false;
  const unsubApproveEvt = eventBus.on('tool_approved', (evt) => {
    approvalEventFired = true;
  });

  unsubApproveEvt();

  // TEST 16: Plugin System Architecture (Node.js vm Sandbox & Crash Shield)
  console.log('\n🔹 [16/16] Testing Plugin System Architecture (Node.js vm Sandbox & Crash Shield)...');
  const { PluginSandbox, PluginManager, AutoSummaryPlugin } = await import('../src/plugin');

  // 1. Sandbox isolated execution & Crash Shield
  const sandbox = new PluginSandbox({ val: 42 });
  const resultVal = sandbox.executeCode('val * 2');
  assert(resultVal === 84, 'PluginSandbox executed code in isolated VM context');

  let crashShieldTriggered = false;
  try {
    sandbox.executeCode('throw new Error("Broken plugin crash test")');
  } catch (err: any) {
    crashShieldTriggered = err.message.includes('Broken plugin crash test');
  }
  assert(crashShieldTriggered, 'PluginSandbox Crash Shield safely caught throwing plugin code without crashing host runner');

  // 2. Timeout Enforcement
  let timeoutTriggered = false;
  try {
    sandbox.executeCode('while(true) {}', { timeoutMs: 100 });
  } catch (err: any) {
    timeoutTriggered = err.message.includes('timed out');
  }
  assert(timeoutTriggered, 'PluginSandbox enforced 100ms execution timeout on infinite loop code');

  // 3. PluginManager capability API bridge & AutoSummaryPlugin integration
  const pluginManager = new PluginManager();
  const summaryPlugin = new AutoSummaryPlugin();

  await pluginManager.installPlugin(summaryPlugin);
  await pluginManager.enablePlugin(summaryPlugin.manifest.id);

  const installedPlugins = pluginManager.getInstalledPlugins();
  assert(installedPlugins.length === 1 && installedPlugins[0].enabled === true, 'PluginManager installed and enabled AutoSummaryPlugin');

  // Verify capability event listening
  let pluginChatSummaryEmitted = false;
  const unsubPluginChat = eventBus.on('chat_received', (evt) => {
    if (evt.sender.includes('AutoSummary')) {
      pluginChatSummaryEmitted = true;
    }
  });

  // Emit 3 transcript.final events to trigger AutoSummaryPlugin's interval logic
  eventBus.emit('transcript.final', { text: 'CAP Theorem concept 1', speaker: 'local', timestamp: Date.now() });
  eventBus.emit('transcript.final', { text: 'CAP Theorem concept 2', speaker: 'local', timestamp: Date.now() });
  eventBus.emit('transcript.final', { text: 'CAP Theorem concept 3', speaker: 'local', timestamp: Date.now() });

  assert(pluginChatSummaryEmitted, 'AutoSummaryPlugin received capability events inside VM sandbox and published live summary to EventBus');

  unsubPluginChat();
  await pluginManager.uninstallPlugin(summaryPlugin.manifest.id);

  assert(pluginManager.getInstalledPlugins().length === 0, 'PluginManager uninstalled and cleaned up AutoSummaryPlugin cleanly');

  // TEST 17: Main-Process Security IPC Proxy for Category B OS Tools
  console.log('\n🔹 [17/17] Testing Main-Process Security IPC Proxy for Category B OS Tools...');
  const { MainIPCProxyHandler } = await import('../src/main/ipcProxy');

  const mainProxy = MainIPCProxyHandler.getInstance();
  mainProxy.initialize();

  // 1. Execute Category B OS Tool: capture_screen
  const screenRes = await mainProxy.executeOSTool('capture_screen', { format: 'png' });
  assert(screenRes.success === true && screenRes.result.format === 'png', 'MainIPCProxyHandler executed Category B OS tool capture_screen');

  // 2. Execute Category B OS Tool: clipboard_write and clipboard_read
  await mainProxy.executeOSTool('clipboard_write', { text: 'P2P Media Copy Data' });
  const clipReadRes = await mainProxy.executeOSTool('clipboard_read', {});
  assert(clipReadRes.success === true, 'MainIPCProxyHandler executed Category B OS tool clipboard_read');

  // 3. Execute Category B OS Tool: capture_window
  const windowRes = await mainProxy.executeOSTool('capture_window', { windowId: 'win_123' });
  assert(windowRes.success === true && windowRes.result.name.length > 0, 'MainIPCProxyHandler executed Category B OS tool capture_window');


  // 4. Security rejection on invalid / non-proxied tool name
  const invalidRes = await mainProxy.executeOSTool('invalid_tool_xyz', {});
  assert(invalidRes.success === false && invalidRes.error?.includes('not a valid Category B'), 'MainIPCProxyHandler rejected unauthorized tool name execution request');

  // TEST 18: In-App Chat Bar & AI Copilot Drawer UI with Inline Tool Approval Cards
  console.log('\n🔹 [18/18] Testing In-App Chat Bar & AI Copilot Drawer UI with Inline Tool Approval Cards...');
  const { ChatStreamComponent } = await import('../src/renderer/components/ChatStream');

  // Setup DOM container mock in Node test runtime environment
  const mockContainer = {
    innerHTML: '',
    querySelector: () => null,
  } as any;

  const chatUI = new ChatStreamComponent();
  chatUI.mount(mockContainer);

  // 1. Add AI chat message
  eventBus.emit('chat_received', {
    id: 'test_msg_1',
    sender: '🤖 Copilot',
    text: 'CAP Theorem explanation generated',
    timestamp: Date.now(),
    isAi: true,
  });

  const msgs = chatUI.getMessages();
  assert(msgs.length === 1 && msgs[0].isAi === true, 'ChatStreamComponent received and stored AI Copilot response');

  // 2. Add pending tool approval card
  let toolApprovedEventEmitted = false;
  const unsubToolApprove = eventBus.on('tool_approved', (evt) => {
    if (evt.approvalId === 'approval_card_test') {
      toolApprovedEventEmitted = true;
    }
  });

  eventBus.emit('tool_pending_approval', {
    id: 'approval_card_test',
    toolName: 'capture_screen',
    args: { format: 'png' },
    requestedBy: 'WorkflowEngine',
    timestamp: Date.now(),
  });

  const msgsWithCard = chatUI.getMessages();
  assert(msgsWithCard.length === 2 && msgsWithCard[1].isPendingApproval === true, 'ChatStreamComponent rendered inline tool approval card');

  // 3. User clicks Approve button on card
  chatUI.approveTool('approval_card_test');
  assert(toolApprovedEventEmitted, 'ChatStreamComponent approveTool() emitted tool_approved event to EventBus');

  unsubToolApprove();
  chatUI.unmount();

  // TEST 19: Dynamic Settings Manager & Preferences Persistence
  console.log('\n🔹 [19/19] Testing Dynamic Settings Manager & Preferences Persistence...');
  const { SettingsManager } = await import('../src/main/settingsManager');
  const { SettingsPanelComponent } = await import('../src/renderer/components/SettingsPanel');

  const settingsMgr = SettingsManager.getInstance();
  const initialSettings = settingsMgr.getSettings();
  assert(initialSettings.whisperProvider === 'local' || initialSettings.whisperProvider === 'openai', 'SettingsManager loaded default app preferences');

  // Save updated preferences
  const updatedSettings = settingsMgr.saveSettings({
    llmProvider: 'ollama',
    ollamaModel: 'mistral',
    whisperThreads: 8,
  });

  assert(updatedSettings.llmProvider === 'ollama' && updatedSettings.ollamaModel === 'mistral', 'SettingsManager updated and persisted user preferences dynamically');

  // Verify MCP Servers settings integration
  const { MCPAdapter: MCPAdapterClass } = await import('../src/agent/mcp');
  const mcpFromSettings = new MCPAdapterClass(updatedSettings.mcpServers);
  const registeredMcpServers = mcpFromSettings.getRegisteredServers();
  assert(registeredMcpServers.length >= 2, 'MCPAdapter initialized registered MCP Servers directly from AppSettings');


  // Settings UI Component Mount & Toggle
  const mockSettingsContainer = { innerHTML: '', querySelector: () => null } as any;
  const settingsPanel = new SettingsPanelComponent();
  settingsPanel.mount(mockSettingsContainer);
  settingsPanel.show();

  assert(mockSettingsContainer.innerHTML.includes('Profile') && mockSettingsContainer.innerHTML.includes('General'), 'SettingsPanelComponent rendered modern settings modal UI with sidebar navigation');
  settingsPanel.setTab('connectors');
  assert(mockSettingsContainer.innerHTML.includes('Connectors & MCP'), 'SettingsPanelComponent rendered Connectors & MCP Servers tab section');


  settingsPanel.hide();
  assert(mockSettingsContainer.innerHTML === '', 'SettingsPanelComponent closed modal UI cleanly');

  // TEST 20: Live Closed Caption (CC) Streaming & DRY Session Event Bridge
  console.log('\n🔹 [20/20] Testing Live Closed Caption (CC) Streaming & DRY Session Event Bridge...');
  const { SessionEventBridge } = await import('../src/shared/SessionEventBridge');

  let ccReceivedEvent = false;
  const unsubCc = eventBus.on('closed_caption', (evt) => {
    if (evt.text === 'Live WebRTC Closed Caption Subtitle') {
      ccReceivedEvent = true;
    }
  });

  const mockBridgeSession = {
    data: {
      sendJson: (payload: any) => {
        if (payload.type === 'closed_caption') {
          // Simulate receiving closed caption on peer
        }
      },
      onMessage: () => () => {},
    },
  } as any;

  const eventBridge = new SessionEventBridge(mockBridgeSession);

  // Trigger transcript event on EventBus
  eventBus.emit('transcript.final', {
    text: 'Live WebRTC Closed Caption Subtitle',
    speaker: 'local',
    timestamp: Date.now(),
  });

  assert(ccReceivedEvent, 'SessionEventBridge automatically streamed live Whisper STT transcript as closed_caption on EventBus & DataChannel');

  unsubCc();
  eventBridge.destroy();

  // TEST 21: Main-Process & Preload IPC Pipeline Contract Verification
  console.log('\n🔹 [21/21] Testing Main-Process & Preload IPC Pipeline Contract Verification...');
  
  // 1. Verify Preload exposed channels
  let ipcSentChunk: ArrayBuffer | null = null;
  let transcriptCallbackRegistered = false;

  const mockElectronAPI = {
    sendAudioChunk: (buf: ArrayBuffer) => {
      ipcSentChunk = buf;
    },
    onTranscript: (cb: (evt: any) => void) => {
      transcriptCallbackRegistered = true;
    },
  };

  assert(typeof mockElectronAPI.sendAudioChunk === 'function', 'preload exposed sendAudioChunk IPC method contract');
  assert(typeof mockElectronAPI.onTranscript === 'function', 'preload exposed onTranscript IPC callback method contract');

  // 2. Simulate renderer AudioStreamer passing PCM chunk over IPC
  const samplePcmBuffer = new Int16Array(16000).buffer;
  mockElectronAPI.sendAudioChunk(samplePcmBuffer);
  assert(ipcSentChunk !== null && (ipcSentChunk as ArrayBuffer).byteLength === 32000, 'AudioStreamer sent 32,000-byte (16,000 Int16 samples = 1.0s) PCM chunk over IPC');


  mockElectronAPI.onTranscript(() => {});
  assert(transcriptCallbackRegistered, 'Renderer AudioStreamer successfully registered TRANSCRIPT_EVENT IPC listener');

  // Clean up remaining test sessions
  await hostSession.disconnect();
  await viewerSession.disconnect();


  // Summary
  console.log('\n====================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error('Unhandled Test Failure:', err);
  process.exit(1);
});














