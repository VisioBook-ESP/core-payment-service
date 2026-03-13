import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { QuotaService } from '../../../src/quota/quota.service';
import { DatabaseClient } from '../../../src/services/database.client';
import { mockDatabaseClient, mockQuotaEntity } from '../../mocks/database.mock';

describe('QuotaService', () => {
  let service: QuotaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaService,
        { provide: DatabaseClient, useValue: mockDatabaseClient },
      ],
    }).compile();

    service = module.get<QuotaService>(QuotaService);
  });

  describe('getUserQuota', () => {
    it('should return user quota', async () => {
      const result = await service.getUserQuota('user-123');

      expect(result.userId).toBe('user-123');
      expect(result.plan).toBe('premium');
      expect(result.generations.used).toBe(5);
      expect(result.generations.limit).toBe(50);
    });

    it('should return free plan defaults when no quota exists', async () => {
      mockDatabaseClient.getQuotaByUserId.mockResolvedValueOnce(null);

      const result = await service.getUserQuota('user-new');

      expect(result.plan).toBe('free');
      expect(result.generations.used).toBe(0);
      expect(result.generations.limit).toBe(3);
    });
  });

  describe('consumeQuota', () => {
    it('should consume generation quota successfully', async () => {
      const result = await service.consumeQuota('user-123', 'generation', 1);

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(44); // 50 - 5 - 1
      expect(mockDatabaseClient.updateQuotaUsage).toHaveBeenCalledWith(
        'user-123',
        'generations_used',
        1,
      );
    });

    it('should reject when generation quota exceeded', async () => {
      mockDatabaseClient.getQuotaByUserId.mockResolvedValueOnce({
        ...mockQuotaEntity,
        generationsUsed: 50,
        generationsLimit: 50,
      });

      const result = await service.consumeQuota('user-123', 'generation', 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('QUOTA_EXCEEDED');
      expect(result.remaining).toBe(0);
    });

    it('should consume storage quota successfully', async () => {
      const result = await service.consumeQuota('user-123', 'storage', 1024);

      expect(result.success).toBe(true);
      expect(mockDatabaseClient.updateQuotaUsage).toHaveBeenCalledWith(
        'user-123',
        'storage_used',
        1024,
      );
    });

    it('should reject when storage quota exceeded', async () => {
      mockDatabaseClient.getQuotaByUserId.mockResolvedValueOnce({
        ...mockQuotaEntity,
        storageUsed: 10 * 1024 * 1024 * 1024,
        storageLimit: 10 * 1024 * 1024 * 1024,
      });

      const result = await service.consumeQuota('user-123', 'storage', 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('QUOTA_EXCEEDED');
    });

    it('should throw when quota not found', async () => {
      mockDatabaseClient.getQuotaByUserId.mockResolvedValueOnce(null);

      await expect(service.consumeQuota('user-unknown', 'generation', 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should allow unlimited generations (limit = -1)', async () => {
      mockDatabaseClient.getQuotaByUserId.mockResolvedValueOnce({
        ...mockQuotaEntity,
        planId: 'enterprise',
        generationsLimit: -1,
        generationsUsed: 1000,
      });

      const result = await service.consumeQuota('user-123', 'generation', 1);

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(-1);
    });
  });

  describe('checkQuotaAvailable', () => {
    it('should return true when quota available', async () => {
      const result = await service.checkQuotaAvailable('user-123', 'generation');
      expect(result).toBe(true);
    });

    it('should return false when no quota record', async () => {
      mockDatabaseClient.getQuotaByUserId.mockResolvedValueOnce(null);
      const result = await service.checkQuotaAvailable('user-unknown', 'generation');
      expect(result).toBe(false);
    });

    it('should return false when quota exhausted', async () => {
      mockDatabaseClient.getQuotaByUserId.mockResolvedValueOnce({
        ...mockQuotaEntity,
        generationsUsed: 50,
        generationsLimit: 50,
      });
      const result = await service.checkQuotaAvailable('user-123', 'generation');
      expect(result).toBe(false);
    });
  });
});
