import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { StripeAdapter } from '../adapters/stripe.adapter';
import { DatabaseClient } from '../services/database.client';

@Module({
  imports: [HttpModule],
  controllers: [SubscriptionController],
  providers: [
    SubscriptionService,
    StripeAdapter,
    DatabaseClient,
  ],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
