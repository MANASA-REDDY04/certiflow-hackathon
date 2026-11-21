import EventEmitter from 'events';
import { FastifyInstance } from 'fastify';
import { PolicyUser } from '../policies/accessControlPolicy.js';

export interface CertiFlowEvent {
  id: string;
  type: string;
  title: string;
  message: string;
  batchId?: string;
  centreId?: string | null;
  districtId?: string | null;
  targetRole?: string | null;
  timestamp: string;
  data?: Record<string, any>;
}

const localEmitter = new EventEmitter();
localEmitter.setMaxListeners(100);

export class EventBus {
  private static redisPublisher: any = null;
  private static redisSubscriber: any = null;

  static initialize(fastify: FastifyInstance) {
    if (fastify.redis) {
      this.redisPublisher = fastify.redis;
      try {
        // Duplicate client for subscribing
        this.redisSubscriber = fastify.redis.duplicate();
        this.redisSubscriber.subscribe('certiflow:events', (err: any) => {
          if (err) {
            fastify.log.warn('[EventBus] Redis subscriber error, falling back to local events:', err);
          } else {
            fastify.log.info('[EventBus] Subscribed to Redis channel "certiflow:events"');
          }
        });

        this.redisSubscriber.on('message', (_channel: string, message: string) => {
          try {
            const event: CertiFlowEvent = JSON.parse(message);
            localEmitter.emit('event', event);
          } catch {}
        });
      } catch (e) {
        fastify.log.warn('[EventBus] Using in-memory event bus');
      }
    }
  }

  /**
   * Publish an event to Redis pub/sub and local emitter
   */
  static async publish(event: CertiFlowEvent): Promise<void> {
    localEmitter.emit('event', event);

    if (this.redisPublisher) {
      try {
        await this.redisPublisher.publish('certiflow:events', JSON.stringify(event));
      } catch {}
    }
  }

  /**
   * Subscribe an authenticated SSE client with role and district filtering
   */
  static subscribe(
    user: PolicyUser,
    onEvent: (event: CertiFlowEvent) => void
  ): () => void {
    const handler = (event: CertiFlowEvent) => {
      // 1. Training centre: receives events for their centre
      if (user.role === 'training_centre') {
        if (!event.centreId || event.centreId === user.centre_id) {
          onEvent(event);
        }
        return;
      }

      // 2. District officer: receives events within their district
      if (user.role === 'district_officer') {
        if (!event.districtId || event.districtId === user.district_id) {
          onEvent(event);
        }
        return;
      }

      // 3. Quality team & State office: receive quality, state, and escalation alerts
      onEvent(event);
    };

    localEmitter.on('event', handler);

    // Return unsubscribe callback
    return () => {
      localEmitter.off('event', handler);
    };
  }
}
