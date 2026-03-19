import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { UserServiceClient } from '../services/user-service.client';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly userServiceClient: UserServiceClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);

    try {
      const identity = await this.userServiceClient.getUserFromToken(token);
      (request as unknown as Record<string, unknown>)['user'] = {
        userId: identity.id,
        email: identity.email,
        tier: identity.tier,
      };
      return true;
    } catch {
      this.logger.warn('Failed to resolve user identity from token');
      throw new UnauthorizedException('Unable to authenticate user');
    }
  }
}
