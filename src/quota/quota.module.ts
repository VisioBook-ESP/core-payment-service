import { Module } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { QuotaController } from './quota.controller';
import { QuotaService } from './quota.service';
import { DatabaseClient } from '../services/database.client';
import { UserServiceClient } from '../services/user-service.client';
import { UserServiceMock } from '../services/user-service.mock';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

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
  imports: [HttpModule],
  controllers: [QuotaController],
  providers: [QuotaService, DatabaseClient, userServiceProvider, JwtAuthGuard],
  exports: [QuotaService],
})
export class QuotaModule {}
