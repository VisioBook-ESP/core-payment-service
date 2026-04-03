import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type TransactionStatus = 'succeeded' | 'failed' | 'pending' | 'refunded';

@Entity('transactions')
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column()
  stripePaymentIntentId!: string;

  @Column({ type: 'bigint' })
  amount!: number;

  @Column()
  currency!: string;

  @Column({ type: 'varchar' })
  status!: TransactionStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: string;
}
