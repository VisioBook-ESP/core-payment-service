import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SubscriptionController } from '../../../src/subscription/subscription.controller';
import { SubscriptionService } from '../../../src/subscription/subscription.service';
import { JwtAuthGuard } from '../../../src/guards/jwt-auth.guard';
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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionController],
      providers: [
        { provide: SubscriptionService, useValue: mockSubscriptionService },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
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
});
