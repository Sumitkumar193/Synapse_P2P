export class SDKError extends Error {
  public code: string;

  constructor(message: string, code: string = 'ERR_SDK_GENERAL') {
    super(message);
    this.name = 'SDKError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MediaError extends SDKError {
  constructor(message: string, code: string = 'ERR_MEDIA_FAILURE') {
    super(message, code);
    this.name = 'MediaError';
  }
}

export class SignalingError extends SDKError {
  constructor(message: string, code: string = 'ERR_SIGNALING_FAILURE') {
    super(message, code);
    this.name = 'SignalingError';
  }
}

export class TransportError extends SDKError {
  constructor(message: string, code: string = 'ERR_TRANSPORT_FAILURE') {
    super(message, code);
    this.name = 'TransportError';
  }
}
