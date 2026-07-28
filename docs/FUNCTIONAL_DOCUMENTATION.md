# 📺 P2P Screen Share App & Media SDK — Functional Documentation

> **Product Vision**: A zero self-hosted infrastructure, zero-installer, end-to-end encrypted P2P screen sharing desktop application and TypeScript SDK built with React 18 and Zustand.

---

## 🏢 1. Enterprise Firewalls: TURN-over-TCP-443 & Degraded Network QA

- **TURN-over-TCP-443**: Restrictive corporate firewalls & enterprise VPNs block outgoing non-443 UDP/TCP traffic. Configuring TURN over `tcp` on port 443 allows TURN media relay traffic to pass through corporate proxies as HTTPS web traffic.
  ```typescript
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelay', credential: 'openrelay' }
  ```
- **Degraded Network QA (`iceTransportPolicy: 'relay'`)**:
  Setting `iceTransportPolicy: 'relay'` forces WebRTC to bypass direct Host and STUN candidates and evaluate TURN relay infrastructure directly, enabling DevOps/QA teams to test corporate VPN compatibility without physical test benches.

---

## 🔒 2. Session Code Security & Base36 Entropy

| Format | Sample Code | Character Set | Combinations | Brute-Force Risk |
| :--- | :--- | :--- | :--- | :--- |
| **Legacy 6-Digit** | `255-624` | `0-9` (10 chars) | $1,000,000$ (1 Million) | Moderate |
| **New 8-Character Base36** | `a7k9-x2p4` | `0-9, a-z` (36 chars) | **$36^8 = \mathbf{2,821,109,907,456}$ (2.82 Trillion)** | **0.00000000003%** (Impossible) |

---

## 🧊 3. ICE Candidate Queueing & Out-of-Order Recovery

To handle asynchronous WebRTC signaling over WebSocket trackers or IPC where network ICE candidates arrive before SDP Offer/Answer remote descriptions are settled:

1. **Queueing Phase**: Candidates arriving while `peerConnection.remoteDescription` is empty are held in `pendingIceCandidates: any[]`.
2. **Flush Phase**: Immediately after `setRemoteDescription()` resolves on Offer or Answer, `flushPendingIceCandidates()` processes all queued candidates sequentially.
3. **Intentional Peer Teardown Guard**: When `peer-left` signaling is received, `isPeerEnded = true` prevents automatic ICE restart timers from triggering false `Reconnecting P2P...` loops.

---

## ⚡ 4. React 18 + Zustand State Architecture

```text
 ┌─────────────────────────────────────────────────────────────────────────────────┐
 │                               FRONT-END UI (React 18)                           │
 │   ┌──────────────────────────┐                   ┌──────────────────────────┐   │
 │   │      TitleBar & Tabs     │                   │   Host / Viewer Cards    │   │
 │   └─────────────┬────────────┘                   └────────────▲─────────────┘   │
 └─────────────────┼─────────────────────────────────────────────┼─────────────────┘
                   │                                             │
 ┌─────────────────▼─────────────────────────────────────────────┴─────────────────┐
 │                         ZUSTAND STORE (useAppStore.ts)                          │
 │   • activeTab / sources / selectedSourceId / sessionCode / statusState / statusText │
 │   • isHosting / isViewing / remoteStream / localStream / modalConfig            │
 └─────────────────┬─────────────────────────────────────────────▲─────────────────┘
                   │                                             │
 ┌─────────────────▼─────────────────────────────────────────────┴─────────────────┐
 │                             P2PMediaSDK (TypeScript)                            │
 │   ┌──────────────────────────┐                   ┌──────────────────────────┐   │
 │   │      MediaManager        │                   │     WebRTCTransport      │   │
 │   │ (Desktop Capturer & Audio)│                  │ (RTCPeerConnection/ICE)  │   │
 │   └─────────────┬────────────┘                   └────────────▲─────────────┘   │
 └─────────────────┼─────────────────────────────────────────────┼─────────────────┘
                   │                                             │
 ┌─────────────────▼─────────────────────────────────────────────┴─────────────────┐
 │                             WEBRTC ICE AGENT PIPELINE                           │
 │   ┌──────────────────────────────────┐      ┌───────────────────────────────┐   │
 │   │        Signaling Provider        │      │           ICE Agent           │   │
 │   │    (WebTorrent WSS / IPC)        │      │   • Candidate Gathering       │   │
 │   └─────────────────┬────────────────┘      │     (Host / STUN / TURN)      │   │
 │                     │                       │   • Candidate Queueing        │   │
 │                     ▼                       │   • Connectivity Checks       │   │
 │             SDP + ICE Messages              │   • Selected Candidate Pair   │   │
 │                     │                       └───────────────▲───────────────┘   │
 │                     │                                       │                   │
 └─────────────────────┼───────────────────────────────────────┼───────────────────┘
                       │                                       │
                       ▼                                       │
 ┌─────────────────────────────────────────────────────────────┴───────────────────┐
 │                              PHYSICAL P2P NETWORK                               │
 │            HOST PEER ◄════════════ DTLS-SRTP Media Stream ═══════════► VIEWER PEER  │
 └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 5. Portable Build Specifications

- **Target OS**: Windows 10 / 11 (64-bit)
- **Packager Engine**: `electron-packager` v30.5.1
- **Zip Compression**: PowerShell `Compress-Archive`
- **Output Artifact**: `release/P2PScreenShare-Portable.zip`
- **Distribution Model**: Standalone zero-installer portable zip.
