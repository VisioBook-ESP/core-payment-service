import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing';

@Entity('subscriptions')
export class SubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  userId!: string;

  @Column()
  stripeCustomerId!: string;

  @Column()
  stripeSubscriptionId!: string;

  @Column()
  planId!: string;

  @Column({ type: 'varchar' })
  status!: SubscriptionStatus;

  @Column({ type: 'timestamptz' })
  currentPeriodStart!: string;

  @Column({ type: 'timestamptz' })
  currentPeriodEnd!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: string;
}
