import { Module } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { StripeAdapter } from '../adapters/stripe.adapter';
import { SubscriptionModule } from '../subscription/subscription.module';
import { DatabaseClient } from '../services/database.client';
import { NotificationClient } from '../services/notification.client';
import { UserServiceClient } from '../services/user-service.client';
import { UserServiceMock } from '../services/user-service.mock';

const userServiceProvider = {
  provide: UserServiceClient,
  useFactory: (httpService: HttpService, configService: ConfigService) => {
    if (configService.get('USER_SERVICE_MOCK') === 'true') {
      return new UserServiceMock();
    }
    return new UserServiceClient(httpService, configService);
  },
  inject: [HttpService, ConfigService],
};

@Module({
  imports: [HttpModule, SubscriptionModule],
  controllers: [WebhookController],
  providers: [WebhookService, StripeAdapter, DatabaseClient, NotificationClient, userServiceProvider],
})
export class WebhookModule {}
