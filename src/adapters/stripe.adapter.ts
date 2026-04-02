import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeAdapter {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeAdapter.name);

  constructor(private readonly configService: ConfigService) {
    this.stripe = new Stripe(this.configService.getOrThrow<string>('STRIPE_SECRET_KEY'), {
      apiVersion: '2025-02-24.acacia',
    });
  }

  async createCustomer(email: string, name?: string): Promise<Stripe.Customer> {
    this.logger.log(`Creating Stripe customer for ${email}`);
    return this.stripe.customers.create({ email, name });
  }

  async createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<Stripe.Checkout.Session> {
    this.logger.log(`Creating checkout session for customer ${params.customerId}`);
    return this.stripe.checkout.sessions.create({
      customer: params.customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    this.logger.log(`Canceling subscription ${subscriptionId}`);
    return this.stripe.subscriptions.cancel(subscriptionId);
  }

  async updateSubscription(
    subscriptionId: string,
    newPriceId: string,
    prorate: boolean,
  ): Promise<Stripe.Subscription> {
    this.logger.log(`Updating subscription ${subscriptionId} to price ${newPriceId}`);
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    const itemId = subscription.items.data[0]?.id;
    return this.stripe.subscriptions.update(subscriptionId, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: prorate ? 'create_prorations' : 'none',
    });
  }

  async createPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<Stripe.BillingPortal.Session> {
    return this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  async createSubscriptionWithPaymentIntent(params: {
    customerId: string;
    priceId: string;
    userId: string;
    planId: string;
  }): Promise<{ clientSecret: string; subscriptionId: string }> {
    this.logger.log(`Creating subscription with PaymentIntent for customer ${params.customerId}`);
    const subscription = await this.stripe.subscriptions.create({
      customer: params.customerId,
      items: [{ price: params.priceId, quantity: 1 }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: { userId: params.userId, planId: params.planId },
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

    return {
      clientSecret: paymentIntent.client_secret!,
      subscriptionId: subscription.id,
    };
  }

  async createEphemeralKey(customerId: string): Promise<string> {
    this.logger.log(`Creating ephemeral key for customer ${customerId}`);
    const key = await this.stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2025-02-24.acacia' },
    );
    return key.secret!;
  }

  verifyWebhookSignature(payload: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.configService.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }
}
