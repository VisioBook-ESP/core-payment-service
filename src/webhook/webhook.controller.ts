import {
  Controller,
  Post,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { StripeAdapter } from '../adapters/stripe.adapter';
import { WebhookService } from './webhook.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly stripeAdapter: StripeAdapter,
    private readonly webhookService: WebhookService,
  ) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook Stripe' })
  @ApiResponse({ status: 200, description: 'Event processed' })
  @ApiResponse({ status: 400, description: 'Invalid signature' })
  async handleStripeWebhook(@Req() req: RawBodyRequest<Request>): Promise<{ received: boolean }> {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event;
    try {
      event = this.stripeAdapter.verifyWebhookSignature(req.rawBody as Buffer, signature);
    } catch (error) {
      this.logger.error(`Stripe signature verification failed: ${error}`);
      throw new BadRequestException('Webhook signature verification failed');
    }

    await this.webhookService.handleStripeEvent(event);

    return { received: true };
  }
}
