import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { QuotaController } from '../../../src/quota/quota.controller';
import { QuotaService } from '../../../src/quota/quota.service';
import { UserIdGuard } from '../../../src/guards/user-id.guard';
import { ServiceKeyGuard } from '../../../src/guards/service-key.guard';

describe('QuotaController', () => {
  let controller: QuotaController;
  const mockQuotaService = {
    getUserQuota: jest.fn().mockResolvedValue({
      userId: 'user-123',
      plan: 'premium',
      generations: { used: 5, limit: 50, resetDate: new Date().toISOString() },
      storage: { used: 100, limit: 10737418240 },
    }),
    consumeQuota: jest.fn().mockResolvedValue({
      success: true,
      remaining: 44,
    }),
    resetQuota: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuotaController],
      providers: [{ provide: QuotaService, useValue: mockQuotaService }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(UserIdGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ServiceKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<QuotaController>(QuotaController);
  });

  describe('getUserQuota', () => {
    it('should return user quota', async () => {
      const req = { user: { userId: 'user-123', email: 'test@test.com', tier: 'free' } } as any;
      const result = await controller.getUserQuota(req);
      expect(result.plan).toBe('premium');
      expect(result.generations.used).toBe(5);
    });
  });

  describe('consumeQuota', () => {
    it('should consume quota', async () => {
      const result = await controller.consumeQuota({
        userId: 'user-123',
        type: 'generation',
        amount: 1,
      });
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(44);
    });
  });

  describe('resetQuota', () => {
    it('should reset quota and return success message', async () => {
      const result = await controller.resetQuota({ userId: 'user-123' });
      expect(result.message).toBe('Quota reset successfully');
      expect(mockQuotaService.resetQuota).toHaveBeenCalledWith('user-123');
    });
  });
});
