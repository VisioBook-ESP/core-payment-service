import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { InvalidPlanException, SubscriptionNotFoundException, StripeException } from '../../../src/common/payment.exceptions';
import { SubscriptionService } from '../../../src/subscription/subscription.service';
import { StripeAdapter } from '../../../src/adapters/stripe.adapter';
import { DatabaseClient } from '../../../src/services/database.client';
import { mockStripeAdapter, mockStripeCustomer, mockPaymentIntentResponse, mockEphemeralKey } from '../../mocks/stripe.mock';
import { mockDatabaseClient, mockSubscriptionEntity } from '../../mocks/database.mock';


describe('SubscriptionService', () => {
  let service: SubscriptionService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: StripeAdapter, useValue: mockStripeAdapter },
        { provide: DatabaseClient, useValue: mockDatabaseClient },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
  });

  describe('getPlans', () => {
    it('should return all plans', () => {
      const plans = service.getPlans();
      expect(plans).toHaveLength(3);
      expect(plans.map((p) => p.id)).toEqual(['free', 'premium', 'enterprise']);
    });

    it('should include plan limits', () => {
      const plans = service.getPlans();
      const free = plans.find((p) => p.id === 'free')!;
      expect(free.limits.generationsPerMonth).toBe(3);
      expect(free.limits.watermark).toBe(true);
      expect(free.price).toBe(0);
    });
  });

  describe('getCurrentSubscription', () => {
    it('should return subscription for user', async () => {
      const result = await service.getCurrentSubscription('user-123');
      expect(result).toEqual(mockSubscriptionEntity);
      expect(mockDatabaseClient.getSubscriptionByUserId).toHaveBeenCalledWith('user-123');
    });

    it('should return null when no subscription', async () => {
      mockDatabaseClient.getSubscriptionByUserId.mockResolvedValueOnce(null);
      const result = await service.getCurrentSubscription('user-no-sub');
      expect(result).toBeNull();
    });
  });

  describe('createCheckoutSession', () => {
    it('should create a checkout session for valid plan', async () => {
      mockDatabaseClient.getSubscriptionByUserId.mockResolvedValueOnce(null);

      const result = await service.createCheckoutSession(
        'user-123',
        'premium',
        'https://app.visiobook.com/success',
        'https://app.visiobook.com/cancel',
      );

      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('checkoutUrl');
      expect(mockStripeAdapter.createCustomer).toHaveBeenCalledWith('user-123');
      expect(mockStripeAdapter.createCheckoutSession).toHaveBeenCalled();
    });

    it('should throw InvalidPlanException for invalid plan', async () => {
      await expect(
        service.createCheckoutSession('user-123', 'invalid', 'url', 'url'),
      ).rejects.toThrow(InvalidPlanException);
    });

    it('should throw InvalidPlanException for free plan', async () => {
      await expect(service.createCheckoutSession('user-123', 'free', 'url', 'url')).rejects.toThrow(
        InvalidPlanException,
      );
    });

    it('should throw BadRequestException when user has active subscription', async () => {
      await expect(
        service.createCheckoutSession(
          'user-123',
          'premium',
          'https://app.visiobook.com/success',
          'https://app.visiobook.com/cancel',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reuse existing stripe customer id', async () => {
      mockDatabaseClient.getSubscriptionByUserId.mockResolvedValueOnce({
        ...mockSubscriptionEntity,
        status: 'canceled',
      });

      await service.createCheckoutSession(
        'user-123',
        'premium',
        'https://app.visiobook.com/success',
        'https://app.visiobook.com/cancel',
      );

      expect(mockStripeAdapter.createCustomer).not.toHaveBeenCalled();
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel an active subscription', async () => {
      await service.cancelSubscription('user-123');

      expect(mockStripeAdapter.cancelSubscription).toHaveBeenCalledWith('sub_test_123');
      expect(mockDatabaseClient.updateSubscriptionStatus).toHaveBeenCalledWith(
        'sub-entity-123',
        'canceled',
      );
    });

    it('should throw when no active subscription', async () => {
      mockDatabaseClient.getSubscriptionByUserId.mockResolvedValueOnce(null);

      await expect(service.cancelSubscription('user-no-sub')).rejects.toThrow(SubscriptionNotFoundException);
    });
  });

  describe('activateSubscription', () => {
    it('should activate subscription and upsert quota', async () => {
      await service.activateSubscription(
        'user-123',
        'cus_test_123',
        'sub_test_123',
        'premium',
        new Date().toISOString(),
        new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      );

      expect(mockDatabaseClient.upsertSubscription).toHaveBeenCalled();
      expect(mockDatabaseClient.upsertQuota).toHaveBeenCalled();
    });
  });

  describe('upgradePlan', () => {
    it('should upgrade from premium to enterprise', async () => {
      await service.upgradePlan('user-123', 'enterprise');

      expect(mockStripeAdapter.updateSubscription).toHaveBeenCalledWith(
        'sub_test_123',
        expect.any(String),
        true,
      );
      expect(mockDatabaseClient.updateSubscriptionPlan).toHaveBeenCalledWith('sub-entity-123', 'enterprise');
      expect(mockDatabaseClient.upsertQuota).toHaveBeenCalled();
    });

    it('should throw InvalidPlanException for invalid plan', async () => {
      await expect(service.upgradePlan('user-123', 'invalid')).rejects.toThrow(InvalidPlanException);
    });

    it('should throw InvalidPlanException for free plan (no stripePriceId)', async () => {
      await expect(service.upgradePlan('user-123', 'free')).rejects.toThrow(InvalidPlanException);
    });

    it('should throw SubscriptionNotFoundException when no active subscription', async () => {
      mockDatabaseClient.getSubscriptionByUserId.mockResolvedValueOnce(null);
      await expect(service.upgradePlan('user-123', 'enterprise')).rejects.toThrow(SubscriptionNotFoundException);
    });

    it('should throw InvalidPlanException when target plan is not higher', async () => {
      await expect(service.upgradePlan('user-123', 'premium')).rejects.toThrow(InvalidPlanException);
    });

    it('should throw StripeException when Stripe call fails', async () => {
      mockStripeAdapter.updateSubscription.mockRejectedValueOnce(new Error('Stripe API error'));
      await expect(service.upgradePlan('user-123', 'enterprise')).rejects.toThrow(StripeException);
    });
  });

  describe('downgradePlan', () => {
    it('should downgrade from enterprise to premium', async () => {
      mockDatabaseClient.getSubscriptionByUserId.mockResolvedValueOnce({
        ...mockSubscriptionEntity,
        planId: 'enterprise',
      });

      await service.downgradePlan('user-123', 'premium');

      expect(mockStripeAdapter.updateSubscription).toHaveBeenCalledWith(
        'sub_test_123',
        expect.any(String),
        false,
      );
      expect(mockDatabaseClient.updateSubscriptionPlan).toHaveBeenCalledWith('sub-entity-123', 'premium');
    });

    it('should throw InvalidPlanException for invalid plan', async () => {
      await expect(service.downgradePlan('user-123', 'invalid')).rejects.toThrow(InvalidPlanException);
    });

    it('should throw SubscriptionNotFoundException when no active subscription', async () => {
      mockDatabaseClient.getSubscriptionByUserId.mockResolvedValueOnce(null);
      await expect(service.downgradePlan('user-123', 'premium')).rejects.toThrow(SubscriptionNotFoundException);
    });

    it('should throw InvalidPlanException when target plan is not lower', async () => {
      await expect(service.downgradePlan('user-123', 'enterprise')).rejects.toThrow(InvalidPlanException);
    });

    it('should throw StripeException when Stripe call fails', async () => {
      mockDatabaseClient.getSubscriptionByUserId.mockResolvedValueOnce({
        ...mockSubscriptionEntity,
        planId: 'enterprise',
      });
      mockStripeAdapter.updateSubscription.mockRejectedValueOnce(new Error('Stripe API error'));
      await expect(service.downgradePlan('user-123', 'premium')).rejects.toThrow(StripeException);
    });
  });

  describe('createPaymentIntent', () => {
    it('should create a new customer and return clientSecret, customerId, ephemeralKey, subscriptionId', async () => {
      mockDatabaseClient.getSubscriptionByUserId.mockResolvedValueOnce(null);

      const result = await service.createPaymentIntent('user-123', 'premium');

      expect(mockStripeAdapter.createCustomer).toHaveBeenCalledWith('user-123');
      expect(mockStripeAdapter.createSubscriptionWithPaymentIntent).toHaveBeenCalledWith({
        customerId: mockStripeCustomer.id,
        priceId: 'price_1TAVJXHhqOObOnmXf8SOVKMG',
        userId: 'user-123',
        planId: 'premium',
      });
      expect(mockStripeAdapter.createEphemeralKey).toHaveBeenCalledWith(mockStripeCustomer.id);
      expect(result).toEqual({
        clientSecret: mockPaymentIntentResponse.clientSecret,
        customerId: mockStripeCustomer.id,
        ephemeralKey: mockEphemeralKey,
        subscriptionId: mockPaymentIntentResponse.subscriptionId,
      });
    });

    it('should reuse existing stripeCustomerId when subscription exists (non-active)', async () => {
      mockDatabaseClient.getSubscriptionByUserId.mockResolvedValueOnce({
        ...mockSubscriptionEntity,
        status: 'canceled',
      });

      await service.createPaymentIntent('user-123', 'premium');

      expect(mockStripeAdapter.createCustomer).not.toHaveBeenCalled();
      expect(mockStripeAdapter.createSubscriptionWithPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: mockSubscriptionEntity.stripeCustomerId }),
      );
    });

    it('should select yearly priceId when interval is year', async () => {
      mockDatabaseClient.getSubscriptionByUserId.mockResolvedValueOnce(null);

      await service.createPaymentIntent('user-123', 'premium', 'year');

      expect(mockStripeAdapter.createSubscriptionWithPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ priceId: 'price_1TAVJXHhqOObOnmXvilu4kwL' }),
      );
    });

    it('should throw InvalidPlanException for unknown plan', async () => {
      await expect(service.createPaymentIntent('user-123', 'unknown')).rejects.toThrow(
        InvalidPlanException,
      );
    });

    it('should throw InvalidPlanException for free plan', async () => {
      await expect(service.createPaymentIntent('user-123', 'free')).rejects.toThrow(
        InvalidPlanException,
      );
    });

    it('should throw BadRequestException when user already has active subscription', async () => {
      await expect(service.createPaymentIntent('user-123', 'premium')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('createPortalSession', () => {
    it('should return portal URL', async () => {
      const result = await service.createPortalSession('user-123');
      expect(result).toHaveProperty('portalUrl');
      expect(mockStripeAdapter.createPortalSession).toHaveBeenCalledWith(
        'cus_test_123',
        'https://app.visiobook.com/settings',
      );
    });

    it('should use custom returnUrl when provided', async () => {
      await service.createPortalSession('user-123', 'https://custom.url/return');
      expect(mockStripeAdapter.createPortalSession).toHaveBeenCalledWith(
        'cus_test_123',
        'https://custom.url/return',
      );
    });

    it('should throw SubscriptionNotFoundException when no customer found', async () => {
      mockDatabaseClient.getSubscriptionByUserId.mockResolvedValueOnce(null);
      await expect(service.createPortalSession('user-no-sub')).rejects.toThrow(SubscriptionNotFoundException);
    });
  });
});
