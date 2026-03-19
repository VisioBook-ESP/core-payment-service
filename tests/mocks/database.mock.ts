import { SubscriptionEntity } from '../../src/entities/subscription.entity';
import { QuotaEntity } from '../../src/entities/quota.entity';

export const mockSubscriptionEntity: SubscriptionEntity = {
  id: 'sub-entity-123',
  userId: 'user-123',
  stripeCustomerId: 'cus_test_123',
  stripeSubscriptionId: 'sub_test_123',
  planId: 'premium',
  status: 'active',
  currentPeriodStart: new Date().toISOString(),
  currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const mockQuotaEntity: QuotaEntity = {
  id: 'quota-123',
  userId: 'user-123',
  planId: 'premium',
  generationsUsed: 5,
  generationsLimit: 50,
  storageUsed: 1024 * 1024 * 100,
  storageLimit: 10 * 1024 * 1024 * 1024,
  resetDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const mockDatabaseClient = {
  getSubscriptionByUserId: jest.fn().mockResolvedValue(mockSubscriptionEntity),
  upsertSubscription: jest.fn().mockResolvedValue(mockSubscriptionEntity),
  updateSubscriptionStatus: jest.fn().mockResolvedValue(undefined),
  updateSubscriptionStatusByStripeId: jest.fn().mockResolvedValue(undefined),
  getQuotaByUserId: jest.fn().mockResolvedValue(mockQuotaEntity),
  upsertQuota: jest.fn().mockResolvedValue(mockQuotaEntity),
  updateQuotaUsage: jest.fn().mockResolvedValue(mockQuotaEntity),
  createTransaction: jest.fn().mockResolvedValue(undefined),
};
