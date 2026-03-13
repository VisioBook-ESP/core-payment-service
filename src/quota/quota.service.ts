import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseClient } from '../services/database.client';
import { getPlanById } from '../config/plans.config';
import { QuotaResponseDto, ConsumeQuotaResponseDto } from '../dto/quota-response.dto';

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(private readonly databaseClient: DatabaseClient) {}

  async getUserQuota(userId: string): Promise<QuotaResponseDto> {
    const quota = await this.databaseClient.getQuotaByUserId(userId);

    if (!quota) {
      const freePlan = getPlanById('free')!;
      return {
        userId,
        plan: 'free',
        generations: {
          used: 0,
          limit: freePlan.limits.generationsPerMonth,
          resetDate: this.getNextResetDate(),
        },
        storage: {
          used: 0,
          limit: freePlan.limits.storageGB * 1024 * 1024 * 1024,
        },
      };
    }

    return {
      userId: quota.userId,
      plan: quota.planId,
      generations: {
        used: quota.generationsUsed,
        limit: quota.generationsLimit,
        resetDate: quota.resetDate,
      },
      storage: {
        used: quota.storageUsed,
        limit: quota.storageLimit,
      },
    };
  }

  async consumeQuota(
    userId: string,
    type: 'generation' | 'storage',
    amount: number,
  ): Promise<ConsumeQuotaResponseDto> {
    const quota = await this.databaseClient.getQuotaByUserId(userId);

    if (!quota) {
      throw new NotFoundException('Quota not found for user');
    }

    if (type === 'generation') {
      if (quota.generationsLimit !== -1 && quota.generationsUsed + amount > quota.generationsLimit) {
        return {
          success: false,
          remaining: Math.max(0, quota.generationsLimit - quota.generationsUsed),
          error: 'QUOTA_EXCEEDED',
        };
      }
      await this.databaseClient.updateQuotaUsage(userId, 'generations_used', amount);
      const remaining =
        quota.generationsLimit === -1 ? -1 : quota.generationsLimit - quota.generationsUsed - amount;
      this.logger.log(`User ${userId} consumed ${amount} generation(s), ${remaining} remaining`);
      return { success: true, remaining };
    }

    if (type === 'storage') {
      if (quota.storageUsed + amount > quota.storageLimit) {
        return {
          success: false,
          remaining: Math.max(0, quota.storageLimit - quota.storageUsed),
          error: 'QUOTA_EXCEEDED',
        };
      }
      await this.databaseClient.updateQuotaUsage(userId, 'storage_used', amount);
      const remaining = quota.storageLimit - quota.storageUsed - amount;
      this.logger.log(`User ${userId} consumed ${amount} bytes storage, ${remaining} remaining`);
      return { success: true, remaining };
    }

    throw new BadRequestException(`Invalid quota type: ${type}`);
  }

  async resetQuota(userId: string): Promise<void> {
    const quota = await this.databaseClient.getQuotaByUserId(userId);
    if (!quota) {
      throw new NotFoundException('Quota not found for user');
    }
    const resetDate = this.getNextResetDate();
    await this.databaseClient.resetQuotaUsage(userId, resetDate);
    this.logger.log(`Quota reset for user ${userId}`);
  }

  async checkQuotaAvailable(userId: string, type: 'generation' | 'storage'): Promise<boolean> {
    const quota = await this.databaseClient.getQuotaByUserId(userId);
    if (!quota) return false;

    if (type === 'generation') {
      return quota.generationsLimit === -1 || quota.generationsUsed < quota.generationsLimit;
    }
    return quota.storageUsed < quota.storageLimit;
  }

  private getNextResetDate(): string {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth.toISOString();
  }
}
