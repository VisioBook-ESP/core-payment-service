import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { StripeAdapter } from '../adapters/stripe.adapter';
import { SubscriptionModule } from '../subscription/subscription.module';
import { DatabaseModule } from '../database/database.module';
@Module({
  imports: [SubscriptionModule, DatabaseModule],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    StripeAdapter,
  ],
})
export class WebhookModule {}
