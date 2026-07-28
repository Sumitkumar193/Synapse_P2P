export type SignalingMessageType = 
  | 'join'
  | 'leave'
  | 'peer-joined'
  | 'peer-left'
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'error';

export interface SignalingMessage {
  type: SignalingMessageType;
  senderId: string;
  targetId?: string;
  roomId?: string;
  payload?: any;
  timestamp?: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
