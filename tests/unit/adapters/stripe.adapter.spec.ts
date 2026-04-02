import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripeAdapter } from '../../../src/adapters/stripe.adapter';

jest.mock('stripe');

const mockStripeInstance = {
  customers: {
    create: jest.fn(),
  },
  checkout: {
    sessions: {
      create: jest.fn(),
    },
  },
  subscriptions: {
    retrieve: jest.fn(),
    cancel: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  billingPortal: {
    sessions: {
      create: jest.fn(),
    },
  },
  ephemeralKeys: {
    create: jest.fn(),
  },
  webhooks: {
    constructEvent: jest.fn(),
  },
};

(Stripe as unknown as jest.Mock).mockImplementation(() => mockStripeInstance);

describe('StripeAdapter', () => {
  let adapter: StripeAdapter;

  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        STRIPE_SECRET_KEY: 'sk_test_mock',
        STRIPE_WEBHOOK_SECRET: 'whsec_mock',
      };
      return values[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeAdapter,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    adapter = module.get<StripeAdapter>(StripeAdapter);
  });

  describe('createCustomer', () => {
    it('should create a Stripe customer with email and name', async () => {
      const mockCustomer = { id: 'cus_test_123', email: 'test@visiobook.com' };
      mockStripeInstance.customers.create.mockResolvedValue(mockCustomer);

      const result = await adapter.createCustomer('test@visiobook.com', 'Test User');

      expect(mockStripeInstance.customers.create).toHaveBeenCalledWith({
        email: 'test@visiobook.com',
        name: 'Test User',
      });
      expect(result).toEqual(mockCustomer);
    });

    it('should create a customer without name', async () => {
      const mockCustomer = { id: 'cus_test_456', email: 'test@visiobook.com' };
      mockStripeInstance.customers.create.mockResolvedValue(mockCustomer);

      await adapter.createCustomer('test@visiobook.com');

      expect(mockStripeInstance.customers.create).toHaveBeenCalledWith({
        email: 'test@visiobook.com',
        name: undefined,
      });
    });
  });

  describe('createCheckoutSession', () => {
    it('should create a checkout session with correct params', async () => {
      const mockSession = {
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/test',
      };
      mockStripeInstance.checkout.sessions.create.mockResolvedValue(mockSession);

      const result = await adapter.createCheckoutSession({
        customerId: 'cus_test_123',
        priceId: 'price_premium_monthly',
        successUrl: 'https://app.visiobook.com/success',
        cancelUrl: 'https://app.visiobook.com/cancel',
      });

      expect(mockStripeInstance.checkout.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_test_123',
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [{ price: 'price_premium_monthly', quantity: 1 }],
        success_url: 'https://app.visiobook.com/success',
        cancel_url: 'https://app.visiobook.com/cancel',
      });
      expect(result).toEqual(mockSession);
    });
  });

  describe('getSubscription', () => {
    it('should retrieve a subscription by id', async () => {
      const mockSub = { id: 'sub_test_123', status: 'active' };
      mockStripeInstance.subscriptions.retrieve.mockResolvedValue(mockSub);

      const result = await adapter.getSubscription('sub_test_123');

      expect(mockStripeInstance.subscriptions.retrieve).toHaveBeenCalledWith('sub_test_123');
      expect(result).toEqual(mockSub);
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel a subscription', async () => {
      const mockCanceled = { id: 'sub_test_123', status: 'canceled' };
      mockStripeInstance.subscriptions.cancel.mockResolvedValue(mockCanceled);

      const result = await adapter.cancelSubscription('sub_test_123');

      expect(mockStripeInstance.subscriptions.cancel).toHaveBeenCalledWith('sub_test_123');
      expect(result).toEqual(mockCanceled);
    });
  });

  describe('updateSubscription', () => {
    it('should update subscription with proration', async () => {
      const mockSub = {
        id: 'sub_test_123',
        items: { data: [{ id: 'si_test_123' }] },
      };
      const mockUpdated = { id: 'sub_test_123', status: 'active' };
      mockStripeInstance.subscriptions.retrieve.mockResolvedValue(mockSub);
      mockStripeInstance.subscriptions.update.mockResolvedValue(mockUpdated);

      const result = await adapter.updateSubscription('sub_test_123', 'price_enterprise_monthly', true);

      expect(mockStripeInstance.subscriptions.update).toHaveBeenCalledWith('sub_test_123', {
        items: [{ id: 'si_test_123', price: 'price_enterprise_monthly' }],
        proration_behavior: 'create_prorations',
      });
      expect(result).toEqual(mockUpdated);
    });

    it('should update subscription without proration', async () => {
      const mockSub = {
        id: 'sub_test_123',
        items: { data: [{ id: 'si_test_123' }] },
      };
      mockStripeInstance.subscriptions.retrieve.mockResolvedValue(mockSub);
      mockStripeInstance.subscriptions.update.mockResolvedValue({ id: 'sub_test_123' });

      await adapter.updateSubscription('sub_test_123', 'price_premium_monthly', false);

      expect(mockStripeInstance.subscriptions.update).toHaveBeenCalledWith('sub_test_123', {
        items: [{ id: 'si_test_123', price: 'price_premium_monthly' }],
        proration_behavior: 'none',
      });
    });
  });

  describe('createPortalSession', () => {
    it('should create a billing portal session', async () => {
      const mockPortal = { id: 'bps_test_123', url: 'https://billing.stripe.com/test' };
      mockStripeInstance.billingPortal.sessions.create.mockResolvedValue(mockPortal);

      const result = await adapter.createPortalSession('cus_test_123', 'https://app.visiobook.com/settings');

      expect(mockStripeInstance.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_test_123',
        return_url: 'https://app.visiobook.com/settings',
      });
      expect(result).toEqual(mockPortal);
    });
  });

  describe('createSubscriptionWithPaymentIntent', () => {
    it('should create an incomplete subscription and return clientSecret + subscriptionId', async () => {
      const mockSub = {
        id: 'sub_incomplete_123',
        latest_invoice: {
          payment_intent: {
            client_secret: 'pi_test_secret_abc',
          },
        },
      };
      mockStripeInstance.subscriptions.create.mockResolvedValue(mockSub);

      const result = await adapter.createSubscriptionWithPaymentIntent({
        customerId: 'cus_test_123',
        priceId: 'price_1TAVJXHhqOObOnmXf8SOVKMG',
        userId: 'user-123',
        planId: 'premium',
      });

      expect(mockStripeInstance.subscriptions.create).toHaveBeenCalledWith({
        customer: 'cus_test_123',
        items: [{ price: 'price_1TAVJXHhqOObOnmXf8SOVKMG', quantity: 1 }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        metadata: { userId: 'user-123', planId: 'premium' },
      });
      expect(result).toEqual({
        clientSecret: 'pi_test_secret_abc',
        subscriptionId: 'sub_incomplete_123',
      });
    });
  });

  describe('createEphemeralKey', () => {
    it('should create and return the ephemeral key secret', async () => {
      mockStripeInstance.ephemeralKeys.create.mockResolvedValue({
        id: 'ek_test_123',
        secret: 'ek_test_secret_xyz',
      });

      const result = await adapter.createEphemeralKey('cus_test_123');

      expect(mockStripeInstance.ephemeralKeys.create).toHaveBeenCalledWith(
        { customer: 'cus_test_123' },
        { apiVersion: '2025-02-24.acacia' },
      );
      expect(result).toBe('ek_test_secret_xyz');
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify and return the Stripe event', () => {
      const mockEvent = {
        id: 'evt_test_123',
        type: 'checkout.session.completed',
        data: { object: {} },
      };
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

      const payload = Buffer.from('raw-payload');
      const signature = 't=123,v1=abc';

      const result = adapter.verifyWebhookSignature(payload, signature);

      expect(mockStripeInstance.webhooks.constructEvent).toHaveBeenCalledWith(
        payload,
        signature,
        'whsec_mock',
      );
      expect(result).toEqual(mockEvent);
    });

    it('should throw when signature is invalid', () => {
      mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature for payload');
      });

      const payload = Buffer.from('tampered-payload');
      expect(() => adapter.verifyWebhookSignature(payload, 'invalid-sig')).toThrow();
    });
  });
});
