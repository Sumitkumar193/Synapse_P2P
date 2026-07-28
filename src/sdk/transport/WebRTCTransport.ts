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
}

export class WebRTCTransport {
  private peerConnection?: RTCPeerConnection;
  private dataChannel?: RTCDataChannel;
  private options: WebRTCTransportOptions;
  private logger: Logger;
  private connectionState: ConnectionState = 'disconnected';
  private localStream?: MediaStream;

  constructor(options: WebRTCTransportOptions) {
    this.options = options;
    this.logger = new Logger(`WebRTCTransport[${options.peerId}]`);
    this.setupSignalingListeners();
  }

  public async initialize(): Promise<void> {
    const rtcConfig: RTCConfiguration = {
      iceServers: this.options.iceServers || [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
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
      if (event.streams[0]) {
        this.options.eventEmitter.emit(
          'track-added',
          event.track,
          event.streams[0],
          this.options.targetPeerId || 'unknown'
        );
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (!this.peerConnection) return;
      this.logger.info(`RTC Connection state changed: ${this.peerConnection.connectionState}`);
      switch (this.peerConnection.connectionState) {
        case 'connected':
          this.updateState('connected');
          break;
        case 'connecting':
          this.updateState('connecting');
          break;
        case 'disconnected':
        case 'closed':
          this.updateState('disconnected');
          break;
        case 'failed':
          this.updateState('failed');
          break;
      }
    };

    this.peerConnection.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };
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
  }

  public async handleIceCandidate(candidate: any): Promise<void> {
    if (!this.peerConnection || !candidate) return;
    try {
      // Validate candidate string and sdpMid / sdpMLineIndex
      if (candidate.candidate && typeof candidate.candidate === 'string' && candidate.candidate.trim() !== '') {
        const rtcCandidate = new RTCIceCandidate(candidate);
        await this.peerConnection.addIceCandidate(rtcCandidate);
      }
    } catch (e: any) {
      this.logger.warn('Skipping unparseable ICE candidate:', e?.message || e);
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

      stats.forEach((report) => {
        if (report.type === 'transport' && report.selectedCandidatePairId) {
          activePair = stats.get(report.selectedCandidatePairId);
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
          stunTurnUrl = activeLocalCandidate.url || 'stun:stun.l.google.com:19302';
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

  private setupSignalingListeners(): void {
    this.options.signalingProvider.onMessage(async (msg: SignalingMessage) => {
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
        }
      } catch (err: any) {
        this.logger.error(`Error handling signaling message ${msg.type}:`, err);
      }
    });
  }

  private updateState(state: ConnectionState): void {
    this.connectionState = state;
    this.options.eventEmitter.emit('connection-state-change', state);
  }

  public close(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = undefined;
    }
    this.updateState('disconnected');
  }
}
