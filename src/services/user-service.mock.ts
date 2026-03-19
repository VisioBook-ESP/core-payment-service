import { Injectable, Logger } from '@nestjs/common';
import { UserIdentity, UserInfo } from './user-service.client';

@Injectable()
export class UserServiceMock {
  private readonly logger = new Logger(UserServiceMock.name);

  async getUserFromToken(_token: string): Promise<UserIdentity> {
    this.logger.warn('UserServiceMock active — development mode only');
    return { id: 'mock-user-id-00000001', email: 'dev@visiobook.com', tier: 'premium' };
  }

  async getUserById(_userId: string): Promise<UserInfo> {
    return { id: 'mock-user-id-00000001', email: 'dev@visiobook.com', tier: 'premium' };
  }

  async updateUserTier(_userId: string, _tier: string): Promise<void> {
    this.logger.warn('UserServiceMock: updateUserTier no-op in development mode');
  }
}
