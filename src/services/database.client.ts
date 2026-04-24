import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionEntity, SubscriptionStatus } from '../entities/subscription.entity';
import { QuotaEntity } from '../entities/quota.entity';
import { TransactionEntity, TransactionStatus } from '../entities/transaction.entity';

const QUOTA_FIELD_MAP: Record<string, keyof QuotaEntity> = {
  generations_used: 'generationsUsed',
  storage_used: 'storageUsed',
};

@Injectable()
export class DatabaseClient {
  private readonly logger = new Logger(DatabaseClient.name);

  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepo: Repository<SubscriptionEntity>,
    @InjectRepository(QuotaEntity)
    private readonly quotaRepo: Repository<QuotaEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
  ) {}

  async getSubscriptionByUserId(userId: string): Promise<SubscriptionEntity | null> {
    try {
      return await this.subscriptionRepo.findOne({ where: { userId } });
    } catch (error) {
      this.logger.warn(`Failed to get subscription for user ${userId}: ${error}`);
      return null;
    }
  }

  async upsertSubscription(params: {
    userId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    planId: string;
    status: SubscriptionStatus;
    currentPeriodStart: string;
    currentPeriodEnd: string;
  }): Promise<SubscriptionEntity> {
    const existing = await this.subscriptionRepo.findOne({ where: { userId: params.userId } });
    if (existing) {
      Object.assign(existing, params);
      return this.subscriptionRepo.save(existing);
    }
    return this.subscriptionRepo.save(this.subscriptionRepo.create(params));
  }

  async updateSubscriptionStatus(
    subscriptionId: string,
    status: SubscriptionStatus,
  ): Promise<void> {
    await this.subscriptionRepo.update({ id: subscriptionId }, { status });
  }

  async updateSubscriptionStatusByStripeId(
    stripeSubscriptionId: string,
    status: SubscriptionStatus,
  ): Promise<void> {
    await this.subscriptionRepo.update({ stripeSubscriptionId }, { status });
  }

  async getQuotaByUserId(userId: string): Promise<QuotaEntity | null> {
    try {
      return await this.quotaRepo.findOne({ where: { userId } });
    } catch (error) {
      this.logger.warn(`Failed to get quota for user ${userId}: ${error}`);
      return null;
    }
  }

  async upsertQuota(params: {
    userId: string;
    planId: string;
    generationsLimit: number;
    storageLimit: number;
    tokensLimit?: number;
  }): Promise<QuotaEntity> {
    const existing = await this.quotaRepo.findOne({ where: { userId: params.userId } });
    if (existing) {
      existing.planId = params.planId;
      existing.generationsLimit = params.generationsLimit;
      existing.storageLimit = params.storageLimit;
      if (params.tokensLimit !== undefined) {
        existing.tokensLimit = params.tokensLimit;
      }
      return this.quotaRepo.save(existing);
    }
    return this.quotaRepo.save(
      this.quotaRepo.create({
        userId: params.userId,
        planId: params.planId,
        generationsLimit: params.generationsLimit,
        storageLimit: params.storageLimit,
        generationsUsed: 0,
        storageUsed: 0,
        tokensUsed: 0,
        tokensLimit: params.tokensLimit ?? 0,
        resetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
      }),
    );
  }

  async updateQuotaUsage(
    userId: string,
    field: 'generations_used' | 'storage_used',
    increment: number,
  ): Promise<QuotaEntity> {
    const entityField = QUOTA_FIELD_MAP[field] ?? field;
    await this.quotaRepo.increment({ userId }, entityField, increment);
    return (await this.quotaRepo.findOne({ where: { userId } }))!;
  }

  async updateSubscriptionPlan(subscriptionId: string, planId: string): Promise<void> {
    await this.subscriptionRepo.update({ id: subscriptionId }, { planId });
  }

  async resetQuotaUsage(userId: string, resetDate: string): Promise<void> {
    await this.quotaRepo.update(
      { userId },
      { generationsUsed: 0, storageUsed: 0, resetDate },
    );
  }

  async createTransaction(params: {
    userId: string;
    stripePaymentIntentId: string;
    amount: number;
    currency: string;
    status: TransactionStatus;
  }): Promise<void> {
    await this.transactionRepo.save(this.transactionRepo.create(params));
  }
}
