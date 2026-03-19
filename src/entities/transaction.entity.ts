export type TransactionStatus = 'succeeded' | 'failed' | 'pending' | 'refunded';

export interface TransactionEntity {
  id: string;
  userId: string;
  stripePaymentIntentId: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  createdAt: string;
}
