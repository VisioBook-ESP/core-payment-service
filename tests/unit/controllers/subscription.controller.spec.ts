import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SubscriptionController } from '../../../src/subscription/subscription.controller';
import { SubscriptionService } from '../../../src/subscription/subscription.service';
import { UserIdGuard } from '../../../src/guards/user-id.guard';
import { PLANS } from '../../../src/config/plans.config';
import { mockSubscriptionEntity } from '../../mocks/database.mock';

describe('SubscriptionController', () => {
  let controller: SubscriptionController;
  const mockSubscriptionService = {
    getPlans: jest.fn().mockReturnValue(PLANS),
    getCurrentSubscription: jest.fn().mockResolvedValue(mockSubscriptionEntity),
    createCheckoutSession: jest.fn().mockResolvedValue({
      sessionId: 'cs_test_123',
      checkoutUrl: 'https://checkout.stripe.com/test',
    }),
    cancelSubscription: jest.fn().mockResolvedValue(undefined),
    upgradePlan: jest.fn().mockResolvedValue(undefined),
    downgradePlan: jest.fn().mockResolvedValue(undefined),
    createPortalSession: jest.fn().mockResolvedValue({ portalUrl: 'https://billing.stripe.com/test' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionController],
      providers: [{ provide: SubscriptionService, useValue: mockSubscriptionService }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(UserIdGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SubscriptionController>(SubscriptionController);
  });

  describe('getPlans', () => {
    it('should return all plans', () => {
      const result = controller.getPlans();
      expect(result).toHaveLength(3);
      expect(mockSubscriptionService.getPlans).toHaveBeenCalled();
    });
  });

  describe('getCurrentSubscription', () => {
    it('should return current subscription', async () => {
      const req = { user: { userId: 'user-123', email: 'test@test.com', tier: 'free' } } as any;
      const result = await controller.getCurrentSubscription(req);
      expect(result).toEqual(mockSubscriptionEntity);
    });
  });

  describe('createCheckout', () => {
    it('should create checkout session', async () => {
      const req = { user: { userId: 'user-123', email: 'test@test.com', tier: 'free' } } as any;
      const dto = {
        planId: 'premium',
        successUrl: 'https://app.visiobook.com/success',
        cancelUrl: 'https://app.visiobook.com/cancel',
      };

      const result = await controller.createCheckout(req, dto);

      expect(result.sessionId).toBe('cs_test_123');
      expect(result.checkoutUrl).toBe('https://checkout.stripe.com/test');
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription', async () => {
      const req = { user: { userId: 'user-123', email: 'test@test.com', tier: 'free' } } as any;
      const result = await controller.cancelSubscription(req);
      expect(result.message).toBe('Subscription canceled successfully');
    });
  });

  describe('upgradePlan', () => {
    it('should upgrade plan and return message', async () => {
      const req = { user: { userId: 'user-123', email: 'test@test.com', tier: 'premium' } } as any;
      const result = await controller.upgradePlan(req, { planId: 'enterprise' });
      expect(result.message).toBe('Subscription upgraded to enterprise');
      expect(mockSubscriptionService.upgradePlan).toHaveBeenCalledWith('user-123', 'enterprise');
    });
  });

  describe('downgradePlan', () => {
    it('should downgrade plan and return message', async () => {
      const req = { user: { userId: 'user-123', email: 'test@test.com', tier: 'enterprise' } } as any;
      const result = await controller.downgradePlan(req, { planId: 'premium' });
      expect(result.message).toBe('Subscription downgraded to premium');
      expect(mockSubscriptionService.downgradePlan).toHaveBeenCalledWith('user-123', 'premium');
    });
  });

  describe('getPortalSession', () => {
    it('should return portal URL', async () => {
      const req = { user: { userId: 'user-123', email: 'test@test.com', tier: 'premium' } } as any;
      const result = await controller.getPortalSession(req, 'https://app.visiobook.com/settings');
      expect(result).toHaveProperty('portalUrl');
      expect(mockSubscriptionService.createPortalSession).toHaveBeenCalledWith('user-123', 'https://app.visiobook.com/settings');
    });
  });
});
