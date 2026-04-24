import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('quotas')
export class QuotaEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  userId!: string;

  @Column()
  planId!: string;

  @Column({ type: 'int', default: 0 })
  generationsUsed!: number;

  @Column({ type: 'int' })
  generationsLimit!: number;

  @Column({ type: 'bigint', default: 0 })
  storageUsed!: number;

  @Column({ type: 'bigint' })
  storageLimit!: number;

  @Column({ type: 'bigint', default: 0 })
  tokensUsed!: string | number;

  @Column({ type: 'bigint', default: 0 })
  tokensLimit!: string | number;

  @Column({ type: 'timestamptz' })
  resetDate!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: string;
}
