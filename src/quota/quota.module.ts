import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { QuotaController } from './quota.controller';
import { QuotaService } from './quota.service';
import { DatabaseClient } from '../services/database.client';

@Module({
  imports: [HttpModule],
  controllers: [QuotaController],
  providers: [QuotaService, DatabaseClient],
  exports: [QuotaService],
})
export class QuotaModule {}
