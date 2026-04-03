import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class UserIdGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.headers['x-user-id'] as string;

    if (!userId) {
      throw new UnauthorizedException('Missing x-user-id header');
    }

    (request as unknown as Record<string, unknown>)['user'] = { userId };
    return true;
  }
}
