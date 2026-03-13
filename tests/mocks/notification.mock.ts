export const mockNotificationClient = {
  sendSubscriptionConfirmation: jest.fn().mockResolvedValue(undefined),
  sendPaymentFailed: jest.fn().mockResolvedValue(undefined),
  sendSubscriptionCanceled: jest.fn().mockResolvedValue(undefined),
};
