import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { StripeAdapter } from '../adapters/stripe.adapter';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [SubscriptionController],
  providers: [
    SubscriptionService,
    StripeAdapter,
  ],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
