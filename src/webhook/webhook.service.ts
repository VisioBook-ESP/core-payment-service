import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { StripeAdapter } from '../adapters/stripe.adapter';
import { SubscriptionService } from '../subscription/subscription.service';
import { DatabaseClient } from '../services/database.client';
import { NotificationClient } from '../services/notification.client';
import { PLANS } from '../config/plans.config';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly stripeAdapter: StripeAdapter,
    private readonly subscriptionService: SubscriptionService,
    private readonly databaseClient: DatabaseClient,
    private readonly notificationClient: NotificationClient,
  ) {}

  async handleStripeEvent(event: Stripe.Event): Promise<void> {
    this.logger.log(`Processing Stripe event: ${event.type} (${event.id})`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        this.logger.warn(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    this.logger.log(`Checkout completed: ${session.id}`);

    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;
    const userId = session.metadata?.userId;

    if (!userId) {
      this.logger.error('No userId in checkout session metadata');
      return;
    }

    const planId = session.metadata?.planId || 'premium';

    const sub = await this.stripeAdapter.getSubscription(subscriptionId);

    await this.subscriptionService.activateSubscription(
      userId,
      customerId,
      subscriptionId,
      planId,
      new Date(sub.current_period_start * 1000).toISOString(),
      new Date(sub.current_period_end * 1000).toISOString(),
    );

    await this.notificationClient.sendSubscriptionConfirmation(userId, planId);
  }

  private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription created: ${subscription.id}, status: ${subscription.status}`);
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription updated: ${subscription.id}, status: ${subscription.status}`);

    const userId = subscription.metadata?.userId;
    if (!userId) return;

    // Derive planId from the actual price to handle upgrades/downgrades where metadata may be stale
    const priceId = subscription.items?.data[0]?.price?.id;
    const matchedPlan = PLANS.find(
      (p) => p.stripePriceId === priceId || p.stripePriceIdYearly === priceId,
    );
    const planId = matchedPlan?.id ?? subscription.metadata?.planId ?? 'premium';

    const customerId = subscription.customer as string;

    const statusMap: Record<string, 'active' | 'canceled' | 'past_due' | 'trialing'> = {
      active: 'active',
      trialing: 'trialing',
      canceled: 'canceled',
      past_due: 'past_due',
    };
    const internalStatus = statusMap[subscription.status] ?? 'past_due';

    if (internalStatus === 'active') {
      // Covers Payment Sheet flow (incomplete → active) and handles upgrade/downgrade idempotently
      await this.subscriptionService.activateSubscription(
        userId,
        customerId,
        subscription.id,
        planId,
        new Date(subscription.current_period_start * 1000).toISOString(),
        new Date(subscription.current_period_end * 1000).toISOString(),
      );
      await this.notificationClient.sendSubscriptionConfirmation(userId, planId);
    } else {
      await this.databaseClient.upsertSubscription({
        userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        planId,
        status: internalStatus,
        currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
      });
    }
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription deleted: ${subscription.id}`);

    const userId = subscription.metadata?.userId;
    if (!userId) return;

    await this.databaseClient.updateSubscriptionStatusByStripeId(subscription.id, 'canceled');
    await this.notificationClient.sendSubscriptionCanceled(userId);
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Invoice paid: ${invoice.id}, amount: ${invoice.amount_paid}`);

    const userId = invoice.subscription_details?.metadata?.userId;
    if (!userId) return;

    await this.databaseClient.createTransaction({
      userId,
      stripePaymentIntentId: (invoice.payment_intent as string) || invoice.id,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: 'succeeded',
    });
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Invoice payment failed: ${invoice.id}`);

    const userId = invoice.subscription_details?.metadata?.userId;
    if (!userId) return;

    await this.databaseClient.createTransaction({
      userId,
      stripePaymentIntentId: (invoice.payment_intent as string) || invoice.id,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: 'failed',
    });

    await this.notificationClient.sendPaymentFailed(userId);
  }
}
