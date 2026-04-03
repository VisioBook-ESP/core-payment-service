import 'dotenv/config';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { QuotaEntity } from '../entities/quota.entity';
import { TransactionEntity } from '../entities/transaction.entity';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [SubscriptionEntity, QuotaEntity, TransactionEntity],
  migrations: ['src/migrations/*.ts'],
  namingStrategy: new SnakeNamingStrategy(),
});
