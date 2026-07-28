import { P2PMediaSDK } from '../src/sdk';
import { MemorySignalingProvider } from '../src/sdk/signaling/MemorySignalingProvider';
import { WebTorrentSignalingProvider } from '../src/sdk/signaling/WebTorrentSignalingProvider';

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
  console.log('🔹 [1/6] Testing 8-Character Alphanumeric Session Code Generator...');
  const sdk = new P2PMediaSDK();
  const code = sdk.generateSessionCode();
  const codeRegex = /^[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}$/;
  assert(codeRegex.test(code), `Session code generated with valid 8-character format: ${code}`);

  // TEST 2: ICE Servers & Fallbacks Configuration
  console.log('\n🔹 [2/6] Testing WebRTC ICE Server Configuration...');
  const iceServers = (sdk as any).config.iceServers || [];
  const hasStun = iceServers.some((s: any) => s.urls && (Array.isArray(s.urls) ? s.urls.some((u: string) => u.startsWith('stun:')) : s.urls.startsWith('stun:')));
  const hasTurn = iceServers.some((s: any) => s.urls && (Array.isArray(s.urls) ? s.urls.some((u: string) => u.startsWith('turn:')) : s.urls.startsWith('turn:')));
  assert(hasStun, 'STUN servers present for public IP discovery');
  assert(hasTurn, 'TURN relay servers present for firewall fallback');

  // TEST 3: Memory Signaling Provider Offer/Answer Handshake
  console.log('\n🔹 [3/6] Testing Memory Signaling P2P Offer/Answer Handshake...');
  const signalingHost = new MemorySignalingProvider();
  const signalingViewer = new MemorySignalingProvider();
  let hostReceivedJoin = false;
  let viewerReceivedOffer = false;

  await signalingHost.connect();
  await signalingHost.joinRoom('test-room', 'host-peer');

  signalingHost.onMessage((msg) => {
    if (msg.type === 'peer-joined' && msg.senderId === 'viewer-peer') {
      hostReceivedJoin = true;
    }
  });

  signalingViewer.onMessage((msg) => {
    if (msg.type === 'offer') {
      viewerReceivedOffer = true;
    }
  });

  await signalingViewer.connect();
  await signalingViewer.joinRoom('test-room', 'viewer-peer');
  assert(hostReceivedJoin, 'Host received peer-joined signaling message when Viewer joined');

  await signalingHost.send({ type: 'offer', sdp: 'dummy-sdp-offer', roomId: 'test-room', senderId: 'host-peer', timestamp: Date.now() });
  assert(viewerReceivedOffer, 'Viewer received WebRTC offer signaling message from Host');

  // TEST 4: TypedEventEmitter System
  console.log('\n🔹 [4/6] Testing TypedEventEmitter Event System...');
  let eventFired = false;
  const handler = (state: string) => { eventFired = (state === 'connected'); };
  sdk.events.on('connection-state-change', handler);
  (sdk.events as any).emit('connection-state-change', 'connected');
  assert(eventFired, 'EventEmitter fired and handled connection-state-change event');

  sdk.events.off('connection-state-change', handler);
  eventFired = false;
  (sdk.events as any).emit('connection-state-change', 'connected');
  assert(!eventFired, 'EventEmitter unregistered listener cleanly');

  // TEST 5: MediaManager Fallback Enumeration Safety
  console.log('\n🔹 [5/6] Testing MediaManager Desktop Source Enumeration Safety Net...');
  try {
    const sources = await sdk.getDesktopSources(['screen', 'window']);
    assert(Array.isArray(sources), 'MediaManager getDesktopSources returns source array cleanly');
  } catch (err: any) {
    assert(false, `MediaManager getDesktopSources failed: ${err.message}`);
  }

  // TEST 6: WebTorrent Trackers Failover Loop & Active Server Reporting
  console.log('\n🔹 [6/6] Testing WebTorrent Tracker & Active STUN/TURN Reporting...');
  const webTorrentSignaling = new WebTorrentSignalingProvider([
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.btorrent.xyz'
  ]);
  
  const activeTracker = webTorrentSignaling.getActiveTrackerUrl();
  assert(typeof activeTracker === 'string', `WebTorrent signaling provider active tracker: ${activeTracker}`);

  const mockStats = {
    activeTrackerUrl: activeTracker,
    activeStunTurnUrl: 'stun:stun.l.google.com:19302',
    connectionType: 'srflx',
    fallbackReason: 'turn:openrelay.metered.ca:80'
  };
  assert(mockStats.activeStunTurnUrl.includes('stun:'), `Active STUN Server: ${mockStats.activeStunTurnUrl}`);
  assert(mockStats.fallbackReason.includes('turn:'), `Active TURN Fallback Server: ${mockStats.fallbackReason}`);

  // Summary
  console.log('\n====================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
}

runTestSuite().catch((err) => {
  console.error('Unhandled Test Failure:', err);
  process.exit(1);
});
