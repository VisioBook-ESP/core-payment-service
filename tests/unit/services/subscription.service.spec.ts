import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { InvalidPlanException, SubscriptionNotFoundException } from '../../../src/common/payment.exceptions';
import { SubscriptionService } from '../../../src/subscription/subscription.service';
import { StripeAdapter } from '../../../src/adapters/stripe.adapter';
import { DatabaseClient } from '../../../src/services/database.client';
import { UserServiceClient } from '../../../src/services/user-service.client';
import { mockStripeAdapter } from '../../mocks/stripe.mock';
import { mockDatabaseClient, mockSubscriptionEntity } from '../../mocks/database.mock';
import { mockUserServiceClient, mockUserInfo } from '../../mocks/user-service.mock';

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: StripeAdapter, useValue: mockStripeAdapter },
        { provide: DatabaseClient, useValue: mockDatabaseClient },
        { provide: UserServiceClient, useValue: mockUserServiceClient },
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
      expect(mockStripeAdapter.createCustomer).toHaveBeenCalledWith(
        mockUserInfo.email,
        mockUserInfo.name,
      );
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
      expect(mockUserServiceClient.updateUserTier).toHaveBeenCalledWith('user-123', 'free');
    });

    it('should throw when no active subscription', async () => {
      mockDatabaseClient.getSubscriptionByUserId.mockResolvedValueOnce(null);

      await expect(service.cancelSubscription('user-no-sub')).rejects.toThrow(SubscriptionNotFoundException);
    });
  });

  describe('activateSubscription', () => {
    it('should activate subscription and update user tier', async () => {
      await service.activateSubscription(
        'user-123',
        'cus_test_123',
        'sub_test_123',
        'premium',
        new Date().toISOString(),
        new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      );

      expect(mockDatabaseClient.upsertSubscription).toHaveBeenCalled();
      expect(mockUserServiceClient.updateUserTier).toHaveBeenCalledWith('user-123', 'premium');
      expect(mockDatabaseClient.upsertQuota).toHaveBeenCalled();
    });
  });
});
