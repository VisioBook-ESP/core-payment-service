import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { QuotaEntity } from '../entities/quota.entity';
import { TransactionEntity } from '../entities/transaction.entity';
import { DatabaseClient } from '../services/database.client';

@Module({
  imports: [
    TypeOrmModule.forFeature([SubscriptionEntity, QuotaEntity, TransactionEntity]),
  ],
  providers: [DatabaseClient],
  exports: [DatabaseClient],
})
export class DatabaseModule {}
