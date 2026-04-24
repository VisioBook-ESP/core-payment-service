import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeAdapter } from '../adapters/stripe.adapter';
import { PLANS, getPlanById, PlanConfig } from '../config/plans.config';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { DatabaseClient } from '../services/database.client';
import { getTokensForPlan } from '../tokens/tokens.controller';
import {
  SubscriptionNotFoundException,
  InvalidPlanException,
  StripeException,
} from '../common/payment.exceptions';

const PLAN_ORDER: Record<string, number> = { free: 0, premium: 1, enterprise: 2 };

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly stripeAdapter: StripeAdapter,
    private readonly databaseClient: DatabaseClient,
    private readonly config: ConfigService,
  ) {}

  getPlans(): PlanConfig[] {
    return PLANS.map(({ stripePriceId: _strip, ...plan }) => plan as PlanConfig);
  }

  async getCurrentSubscription(userId: string): Promise<SubscriptionEntity | null> {
    return this.databaseClient.getSubscriptionByUserId(userId);
  }

  async createCheckoutSession(
    userId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string,
    interval: 'month' | 'year' = 'month',
  ): Promise<{ sessionId: string; checkoutUrl: string }> {
    const plan = getPlanById(planId);
    if (!plan) {
      throw new InvalidPlanException(`Plan '${planId}' not found`);
    }

    const priceId = interval === 'year' ? plan.stripePriceIdYearly : plan.stripePriceId;
    if (!priceId) {
      throw new InvalidPlanException('Cannot checkout for free plan');
    }

    const existing = await this.databaseClient.getSubscriptionByUserId(userId);
    if (existing && existing.status === 'active') {
      throw new BadRequestException('User already has an active subscription');
    }

    let stripeCustomerId: string;
    if (existing?.stripeCustomerId) {
      stripeCustomerId = existing.stripeCustomerId;
    } else {
      const customer = await this.stripeAdapter.createCustomer(userId);
      stripeCustomerId = customer.id;
    }

    const session = await this.stripeAdapter.createCheckoutSession({
      customerId: stripeCustomerId,
      priceId,
      successUrl,
      cancelUrl,
    });

    this.logger.log(`Checkout session created: ${session.id} for user ${userId}`);

    return {
      sessionId: session.id,
      checkoutUrl: session.url!,
    };
  }

  async cancelSubscription(userId: string): Promise<void> {
    const subscription = await this.databaseClient.getSubscriptionByUserId(userId);
    if (!subscription || subscription.status !== 'active') {
      throw new SubscriptionNotFoundException('No active subscription found');
    }

    await this.stripeAdapter.cancelSubscription(subscription.stripeSubscriptionId);
    await this.databaseClient.updateSubscriptionStatus(subscription.id, 'canceled');

    this.logger.log(`Subscription canceled for user ${userId}`);
  }

  async activateSubscription(
    userId: string,
    stripeCustomerId: string,
    stripeSubscriptionId: string,
    planId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<void> {
    await this.databaseClient.upsertSubscription({
      userId,
      stripeCustomerId,
      stripeSubscriptionId,
      planId,
      status: 'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });

    const plan = getPlanById(planId);
    if (plan) {
      await this.databaseClient.upsertQuota({
        userId,
        planId,
        generationsLimit: plan.limits.generationsPerMonth,
        storageLimit: plan.limits.storageGB * 1024 * 1024 * 1024,
        tokensLimit: getTokensForPlan(this.config, planId),
      });
    }

    this.logger.log(`Subscription activated for user ${userId}, plan ${planId}`);
  }

  async upgradePlan(userId: string, newPlanId: string): Promise<void> {
    const newPlan = getPlanById(newPlanId);
    if (!newPlan || !newPlan.stripePriceId) {
      throw new InvalidPlanException(`Plan '${newPlanId}' is not valid for upgrade`);
    }

    const subscription = await this.databaseClient.getSubscriptionByUserId(userId);
    if (!subscription || subscription.status !== 'active') {
      throw new SubscriptionNotFoundException('No active subscription found');
    }

    const currentOrder = PLAN_ORDER[subscription.planId] ?? -1;
    const newOrder = PLAN_ORDER[newPlanId] ?? -1;
    if (newOrder <= currentOrder) {
      throw new InvalidPlanException('Target plan must be higher than current plan for upgrade');
    }

    try {
      await this.stripeAdapter.updateSubscription(
        subscription.stripeSubscriptionId,
        newPlan.stripePriceId,
        true,
      );
    } catch (err) {
      throw new StripeException(`Failed to update subscription: ${(err as Error).message}`);
    }

    await this.databaseClient.updateSubscriptionPlan(subscription.id, newPlanId);

    const plan = getPlanById(newPlanId);
    if (plan) {
      await this.databaseClient.upsertQuota({
        userId,
        planId: newPlanId,
        generationsLimit: plan.limits.generationsPerMonth,
        storageLimit: plan.limits.storageGB * 1024 * 1024 * 1024,
        tokensLimit: getTokensForPlan(this.config, newPlanId),
      });
    }

    this.logger.log(
      `Subscription upgraded for user ${userId}: ${subscription.planId} -> ${newPlanId}`,
    );
  }

  async downgradePlan(userId: string, newPlanId: string): Promise<void> {
    const newPlan = getPlanById(newPlanId);
    if (!newPlan || !newPlan.stripePriceId) {
      throw new InvalidPlanException(`Plan '${newPlanId}' is not valid for downgrade`);
    }

    const subscription = await this.databaseClient.getSubscriptionByUserId(userId);
    if (!subscription || subscription.status !== 'active') {
      throw new SubscriptionNotFoundException('No active subscription found');
    }

    const currentOrder = PLAN_ORDER[subscription.planId] ?? -1;
    const newOrder = PLAN_ORDER[newPlanId] ?? -1;
    if (newOrder >= currentOrder) {
      throw new InvalidPlanException('Target plan must be lower than current plan for downgrade');
    }

    try {
      await this.stripeAdapter.updateSubscription(
        subscription.stripeSubscriptionId,
        newPlan.stripePriceId,
        false,
      );
    } catch (err) {
      throw new StripeException(`Failed to update subscription: ${(err as Error).message}`);
    }

    await this.databaseClient.updateSubscriptionPlan(subscription.id, newPlanId);

    this.logger.log(
      `Subscription downgraded for user ${userId}: ${subscription.planId} -> ${newPlanId}`,
    );
  }

  async createPaymentIntent(
    userId: string,
    planId: string,
    interval: 'month' | 'year' = 'month',
  ): Promise<{ clientSecret: string; customerId: string; ephemeralKey: string; subscriptionId: string }> {
    const plan = getPlanById(planId);
    if (!plan) {
      throw new InvalidPlanException(`Plan '${planId}' not found`);
    }

    const priceId = interval === 'year' ? plan.stripePriceIdYearly : plan.stripePriceId;
    if (!priceId) {
      throw new InvalidPlanException('Cannot subscribe to free plan');
    }

    const existing = await this.databaseClient.getSubscriptionByUserId(userId);
    if (existing && existing.status === 'active') {
      throw new BadRequestException('User already has an active subscription');
    }

    let stripeCustomerId: string;
    if (existing?.stripeCustomerId) {
      stripeCustomerId = existing.stripeCustomerId;
    } else {
      const customer = await this.stripeAdapter.createCustomer(userId);
      stripeCustomerId = customer.id;
    }

    const { clientSecret, subscriptionId } =
      await this.stripeAdapter.createSubscriptionWithPaymentIntent({
        customerId: stripeCustomerId,
        priceId,
        userId,
        planId,
      });

    const ephemeralKey = await this.stripeAdapter.createEphemeralKey(stripeCustomerId);

    this.logger.log(`PaymentIntent created: subscription ${subscriptionId} for user ${userId}`);

    return { clientSecret, customerId: stripeCustomerId, ephemeralKey, subscriptionId };
  }

  async createPortalSession(userId: string, returnUrl?: string): Promise<{ portalUrl: string }> {
    const subscription = await this.databaseClient.getSubscriptionByUserId(userId);
    if (!subscription?.stripeCustomerId) {
      throw new SubscriptionNotFoundException('No Stripe customer found for user');
    }

    const defaultReturnUrl = 'https://app.visiobook.com/settings';
    const session = await this.stripeAdapter.createPortalSession(
      subscription.stripeCustomerId,
      returnUrl ?? defaultReturnUrl,
    );

    return { portalUrl: session.url };
  }
}
