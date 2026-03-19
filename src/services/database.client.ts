import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SubscriptionEntity, SubscriptionStatus } from '../entities/subscription.entity';
import { QuotaEntity } from '../entities/quota.entity';

@Injectable()
export class DatabaseClient {
  private readonly logger = new Logger(DatabaseClient.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.getOrThrow<string>('DATABASE_SERVICE_URL');
  }

  async getSubscriptionByUserId(userId: string): Promise<SubscriptionEntity | null> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/v1/query`, {
          table: 'subscriptions',
          operation: 'findOne',
          where: { user_id: userId },
        }),
      );
      return data.result || null;
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
    const { data } = await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/api/v1/query`, {
        table: 'subscriptions',
        operation: 'upsert',
        where: { user_id: params.userId },
        data: {
          user_id: params.userId,
          stripe_customer_id: params.stripeCustomerId,
          stripe_subscription_id: params.stripeSubscriptionId,
          plan_id: params.planId,
          status: params.status,
          current_period_start: params.currentPeriodStart,
          current_period_end: params.currentPeriodEnd,
        },
      }),
    );
    return data.result;
  }

  async updateSubscriptionStatus(
    subscriptionId: string,
    status: SubscriptionStatus,
  ): Promise<void> {
    await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/api/v1/query`, {
        table: 'subscriptions',
        operation: 'update',
        where: { id: subscriptionId },
        data: { status },
      }),
    );
  }

  async updateSubscriptionStatusByStripeId(
    stripeSubscriptionId: string,
    status: SubscriptionStatus,
  ): Promise<void> {
    await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/api/v1/query`, {
        table: 'subscriptions',
        operation: 'update',
        where: { stripe_subscription_id: stripeSubscriptionId },
        data: { status },
      }),
    );
  }

  async getQuotaByUserId(userId: string): Promise<QuotaEntity | null> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/v1/query`, {
          table: 'quotas',
          operation: 'findOne',
          where: { user_id: userId },
        }),
      );
      return data.result || null;
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
  }): Promise<QuotaEntity> {
    const { data } = await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/api/v1/query`, {
        table: 'quotas',
        operation: 'upsert',
        where: { user_id: params.userId },
        data: {
          user_id: params.userId,
          plan_id: params.planId,
          generations_limit: params.generationsLimit,
          storage_limit: params.storageLimit,
        },
      }),
    );
    return data.result;
  }

  async updateQuotaUsage(
    userId: string,
    field: 'generations_used' | 'storage_used',
    increment: number,
  ): Promise<QuotaEntity> {
    const { data } = await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/api/v1/query`, {
        table: 'quotas',
        operation: 'increment',
        where: { user_id: userId },
        data: { [field]: increment },
      }),
    );
    return data.result;
  }

  async updateSubscriptionPlan(subscriptionId: string, planId: string): Promise<void> {
    await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/api/v1/query`, {
        table: 'subscriptions',
        operation: 'update',
        where: { id: subscriptionId },
        data: { plan_id: planId },
      }),
    );
  }

  async resetQuotaUsage(userId: string, resetDate: string): Promise<void> {
    await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/api/v1/query`, {
        table: 'quotas',
        operation: 'update',
        where: { user_id: userId },
        data: { generations_used: 0, storage_used: 0, reset_date: resetDate },
      }),
    );
  }

  async createTransaction(params: {
    userId: string;
    stripePaymentIntentId: string;
    amount: number;
    currency: string;
    status: string;
  }): Promise<void> {
    await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/api/v1/query`, {
        table: 'transactions',
        operation: 'create',
        data: {
          user_id: params.userId,
          stripe_payment_intent_id: params.stripePaymentIntentId,
          amount: params.amount,
          currency: params.currency,
          status: params.status,
        },
      }),
    );
  }
}
