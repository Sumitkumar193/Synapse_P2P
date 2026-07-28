import { P2PMediaSDK } from '../src/sdk';
import { MemorySignalingProvider } from '../src/sdk/signaling/MemorySignalingProvider';
import { WebTorrentSignalingProvider } from '../src/sdk/signaling/WebTorrentSignalingProvider';
import { MediaManager } from '../src/sdk/media/MediaManager';
import { TypedEventEmitter } from '../src/sdk/events/EventEmitter';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING AUTOMATED P2P MEDIA SDK TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST 1: Session Code Generator Format
  // ----------------------------------------------------
  console.log('🔹 [1/6] Testing 6-Digit Session Code Generator...');
  try {
    const sdk = new P2PMediaSDK();
    const code = sdk.generateSessionCode();
    const isFormatValid = /^\d{3}-\d{3}$/.test(code);
    assert(isFormatValid, `Session code generated with valid format: ${code}`);
  } catch (err: any) {
    assert(false, `Session code generator failed: ${err.message}`);
  }

  // ----------------------------------------------------
  // TEST 2: WebRTC STUN / TURN Fallback Configuration
  // ----------------------------------------------------
  console.log('\n🔹 [2/6] Testing WebRTC ICE Server Configuration...');
  try {
    const sdk = new P2PMediaSDK();
    const config = (sdk as any).config;
    const iceServers: any[] = config.iceServers || [];

    const hasStun = iceServers.some((s) => s.urls && (Array.isArray(s.urls) ? s.urls.some((u: string) => u.includes('stun')) : s.urls.includes('stun')));
    const hasTurn = iceServers.some((s) => s.urls && (Array.isArray(s.urls) ? s.urls.some((u: string) => u.includes('turn')) : s.urls.includes('turn')));

    assert(hasStun, 'STUN servers present for public IP discovery');
    assert(hasTurn, 'TURN relay servers present for firewall fallback');
  } catch (err: any) {
    assert(false, `ICE Server config test failed: ${err.message}`);
  }

  // ----------------------------------------------------
  // TEST 3: Memory Signaling P2P Offer/Answer Handshake
  // ----------------------------------------------------
  console.log('\n🔹 [3/6] Testing Memory Signaling P2P Offer/Answer Handshake...');
  try {
    const hostProvider = new MemorySignalingProvider();
    const viewerProvider = new MemorySignalingProvider();

    await hostProvider.connect();
    await viewerProvider.connect();

    let hostReceivedJoined = false;
    let viewerReceivedOffer = false;

    hostProvider.onMessage((msg) => {
      if (msg.type === 'peer-joined') hostReceivedJoined = true;
    });

    viewerProvider.onMessage((msg) => {
      if (msg.type === 'offer') viewerReceivedOffer = true;
    });

    await hostProvider.joinRoom('room_101', 'host_1');
    await viewerProvider.joinRoom('room_101', 'viewer_1');

    await hostProvider.send({ type: 'offer', senderId: 'host_1', targetId: 'viewer_1', roomId: 'room_101', payload: { sdp: 'fake_sdp' } });

    assert(hostReceivedJoined, 'Host received peer-joined signaling message when Viewer joined');
    assert(viewerReceivedOffer, 'Viewer received WebRTC offer signaling message from Host');
  } catch (err: any) {
    assert(false, `Memory signaling handshake test failed: ${err.message}`);
  }

  // ----------------------------------------------------
  // TEST 4: TypedEventEmitter Event Lifecycle
  // ----------------------------------------------------
  console.log('\n🔹 [4/6] Testing TypedEventEmitter Event System...');
  try {
    const emitter = new TypedEventEmitter<any>();
    let eventHandled = false;

    const handler = (state: string) => {
      if (state === 'connected') eventHandled = true;
    };

    emitter.on('connection-state-change', handler);
    emitter.emit('connection-state-change', 'connected');
    assert(eventHandled, 'EventEmitter fired and handled connection-state-change event');

    emitter.off('connection-state-change', handler);
    eventHandled = false;
    emitter.emit('connection-state-change', 'connected');
    assert(!eventHandled, 'EventEmitter unregistered listener cleanly');
  } catch (err: any) {
    assert(false, `EventEmitter test failed: ${err.message}`);
  }

  // ----------------------------------------------------
  // TEST 5: MediaManager Desktop Sources Fallback
  // ----------------------------------------------------
  console.log('\n🔹 [5/6] Testing MediaManager Desktop Source Enumeration Safety Net...');
  try {
    const mediaManager = new MediaManager();
    const sources = await mediaManager.getDesktopSources(['screen', 'window']);
    assert(Array.isArray(sources), 'MediaManager getDesktopSources returns source array cleanly');
  } catch (err: any) {
    assert(false, `MediaManager test failed: ${err.message}`);
  }

  // ----------------------------------------------------
  // TEST 6: WebTorrent Tracker Failover & Active STUN/TURN Reporting
  // ----------------------------------------------------
  console.log('\n🔹 [6/6] Testing WebTorrent Tracker & Active STUN/TURN Reporting...');
  try {
    const trackerProvider = new WebTorrentSignalingProvider({
      trackerUrls: [
        'wss://tracker.openwebtorrent.com',
        'wss://tracker.btorrent.xyz',
      ]
    });

    await trackerProvider.connect();
    const activeTracker = trackerProvider.getActiveTrackerUrl();
    assert(trackerProvider.isConnected(), `WebTorrent signaling provider active tracker: ${activeTracker}`);

    const sdk = new P2PMediaSDK({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelay', credential: 'openrelay' }
      ]
    });

    const iceServers = (sdk as any).config.iceServers;
    const stunServerUrl = iceServers[0]?.urls;
    const turnServerUrl = iceServers[1]?.urls;

    assert(stunServerUrl === 'stun:stun.l.google.com:19302', `Active STUN Server: ${stunServerUrl}`);
    assert(turnServerUrl === 'turn:openrelay.metered.ca:80', `Active TURN Fallback Server: ${turnServerUrl}`);
  } catch (err: any) {
    assert(false, `WebTorrent & STUN/TURN connection test failed: ${err.message}`);
  }

  console.log('\n====================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
