import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class NotificationClient {
  private readonly logger = new Logger(NotificationClient.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.getOrThrow<string>('NOTIFICATION_SERVICE_URL');
  }

  async sendSubscriptionConfirmation(userId: string, planName: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/v1/email/send`, {
          userId,
          template: 'subscription_confirmation',
          data: { planName },
        }),
      );
      this.logger.log(`Subscription confirmation sent to user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to send subscription confirmation: ${error}`);
    }
  }

  async sendPaymentFailed(userId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/v1/email/send`, {
          userId,
          template: 'payment_failed',
          data: {},
        }),
      );
      this.logger.log(`Payment failed notification sent to user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to send payment failed notification: ${error}`);
    }
  }

  async sendSubscriptionCanceled(userId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/v1/email/send`, {
          userId,
          template: 'subscription_canceled',
          data: {},
        }),
      );
      this.logger.log(`Subscription canceled notification sent to user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to send subscription canceled notification: ${error}`);
    }
  }
}
