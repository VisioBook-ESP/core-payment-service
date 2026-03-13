import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface UserIdentity {
  id: string;
  email: string;
  tier: 'free' | 'premium' | 'enterprise';
}

export interface UserInfo {
  id: string;
  email: string;
  name?: string;
  tier: string;
}

@Injectable()
export class UserServiceClient {
  private readonly logger = new Logger(UserServiceClient.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.getOrThrow<string>('USER_SERVICE_URL');
  }

  async getUserFromToken(token: string): Promise<UserIdentity> {
    const { data } = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/api/v1/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    return data;
  }

  async getUserById(userId: string): Promise<UserInfo> {
    const { data } = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/api/v1/users/${userId}`),
    );
    return data;
  }

  async updateUserTier(userId: string, tier: string): Promise<void> {
    await firstValueFrom(
      this.httpService.patch(`${this.baseUrl}/api/v1/users/${userId}/tier`, { tier }),
    );
    this.logger.log(`Updated user ${userId} tier to ${tier}`);
  }
}
