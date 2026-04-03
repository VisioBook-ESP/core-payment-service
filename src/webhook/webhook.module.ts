import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { StripeAdapter } from '../adapters/stripe.adapter';
import { SubscriptionModule } from '../subscription/subscription.module';
import { DatabaseClient } from '../services/database.client';
import { NotificationClient } from '../services/notification.client';

@Module({
  imports: [HttpModule, SubscriptionModule],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    StripeAdapter,
    DatabaseClient,
    NotificationClient,
  ],
})
export class WebhookModule {}
