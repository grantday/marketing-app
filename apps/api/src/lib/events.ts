import { EventEmitter } from 'events';

export type ReachEvent =
  | { type: 'campaign.updated'; campaignId: string; organizationId: string }
  | { type: 'inbox.updated'; organizationId: string; conversationId?: string };

class ReachEventBus extends EventEmitter {
  emitEvent(event: ReachEvent): void {
    this.emit(`org:${event.organizationId}`, event);
    if (event.type === 'campaign.updated') {
      this.emit(`campaign:${event.campaignId}`, event);
    }
  }
}

export const eventBus = new ReachEventBus();
