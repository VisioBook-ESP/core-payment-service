import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class ServiceKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new UnauthorizedException('Missing x-api-key header');
    }

    const validKey = this.configService.get<string>('INTERNAL_API_KEY', 'dev-internal-key');
    if (apiKey !== validKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    const allowedServices = this.configService.get<string>('ALLOWED_SERVICES');
    if (allowedServices) {
      const serviceName = request.headers['x-service-name'] as string;
      const whitelist = allowedServices.split(',').map((s) => s.trim());
      if (!serviceName || !whitelist.includes(serviceName)) {
        throw new ForbiddenException('Service not authorized');
      }
    }

    return true;
  }
}
