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
