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

export class WebRTCTransport {
  private peerConnection?: RTCPeerConnection;
  private dataChannel?: RTCDataChannel;
  private options: WebRTCTransportOptions;
  private logger: Logger;
  private connectionState: ConnectionState = 'disconnected';

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
      if (event.candidate && this.options.targetPeerId) {
        this.options.signalingProvider.send({
          type: 'ice-candidate',
          senderId: this.options.peerId,
          targetId: this.options.targetPeerId,
          roomId: this.options.roomId,
          payload: event.candidate,
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

    // Create optional DataChannel
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

  public async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) return;
    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }

  public addStream(stream: MediaStream): void {
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

  private setupSignalingListeners(): void {
    this.options.signalingProvider.onMessage(async (msg: SignalingMessage) => {
      if (msg.targetId && msg.targetId !== this.options.peerId) return;

      try {
        switch (msg.type) {
          case 'offer':
            await this.handleOffer(msg.payload, msg.senderId);
            break;
          case 'answer':
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
