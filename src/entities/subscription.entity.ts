export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing';

export interface SubscriptionEntity {
  id: string;
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  createdAt: string;
  updatedAt: string;
}
