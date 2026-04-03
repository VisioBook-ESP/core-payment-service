import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookController } from '../../../src/webhook/webhook.controller';
import { WebhookService } from '../../../src/webhook/webhook.service';
import { StripeAdapter } from '../../../src/adapters/stripe.adapter';
import { mockStripeAdapter } from '../../mocks/stripe.mock';

describe('WebhookController', () => {
  let controller: WebhookController;

  const mockEvent: Stripe.Event = {
    id: 'evt_test_123',
    type: 'checkout.session.completed',
    data: { object: {} },
  } as unknown as Stripe.Event;

  const mockWebhookService = {
    handleStripeEvent: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockStripeAdapter.verifyWebhookSignature.mockReturnValue(mockEvent);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: StripeAdapter, useValue: mockStripeAdapter },
        { provide: WebhookService, useValue: mockWebhookService },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
  });

  describe('handleStripeWebhook', () => {
    it('should return { received: true } on valid webhook', async () => {
      const rawBody = Buffer.from('payload');
      const req = {
        headers: { 'stripe-signature': 't=123,v1=abc' },
        body: JSON.parse(rawBody.toString()),
        rawBody,
      } as any;

      const result = await controller.handleStripeWebhook(req);

      expect(result).toEqual({ received: true });
      expect(mockStripeAdapter.verifyWebhookSignature).toHaveBeenCalledWith(
        rawBody,
        't=123,v1=abc',
      );
      expect(mockWebhookService.handleStripeEvent).toHaveBeenCalledWith(mockEvent);
    });

    it('should throw BadRequestException when stripe-signature header is missing', async () => {
      const req = {
        headers: {},
        body: {},
        rawBody: Buffer.from('payload'),
      } as any;

      await expect(controller.handleStripeWebhook(req)).rejects.toThrow(BadRequestException);
      expect(mockStripeAdapter.verifyWebhookSignature).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when signature verification fails', async () => {
      mockStripeAdapter.verifyWebhookSignature.mockImplementationOnce(() => {
        throw new Error('No signatures found matching');
      });

      const req = {
        headers: { 'stripe-signature': 'invalid-sig' },
        body: {},
        rawBody: Buffer.from('tampered'),
      } as any;

      await expect(controller.handleStripeWebhook(req)).rejects.toThrow(BadRequestException);
      expect(mockWebhookService.handleStripeEvent).not.toHaveBeenCalled();
    });
  });
});
