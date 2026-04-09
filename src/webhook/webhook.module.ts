import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { StripeAdapter } from '../adapters/stripe.adapter';
import { SubscriptionModule } from '../subscription/subscription.module';
import { DatabaseModule } from '../database/database.module';
import { NotificationClient } from '../services/notification.client';

@Module({
  imports: [HttpModule, SubscriptionModule, DatabaseModule],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    StripeAdapter,
    NotificationClient,
  ],
})
export class WebhookModule {}
