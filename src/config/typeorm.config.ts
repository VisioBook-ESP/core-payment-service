import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { QuotaEntity } from '../entities/quota.entity';
import { TransactionEntity } from '../entities/transaction.entity';

export const typeOrmConfig: TypeOrmModuleAsyncOptions = {
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'postgres' as const,
    url: config.getOrThrow<string>('DATABASE_URL'),
    entities: [SubscriptionEntity, QuotaEntity, TransactionEntity],
    migrations: ['dist/migrations/*.js'],
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
    logging: config.get('NODE_ENV') !== 'production',
  }),
};
