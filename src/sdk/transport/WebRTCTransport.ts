import { IceServerConfig, SignalingMessage, ConnectionState } from '../types';
import { ISignalingProvider } from '../signaling';
import { TypedEventEmitter } from '../events/EventEmitter';
import { SDKEventMap } from '../events/events';
import { TransportError } from '../utils/Errors';
import { Logger } from '../utils/Logger';

export interface WebRTCTransportOptions {
  peerId: string;
  targetPeerId?: string;
  roomId?: string;
  iceServers?: IceServerConfig[];
  iceTransportPolicy?: 'all' | 'relay';
  preferredVideoCodec?: 'H264' | 'VP8' | 'VP9' | 'AV1';
  signalingProvider: ISignalingProvider;
  eventEmitter: TypedEventEmitter<SDKEventMap>;
}

export interface ConnectionStats {
  candidateType: 'host' | 'srflx' | 'prflx' | 'relay' | string;
  localIp?: string;
  remoteIp?: string;
  protocol?: string;
  activeStunTurnUrl: string;
  connectionTypeDescription: string;
  videoCodec?: string;
  audioCodec?: string;
  frameWidth?: number;
  frameHeight?: number;
  framesPerSecond?: number;
}

export class WebRTCTransport {
  private peerConnection?: RTCPeerConnection;
  private dataChannel?: RTCDataChannel;
  private options: WebRTCTransportOptions;
  private logger: Logger;
  private connectionState: ConnectionState = 'disconnected';
  private localStream?: MediaStream;
  private remoteStream?: MediaStream;
  private reconnectTimer?: any;
  private pendingIceCandidates: any[] = [];
  private isPeerEnded: boolean = false;

  constructor(options: WebRTCTransportOptions) {
    this.options = options;
    this.logger = new Logger(`WebRTCTransport[${options.peerId}]`);
    this.setupSignalingListeners();
  }

  public async initialize(): Promise<void> {
    const rtcConfig: RTCConfiguration = {
      iceServers: this.options.iceServers || [
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceTransportPolicy: this.options.iceTransportPolicy || 'all'
    };

    this.peerConnection = new RTCPeerConnection(rtcConfig);
    this.setupPeerConnectionListeners();
    this.updateState('connecting');
  }

  private setupPeerConnectionListeners(): void {
    if (!this.peerConnection) return;

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && event.candidate.candidate && this.options.targetPeerId) {
        this.options.signalingProvider.send({
          type: 'ice-candidate',
          senderId: this.options.peerId,
          targetId: this.options.targetPeerId,
          roomId: this.options.roomId,
          payload: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        });
      }
    };

    this.peerConnection.ontrack = (event) => {
      this.logger.info(`Received remote track: ${event.track.kind}`);
      
      const stream = event.streams[0];
      if (stream) {
        this.remoteStream = stream;
      } else {
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream([event.track]);
        } else {
          if (!this.remoteStream.getTracks().includes(event.track)) {
            this.remoteStream.addTrack(event.track);
          }
        }
      }

      this.options.eventEmitter.emit(
        'track-added',
        event.track,
        this.remoteStream,
        this.options.targetPeerId || 'unknown'
      );
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (!this.peerConnection) return;
      const state = this.peerConnection.connectionState;
      this.logger.info(`RTC Connection state changed: ${state}`);
      switch (state) {
        case 'connected':
          this.clearReconnectTimer();
          this.updateState('connected');
          break;
        case 'connecting':
          this.updateState('connecting');
          break;
        case 'disconnected':
          if (!this.isPeerEnded) {
            this.updateState('disconnected');
            this.handleNetworkDisconnect();
          }
          break;
        case 'failed':
          if (!this.isPeerEnded) {
            this.updateState('failed');
            this.handleConnectionFailure();
          }
          break;
        case 'closed':
          this.clearReconnectTimer();
          this.updateState('disconnected');
          break;
      }
    };

    this.peerConnection.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };
  }

  public setVideoCodecPreference(preferredCodec: 'H264' | 'VP8' | 'VP9' | 'AV1'): void {
    if (!this.peerConnection || typeof RTCRtpSender === 'undefined' || typeof RTCRtpSender.getCapabilities !== 'function') return;
    try {
      const capabilities = RTCRtpSender.getCapabilities('video');
      if (capabilities && capabilities.codecs) {
        const preferred = capabilities.codecs.filter(c => c.mimeType.toLowerCase() === `video/${preferredCodec.toLowerCase()}`);
        const others = capabilities.codecs.filter(c => c.mimeType.toLowerCase() !== `video/${preferredCodec.toLowerCase()}`);
        const orderedCodecs = [...preferred, ...others];

        this.peerConnection.getTransceivers().forEach(transceiver => {
          if (transceiver.receiver.track.kind === 'video' || transceiver.sender.track?.kind === 'video') {
            if (typeof transceiver.setCodecPreferences === 'function') {
              transceiver.setCodecPreferences(orderedCodecs);
              this.logger.info(`Preferred video codec set to ${preferredCodec}`);
            }
          }
        });
      }
    } catch (e) {
      this.logger.warn('Failed to set video codec preference:', e);
    }
  }

  public async restartIce(): Promise<void> {
    if (!this.peerConnection || !this.options.targetPeerId) return;
    if (!this.options.signalingProvider.isConnected()) {
      this.logger.info('Signaling provider is disconnected. Skipping ICE restart for closed session.');
      return;
    }
    this.logger.info('Initiating WebRTC ICE Restart for connection recovery...');
    try {
      const offer = await this.peerConnection.createOffer({ iceRestart: true });
      await this.peerConnection.setLocalDescription(offer);

      await this.options.signalingProvider.send({
        type: 'offer',
        senderId: this.options.peerId,
        targetId: this.options.targetPeerId,
        roomId: this.options.roomId,
        payload: offer,
      });
    } catch (err) {
      this.logger.error('ICE Restart failed:', err);
    }
  }

  private handleNetworkDisconnect(): void {
    this.logger.warn('Network connection interrupted. ICE Agent attempting automatic recovery...');
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      if (this.peerConnection && (this.peerConnection.connectionState === 'disconnected' || this.peerConnection.iceConnectionState === 'disconnected')) {
        this.restartIce();
      }
    }, 5000);
  }

  private handleConnectionFailure(): void {
    this.logger.error('WebRTC Connection failed. Attempting ICE Restart recovery...');
    this.restartIce();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel;
    this.dataChannel.onmessage = (event) => {
      this.options.eventEmitter.emit(
        'data-message',
        event.data,
        this.options.targetPeerId || 'unknown'
      );
    };
    this.dataChannel.onopen = () => {
      this.logger.info('DataChannel opened');
    };
  }

  public async createOffer(targetPeerId: string): Promise<void> {
    if (!this.peerConnection) await this.initialize();
    this.options.targetPeerId = targetPeerId;

    const channel = this.peerConnection!.createDataChannel('p2p-data');
    this.setupDataChannel(channel);

    if (this.options.preferredVideoCodec) {
      this.setVideoCodecPreference(this.options.preferredVideoCodec);
    }

    const offer = await this.peerConnection!.createOffer();
    await this.peerConnection!.setLocalDescription(offer);

    await this.options.signalingProvider.send({
      type: 'offer',
      senderId: this.options.peerId,
      targetId: targetPeerId,
      roomId: this.options.roomId,
      payload: offer,
    });
  }

  public async handleOffer(offer: RTCSessionDescriptionInit, senderId: string): Promise<void> {
    if (!this.peerConnection) await this.initialize();
    this.options.targetPeerId = senderId;

    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));
    await this.flushPendingIceCandidates();

    if (this.options.preferredVideoCodec) {
      this.setVideoCodecPreference(this.options.preferredVideoCodec);
    }

    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    await this.options.signalingProvider.send({
      type: 'answer',
      senderId: this.options.peerId,
      targetId: senderId,
      roomId: this.options.roomId,
      payload: answer,
    });
  }

  public async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    await this.flushPendingIceCandidates();
  }

  public async handleIceCandidate(candidate: any): Promise<void> {
    if (!this.peerConnection || !candidate) return;
    try {
      if (candidate.candidate && typeof candidate.candidate === 'string' && candidate.candidate.trim() !== '') {
        if (!this.peerConnection.remoteDescription || !this.peerConnection.remoteDescription.type) {
          this.logger.info('Remote description not set yet. Queueing ICE candidate...');
          this.pendingIceCandidates.push(candidate);
          return;
        }
        const rtcCandidate = new RTCIceCandidate(candidate);
        await this.peerConnection.addIceCandidate(rtcCandidate);
      }
    } catch (e: any) {
      this.logger.warn('Skipping unparseable ICE candidate:', e?.message || e);
    }
  }

  private async flushPendingIceCandidates(): Promise<void> {
    if (!this.peerConnection || !this.peerConnection.remoteDescription || this.pendingIceCandidates.length === 0) return;
    this.logger.info(`Flushing ${this.pendingIceCandidates.length} queued ICE candidates...`);
    const candidates = [...this.pendingIceCandidates];
    this.pendingIceCandidates = [];

    for (const cand of candidates) {
      try {
        const rtcCandidate = new RTCIceCandidate(cand);
        await this.peerConnection.addIceCandidate(rtcCandidate);
      } catch (e: any) {
        this.logger.warn('Skipping queued ICE candidate:', e?.message || e);
      }
    }
  }

  public addStream(stream: MediaStream): void {
    this.localStream = stream;
    if (!this.peerConnection) return;
    stream.getTracks().forEach((track) => {
      this.peerConnection!.addTrack(track, stream);
    });
  }

  public sendData(data: string | ArrayBuffer): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(data as any);
    } else {
      throw new TransportError('DataChannel is not open');
    }
  }

  public async getConnectionStats(): Promise<ConnectionStats | null> {
    if (!this.peerConnection) return null;

    try {
      const stats = await this.peerConnection.getStats();
      let activePair: any = null;
      let activeLocalCandidate: any = null;
      let activeRemoteCandidate: any = null;
      let activeInboundVideo: any = null;

      stats.forEach((report) => {
        if (report.type === 'transport' && report.selectedCandidatePairId) {
          activePair = stats.get(report.selectedCandidatePairId);
        }
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          activeInboundVideo = report;
        }
      });

      if (activePair) {
        activeLocalCandidate = stats.get(activePair.localCandidateId);
        activeRemoteCandidate = stats.get(activePair.remoteCandidateId);
      }

      if (!activeLocalCandidate) {
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && (report.state === 'succeeded' || report.nominated)) {
            activeLocalCandidate = stats.get(report.localCandidateId);
            activeRemoteCandidate = stats.get(report.remoteCandidateId);
          }
        });
      }

      if (activeLocalCandidate) {
        const type = activeLocalCandidate.candidateType || 'host';
        let desc = 'Direct P2P / Local LAN Connection (Host)';
        let stunTurnUrl = 'Direct Local Network (Host Loopback)';

        if (type === 'srflx') {
          desc = 'STUN Server Reflexive P2P Connection (Internet)';
          stunTurnUrl = activeLocalCandidate.url || 'stun:stun.cloudflare.com:3478';
        } else if (type === 'relay') {
          desc = 'TURN Relayed Server Connection (Fallback)';
          stunTurnUrl = activeLocalCandidate.url || 'turn:openrelay.metered.ca:80';
        }

        return {
          candidateType: type,
          localIp: activeLocalCandidate.ip || activeLocalCandidate.address,
          remoteIp: activeRemoteCandidate?.ip || activeRemoteCandidate?.address,
          protocol: activeLocalCandidate.protocol || 'udp',
          activeStunTurnUrl: stunTurnUrl,
          connectionTypeDescription: desc,
          frameWidth: activeInboundVideo?.frameWidth,
          frameHeight: activeInboundVideo?.frameHeight,
          framesPerSecond: activeInboundVideo?.framesPerSecond,
        };
      }
    } catch (e) {
      this.logger.warn('Failed to fetch WebRTC stats:', e);
    }

    return {
      candidateType: 'host',
      activeStunTurnUrl: 'Direct Local IPC / Loopback',
      connectionTypeDescription: 'Direct P2P (Electron IPC / Local Network)',
    };
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteStream || null;
  }

  private onMessageHandler?: (msg: SignalingMessage) => void;

  private setupSignalingListeners(): void {
    this.onMessageHandler = async (msg: SignalingMessage) => {
      if (msg.roomId && this.options.roomId && msg.roomId !== this.options.roomId) return;
      if (msg.targetId && msg.targetId !== this.options.peerId) return;

      try {
        switch (msg.type) {
          case 'peer-joined':
            if (msg.senderId !== this.options.peerId) {
              this.logger.info(`Peer ${msg.senderId} joined room ${msg.roomId}. Initiating WebRTC offer...`);
              await this.createOffer(msg.senderId);
            }
            break;
          case 'offer':
            this.logger.info(`Received offer from ${msg.senderId}. Sending answer...`);
            await this.handleOffer(msg.payload, msg.senderId);
            break;
          case 'answer':
            this.logger.info(`Received answer from ${msg.senderId}.`);
            await this.handleAnswer(msg.payload);
            break;
          case 'ice-candidate':
            await this.handleIceCandidate(msg.payload);
            break;
          case 'peer-left':
            if (msg.senderId !== this.options.peerId) {
              this.logger.info(`Peer ${msg.senderId} left room ${msg.roomId}. Terminating session cleanly...`);
              this.isPeerEnded = true;
              this.clearReconnectTimer();
              this.options.eventEmitter.emit('peer-left', msg.senderId);
              this.close();
            }
            break;
        }
      } catch (err: any) {
        this.logger.error(`Error handling signaling message ${msg.type}:`, err);
      }
    };

    this.options.signalingProvider.onMessage(this.onMessageHandler);
  }

  private updateState(state: ConnectionState): void {
    this.connectionState = state;
    this.options.eventEmitter.emit('connection-state-change', state);
  }

  public close(): void {
    this.clearReconnectTimer();

    if (this.onMessageHandler) {
      this.options.signalingProvider.offMessage(this.onMessageHandler);
      this.onMessageHandler = undefined;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => track.stop());
      this.remoteStream = undefined;
    }

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = undefined;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = undefined;
    }

    this.pendingIceCandidates = [];
    this.updateState('disconnected');
  }
}
