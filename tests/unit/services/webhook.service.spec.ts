import { Test, TestingModule } from '@nestjs/testing';
import Stripe from 'stripe';
import { WebhookService } from '../../../src/webhook/webhook.service';
import { StripeAdapter } from '../../../src/adapters/stripe.adapter';
import { SubscriptionService } from '../../../src/subscription/subscription.service';
import { DatabaseClient } from '../../../src/services/database.client';
import { NotificationClient } from '../../../src/services/notification.client';
import { UserServiceClient } from '../../../src/services/user-service.client';
import { mockStripeAdapter } from '../../mocks/stripe.mock';
import { mockDatabaseClient } from '../../mocks/database.mock';
import { mockNotificationClient } from '../../mocks/notification.mock';
import { mockUserServiceClient } from '../../mocks/user-service.mock';

describe('WebhookService', () => {
  let service: WebhookService;
  const mockSubscriptionService = {
    activateSubscription: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: StripeAdapter, useValue: mockStripeAdapter },
        { provide: SubscriptionService, useValue: mockSubscriptionService },
        { provide: DatabaseClient, useValue: mockDatabaseClient },
        { provide: NotificationClient, useValue: mockNotificationClient },
        { provide: UserServiceClient, useValue: mockUserServiceClient },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  describe('handleStripeEvent', () => {
    it('should handle checkout.session.completed', async () => {
      const event = {
        id: 'evt_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_123',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            metadata: { userId: 'user-123', planId: 'premium' },
          },
        },
      } as unknown as Stripe.Event;

      await service.handleStripeEvent(event);

      expect(mockStripeAdapter.getSubscription).toHaveBeenCalledWith('sub_test_123');
      expect(mockSubscriptionService.activateSubscription).toHaveBeenCalledWith(
        'user-123',
        'cus_test_123',
        'sub_test_123',
        'premium',
        expect.any(String),
        expect.any(String),
      );
      expect(mockNotificationClient.sendSubscriptionConfirmation).toHaveBeenCalledWith(
        'user-123',
        'premium',
      );
    });

    it('should handle customer.subscription.deleted', async () => {
      const event = {
        id: 'evt_456',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_test_123',
            customer: 'cus_test_123',
            metadata: { userId: 'user-123' },
          },
        },
      } as unknown as Stripe.Event;

      await service.handleStripeEvent(event);

      expect(mockDatabaseClient.updateSubscriptionStatusByStripeId).toHaveBeenCalledWith(
        'sub_test_123',
        'canceled',
      );
      expect(mockUserServiceClient.updateUserTier).toHaveBeenCalledWith('user-123', 'free');
      expect(mockNotificationClient.sendSubscriptionCanceled).toHaveBeenCalledWith('user-123');
    });

    it('should handle invoice.paid', async () => {
      const event = {
        id: 'evt_789',
        type: 'invoice.paid',
        data: {
          object: {
            id: 'in_123',
            customer: 'cus_test_123',
            payment_intent: 'pi_123',
            amount_paid: 999,
            currency: 'eur',
            subscription_details: { metadata: { userId: 'user-123' } },
          },
        },
      } as unknown as Stripe.Event;

      await service.handleStripeEvent(event);

      expect(mockDatabaseClient.createTransaction).toHaveBeenCalledWith({
        userId: 'user-123',
        stripePaymentIntentId: 'pi_123',
        amount: 999,
        currency: 'eur',
        status: 'succeeded',
      });
    });

    it('should handle invoice.payment_failed', async () => {
      const event = {
        id: 'evt_fail',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_fail',
            customer: 'cus_test_123',
            payment_intent: 'pi_fail',
            amount_due: 999,
            currency: 'eur',
            subscription_details: { metadata: { userId: 'user-123' } },
          },
        },
      } as unknown as Stripe.Event;

      await service.handleStripeEvent(event);

      expect(mockDatabaseClient.createTransaction).toHaveBeenCalledWith({
        userId: 'user-123',
        stripePaymentIntentId: 'pi_fail',
        amount: 999,
        currency: 'eur',
        status: 'failed',
      });
      expect(mockNotificationClient.sendPaymentFailed).toHaveBeenCalledWith('user-123');
    });

    it('should handle checkout.session.completed without userId gracefully', async () => {
      const event = {
        id: 'evt_no_user',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_no_user',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            metadata: {},
          },
        },
      } as unknown as Stripe.Event;

      await expect(service.handleStripeEvent(event)).resolves.toBeUndefined();
      expect(mockSubscriptionService.activateSubscription).not.toHaveBeenCalled();
    });

    it('should handle customer.subscription.created (logs only)', async () => {
      const event = {
        id: 'evt_created',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test_123',
            status: 'active',
            customer: 'cus_test_123',
            metadata: { userId: 'user-123' },
          },
        },
      } as unknown as Stripe.Event;

      await expect(service.handleStripeEvent(event)).resolves.toBeUndefined();
    });

    it('should handle customer.subscription.updated with status active — calls activateSubscription', async () => {
      const event = {
        id: 'evt_updated',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_123',
            status: 'active',
            customer: 'cus_test_123',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
            items: { data: [{ price: { id: 'price_1TAVJXHhqOObOnmXf8SOVKMG' } }] },
            metadata: { userId: 'user-123', planId: 'premium' },
          },
        },
      } as unknown as Stripe.Event;

      await service.handleStripeEvent(event);

      expect(mockSubscriptionService.activateSubscription).toHaveBeenCalledWith(
        'user-123',
        'cus_test_123',
        'sub_test_123',
        'premium',
        expect.any(String),
        expect.any(String),
      );
      expect(mockNotificationClient.sendSubscriptionConfirmation).toHaveBeenCalledWith(
        'user-123',
        'premium',
      );
      expect(mockDatabaseClient.upsertSubscription).not.toHaveBeenCalled();
    });

    it('should handle customer.subscription.updated with status past_due — upserts only', async () => {
      const event = {
        id: 'evt_past_due',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_123',
            status: 'past_due',
            customer: 'cus_test_123',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
            items: { data: [] },
            metadata: { userId: 'user-123', planId: 'premium' },
          },
        },
      } as unknown as Stripe.Event;

      await service.handleStripeEvent(event);

      expect(mockDatabaseClient.upsertSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-123', status: 'past_due' }),
      );
      expect(mockSubscriptionService.activateSubscription).not.toHaveBeenCalled();
    });

    it('should handle customer.subscription.updated without userId (early return)', async () => {
      const event = {
        id: 'evt_updated_no_user',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_123',
            status: 'active',
            customer: 'cus_test_123',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
            metadata: {},
          },
        },
      } as unknown as Stripe.Event;

      await expect(service.handleStripeEvent(event)).resolves.toBeUndefined();
      expect(mockDatabaseClient.upsertSubscription).not.toHaveBeenCalled();
    });

    it('should log warning for unhandled event types', async () => {
      const event = {
        id: 'evt_unknown',
        type: 'some.unknown.event',
        data: { object: {} },
      } as unknown as Stripe.Event;

      await expect(service.handleStripeEvent(event)).resolves.toBeUndefined();
    });
  });
});
