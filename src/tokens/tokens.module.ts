import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuotaEntity } from '../entities/quota.entity';
import { TokensController } from './tokens.controller';

@Module({
  imports: [TypeOrmModule.forFeature([QuotaEntity])],
  controllers: [TokensController],
})
export class TokensModule {}
