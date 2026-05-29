import { WSMessage, FullStatePayload, TickUpdatePayload, SimEvent } from '../types';

export class WSClient {
  private ws!: WebSocket;
  private reconnectDelay = 2000;

  onFullState?: (p: FullStatePayload) => void;
  onTickUpdate?: (p: TickUpdatePayload) => void;
  onSimEvent?:   (e: SimEvent) => void;
  onConnected?:  () => void;
  onDisconnected?: () => void;

  connect(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onopen  = () => { console.log('[WS] connected'); this.onConnected?.(); };
    this.ws.onclose = () => {
      console.log('[WS] disconnected, retrying...');
      this.onDisconnected?.();
      setTimeout(() => this.connect(url), this.reconnectDelay);
    };
    this.ws.onerror = e => console.error('[WS] error', e);
    this.ws.onmessage = e => {
      try {
        const msg: WSMessage = JSON.parse(e.data as string);
        if (msg.type === 'full_state')  this.onFullState?.(msg.payload as FullStatePayload);
        if (msg.type === 'tick_update') this.onTickUpdate?.(msg.payload as TickUpdatePayload);
        if (msg.type === 'sim_event')   this.onSimEvent?.(msg.payload as SimEvent);
      } catch { /* ignore */ }
    };
  }
}
