import { P2PMediaSDK, DesktopSource } from '../sdk';

document.addEventListener('DOMContentLoaded', () => {
  const sdk = new P2PMediaSDK();

  // Window Controls (Inside App Titlebar)
  const winMin = document.getElementById('win-min');
  const winMax = document.getElementById('win-max');
  const winClose = document.getElementById('win-close');
  const btnOpen2ndWin = document.getElementById('btn-open-2nd-win');

  if (btnOpen2ndWin) {
    btnOpen2ndWin.style.display = 'inline-block';
    btnOpen2ndWin.addEventListener('click', () => {
      if (window.electronAPI?.openNewWindow) {
        window.electronAPI.openNewWindow();
      }
    });
  }

  winMin?.addEventListener('click', () => {
    if (window.electronAPI?.minimizeWindow) window.electronAPI.minimizeWindow();
  });

  winMax?.addEventListener('click', () => {
    if (window.electronAPI?.maximizeWindow) window.electronAPI.maximizeWindow();
  });

  winClose?.addEventListener('click', () => {
    if (window.electronAPI?.closeWindow) window.electronAPI.closeWindow();
  });

  // UI Elements
  const statusText = document.getElementById('status-text') as HTMLElement;
  const landingView = document.getElementById('landing-view') as HTMLElement;
  const sessionView = document.getElementById('session-view') as HTMLElement;

  // Host Elements
  const sourcesGrid = document.getElementById('sources-grid') as HTMLElement;
  const btnRefreshSources = document.getElementById('btn-refresh-sources') as HTMLButtonElement;
  const chkSysAudio = document.getElementById('chk-sys-audio') as HTMLInputElement;
  const chkMicAudio = document.getElementById('chk-mic-audio') as HTMLInputElement;
  const btnStartHost = document.getElementById('btn-start-host') as HTMLButtonElement;
  const hostCodeBox = document.getElementById('host-code-box') as HTMLElement;
  const hostCodeVal = document.getElementById('host-code-val') as HTMLElement;
  const hostWaitMsg = document.getElementById('host-wait-msg') as HTMLElement;
  const btnCopyCode = document.getElementById('btn-copy-code') as HTMLButtonElement;
  const btnStopHost = document.getElementById('btn-stop-host') as HTMLButtonElement;

  // Viewer Elements
  const joinCodeInput = document.getElementById('join-code-input') as HTMLInputElement;
  const btnJoinSession = document.getElementById('btn-join-session') as HTMLButtonElement;

  // Media Players
  const remoteVideo = document.getElementById('remote-video') as HTMLVideoElement;
  const localPreviewVideo = document.getElementById('local-preview-video') as HTMLVideoElement;

  // Controls
  const btnToggleAudio = document.getElementById('btn-toggle-audio') as HTMLButtonElement;
  const btnFullscreen = document.getElementById('btn-fullscreen') as HTMLButtonElement;
  const btnEndSession = document.getElementById('btn-end-session') as HTMLButtonElement;

  let selectedSourceId: string = 'screen:0:0';
  let currentSessionCode: string | null = null;
  let isAudioMuted = false;

  // Format code input as XXX-XXX
  joinCodeInput?.addEventListener('input', () => {
    let value = joinCodeInput.value.replace(/[^0-9]/g, '');
    if (value.length > 3) {
      value = `${value.substring(0, 3)}-${value.substring(3, 6)}`;
    }
    joinCodeInput.value = value;
  });

  // Load Desktop Sources (Screens & Windows)
  async function loadDesktopSources() {
    try {
      sourcesGrid.innerHTML = '<div style="font-size: 0.8rem; color: #94a3b8; grid-column: 1/-1;">Scanning displays...</div>';
      const sources: DesktopSource[] = await sdk.getDesktopSources(['screen', 'window']);
      sourcesGrid.innerHTML = '';

      if (!sources || sources.length === 0) {
        sourcesGrid.innerHTML = '<div style="font-size: 0.8rem; color: #94a3b8; grid-column: 1/-1;">No desktop sources found.</div>';
        return;
      }

      sources.forEach((source, index) => {
        const card = document.createElement('div');
        card.className = `source-card ${index === 0 ? 'selected' : ''}`;
        if (index === 0) selectedSourceId = source.id;

        const isScreen = source.id.startsWith('screen');
        const badge = document.createElement('div');
        badge.className = 'source-badge';
        badge.textContent = isScreen ? 'SCREEN' : 'APP';
        card.appendChild(badge);

        if (source.thumbnail) {
          const img = document.createElement('img');
          img.src = source.thumbnail;
          card.appendChild(img);
        } else {
          const placeholder = document.createElement('div');
          placeholder.style.cssText = 'width:100%; height:60px; background:rgba(99,102,241,0.25); border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:1.3rem;';
          placeholder.textContent = isScreen ? '🖥️' : '🗔';
          card.appendChild(placeholder);
        }

        const name = document.createElement('span');
        name.textContent = source.name || 'Display Source';
        name.title = source.name;
        card.appendChild(name);

        card.addEventListener('click', () => {
          document.querySelectorAll('.source-card').forEach((c) => c.classList.remove('selected'));
          card.classList.add('selected');
          selectedSourceId = source.id;
        });

        sourcesGrid.appendChild(card);
      });
    } catch (err: any) {
      console.error('Failed to fetch desktop sources:', err);
      sourcesGrid.innerHTML = `<div style="font-size: 0.8rem; color: #ef4444; grid-column: 1/-1;">Error loading sources: ${err.message}</div>`;
    }
  }

  btnRefreshSources?.addEventListener('click', loadDesktopSources);

  // Host Action: Create Code & Share Screen
  btnStartHost?.addEventListener('click', async () => {
    const targetSourceId = selectedSourceId || 'screen:0:0';

    try {
      const sessionCode = sdk.generateSessionCode();
      const cleanRoomId = sessionCode.replace('-', '');
      currentSessionCode = sessionCode;

      btnStartHost.disabled = true;
      btnStartHost.textContent = 'Initializing Stream...';

      console.log(`[P2PMediaSDK] 🚀 Host creating session code ${sessionCode} (Room: ${cleanRoomId})...`);

      // Connect to signaling room with session code
      await sdk.connect(cleanRoomId);

      // Start screen capture (video + speaker + mic)
      const stream = await sdk.startScreenShare({
        sourceId: targetSourceId,
        includeSystemAudio: chkSysAudio.checked,
        includeMicrophone: chkMicAudio.checked,
      });

      // Local preview thumbnail MUST BE MUTED to prevent local echo
      localPreviewVideo.muted = true;
      localPreviewVideo.srcObject = stream;
      localPreviewVideo.style.display = 'block';

      // Display Code Box
      hostCodeVal.textContent = sessionCode;
      hostCodeBox.style.display = 'flex';
      btnStartHost.style.display = 'none';

      if (statusText) statusText.textContent = `Hosting (${sessionCode})`;
    } catch (err: any) {
      btnStartHost.disabled = false;
      btnStartHost.textContent = '🚀 Start Sharing & Create Code';
      alert(`Failed to start sharing: ${err.message}`);
    }
  });

  // Host Action: Stop Sharing
  btnStopHost?.addEventListener('click', async () => {
    console.log('[P2PMediaSDK] 🛑 Host stopped sharing.');
    await sdk.disconnect();

    currentSessionCode = null;
    hostCodeBox.style.display = 'none';
    btnStartHost.style.display = 'flex';
    btnStartHost.disabled = false;
    btnStartHost.textContent = '🚀 Start Sharing & Create Code';

    localPreviewVideo.style.display = 'none';
    if (statusText) statusText.textContent = 'Ready';

    loadDesktopSources();
  });

  // Copy Code
  btnCopyCode?.addEventListener('click', () => {
    if (currentSessionCode) {
      navigator.clipboard.writeText(currentSessionCode);
      btnCopyCode.textContent = '✓ Copied!';
      setTimeout(() => {
        btnCopyCode.textContent = '📋 Copy Code';
      }, 2000);
    }
  });

  // Viewer Action: Join Session with Code
  btnJoinSession?.addEventListener('click', async () => {
    const rawCode = joinCodeInput.value.trim();
    if (!rawCode || rawCode.length < 6) {
      alert('Please enter a valid 6-digit session code (e.g. 123-456)');
      return;
    }

    if (currentSessionCode && rawCode === currentSessionCode) {
      alert(`You are hosting code ${rawCode} in this window!\n\nTo view this screen, open a 2nd window and enter code ${rawCode}.`);
      return;
    }

    const cleanRoomId = rawCode.replace(/[^0-9]/g, '');

    try {
      btnJoinSession.disabled = true;
      btnJoinSession.textContent = 'Connecting to Host...';
      if (statusText) statusText.textContent = `Connecting (${rawCode})...`;

      console.log(`[P2PMediaSDK] 🔗 Viewer connecting to session code ${rawCode} (Room: ${cleanRoomId})...`);

      await sdk.connect(cleanRoomId);
    } catch (err: any) {
      btnJoinSession.disabled = false;
      btnJoinSession.textContent = '🔗 Connect & View Screen';
      alert(`Failed to join session: ${err.message}`);
    }
  });

  // SDK Remote Track Handler (Viewer receives video + audio)
  sdk.events.on('track-added', async (track, stream, peerId) => {
    landingView.style.display = 'none';
    sessionView.style.display = 'flex';

    if (remoteVideo) {
      remoteVideo.srcObject = stream;
      remoteVideo.muted = isAudioMuted;
      btnToggleAudio.textContent = isAudioMuted ? '🔇 Unmute Audio' : '🔊 Mute Audio';
      remoteVideo.play().catch(console.error);
    }

    const stats = await sdk.getConnectionStats();
    const typeLabel = stats && stats.candidateType ? stats.candidateType.toUpperCase() : 'P2P';
    if (statusText) statusText.textContent = `Connected (${typeLabel} - ${peerId})`;
  });

  // P2P Connection State Listener
  sdk.events.on('connection-state-change', async (state) => {
    if (state === 'connected') {
      const stats = await sdk.getConnectionStats();
      const typeDesc = stats && stats.connectionTypeDescription ? stats.connectionTypeDescription : 'Direct P2P';
      const trackerUrl = stats && stats.activeTrackerUrl ? stats.activeTrackerUrl : 'Electron IPC Bus';
      const stunTurnUrl = stats && stats.activeStunTurnUrl ? stats.activeStunTurnUrl : 'Direct Local Network';
      const candidateType = stats && stats.candidateType ? stats.candidateType.toUpperCase() : 'HOST';

      // Log detailed connection block to DevTools and Terminal Console
      console.log(
        `[P2PMediaSDK] 📶 WebRTC P2P CONNECTION ESTABLISHED!\n` +
        `  • Candidate Type    : ${candidateType}\n` +
        `  • Connection Mode   : ${typeDesc}\n` +
        `  • Signaling Tracker : ${trackerUrl}\n` +
        `  • Active STUN/TURN  : ${stunTurnUrl}\n` +
        `  • Transport Protocol: ${stats?.protocol || 'udp'}`
      );

      if (hostWaitMsg) hostWaitMsg.textContent = `✓ Connected via ${typeDesc}`;
      if (statusText) statusText.textContent = `Connected (${typeDesc})`;
    } else if (state === 'disconnected') {
      console.log('[P2PMediaSDK] 🔴 Session Disconnected');
      if (statusText) statusText.textContent = 'Disconnected';
    }
  });

  // Mute / Unmute Remote Audio
  btnToggleAudio?.addEventListener('click', () => {
    if (remoteVideo) {
      isAudioMuted = !isAudioMuted;
      remoteVideo.muted = isAudioMuted;
      btnToggleAudio.textContent = isAudioMuted ? '🔇 Unmute Audio' : '🔊 Mute Audio';
    }
  });

  // Fullscreen Toggle
  btnFullscreen?.addEventListener('click', () => {
    if (remoteVideo) {
      if (!document.fullscreenElement) {
        remoteVideo.requestFullscreen().catch(console.error);
      } else {
        document.exitFullscreen().catch(console.error);
      }
    }
  });

  // End Session
  btnEndSession?.addEventListener('click', async () => {
    await sdk.disconnect();

    sessionView.style.display = 'none';
    landingView.style.display = 'grid';

    hostCodeBox.style.display = 'none';
    btnStartHost.style.display = 'flex';
    btnStartHost.disabled = false;
    btnStartHost.textContent = '🚀 Start Sharing & Create Code';

    btnJoinSession.disabled = false;
    btnJoinSession.textContent = '🔗 Connect & View Screen';

    localPreviewVideo.style.display = 'none';
    if (statusText) statusText.textContent = 'Ready';

    loadDesktopSources();
  });

  // Initial source scan
  setTimeout(() => loadDesktopSources(), 300);
});
