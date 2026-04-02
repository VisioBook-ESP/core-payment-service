export const mockStripeCustomer = {
  id: 'cus_test_123',
  email: 'test@visiobook.com',
  name: 'Test User',
};

export const mockCheckoutSession = {
  id: 'cs_test_123',
  url: 'https://checkout.stripe.com/test',
  customer: 'cus_test_123',
  subscription: 'sub_test_123',
  metadata: { userId: 'user-123', planId: 'premium' },
};

export const mockSubscription = {
  id: 'sub_test_123',
  status: 'active',
  customer: 'cus_test_123',
  current_period_start: Math.floor(Date.now() / 1000),
  current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
  metadata: { userId: 'user-123', planId: 'premium' },
};

export const mockPortalSession = {
  id: 'bps_test_123',
  url: 'https://billing.stripe.com/test',
};

export const mockPaymentIntentResponse = {
  clientSecret: 'pi_test_123_secret_mock',
  subscriptionId: 'sub_incomplete_123',
};

export const mockEphemeralKey = 'ek_test_mock_ephemeral_key';

export const mockStripeAdapter = {
  createCustomer: jest.fn().mockResolvedValue(mockStripeCustomer),
  createCheckoutSession: jest.fn().mockResolvedValue(mockCheckoutSession),
  getSubscription: jest.fn().mockResolvedValue(mockSubscription),
  cancelSubscription: jest.fn().mockResolvedValue({ ...mockSubscription, status: 'canceled' }),
  updateSubscription: jest.fn().mockResolvedValue({ ...mockSubscription, status: 'active' }),
  createPortalSession: jest.fn().mockResolvedValue(mockPortalSession),
  createSubscriptionWithPaymentIntent: jest.fn().mockResolvedValue(mockPaymentIntentResponse),
  createEphemeralKey: jest.fn().mockResolvedValue(mockEphemeralKey),
  verifyWebhookSignature: jest.fn().mockReturnValue({
    id: 'evt_test_123',
    type: 'checkout.session.completed',
    data: { object: mockCheckoutSession },
  }),
};
