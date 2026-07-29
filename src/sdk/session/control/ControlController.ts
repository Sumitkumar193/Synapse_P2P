import { IDataChannel } from '../data/IDataChannel';
import {
  MouseButton,
  ControlMessage,
  MouseMovePayload,
  MouseClickPayload,
  MouseScrollPayload,
  MouseDragPayload,
  KeyboardPressPayload,
  KeyboardTypePayload,
} from '../../types';

export class ControlController {
  private dataChannel: IDataChannel;

  constructor(dataChannel: IDataChannel) {
    this.dataChannel = dataChannel;
  }

  private sendControl(category: 'mouse' | 'keyboard', action: string, payload: any): void {
    const msg: ControlMessage = { category, action, payload };
    this.dataChannel.sendJson({ __control__: msg });
  }

  public get mouse() {
    return {
      move: (x: number, y: number) => {
        const payload: MouseMovePayload = { x, y };
        this.sendControl('mouse', 'move', payload);
      },
      click: (button: MouseButton = 'left', x?: number, y?: number, double: boolean = false) => {
        const payload: MouseClickPayload = { button, x, y, double };
        this.sendControl('mouse', 'click', payload);
      },
      scroll: (deltaX: number, deltaY: number) => {
        const payload: MouseScrollPayload = { deltaX, deltaY };
        this.sendControl('mouse', 'scroll', payload);
      },
      drag: (startX: number, startY: number, endX: number, endY: number) => {
        const payload: MouseDragPayload = { startX, startY, endX, endY };
        this.sendControl('mouse', 'drag', payload);
      },
    };
  }

  public get keyboard() {
    return {
      press: (key: string, modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[]) => {
        const payload: KeyboardPressPayload = { key, modifiers };
        this.sendControl('keyboard', 'keyPress', payload);
      },
      type: (text: string) => {
        const payload: KeyboardTypePayload = { text };
        this.sendControl('keyboard', 'type', payload);
      },
    };
  }
}
