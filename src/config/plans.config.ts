export interface PlanLimits {
  generationsPerMonth: number;
  storageGB: number;
  maxProjectSize: number;
  exportQuality: '720p' | '1080p' | '4k';
  watermark: boolean;
}

export interface PlanConfig {
  id: string;
  name: string;
  stripePriceId: string | null;
  stripePriceIdYearly: string | null;
  price: number;
  priceYearly: number | null;
  currency: string;
  interval: 'month' | 'year';
  limits: PlanLimits;
}

export const PLANS: PlanConfig[] = [
  {
    id: 'free',
    name: 'Free',
    stripePriceId: null,
    stripePriceIdYearly: null,
    price: 0,
    priceYearly: null,
    currency: 'eur',
    interval: 'month',
    limits: {
      generationsPerMonth: 3,
      storageGB: 1,
      maxProjectSize: 5,
      exportQuality: '720p',
      watermark: true,
    },
  },
  {
    id: 'premium',
    name: 'Premium',
    stripePriceId: 'price_1TAVJXHhqOObOnmXf8SOVKMG',
    stripePriceIdYearly: 'price_1TAVJXHhqOObOnmXvilu4kwL',
    price: 9.99,
    priceYearly: 99.99,
    currency: 'eur',
    interval: 'month',
    limits: {
      generationsPerMonth: 50,
      storageGB: 10,
      maxProjectSize: 50,
      exportQuality: '1080p',
      watermark: false,
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    stripePriceId: 'price_1TAVK5HhqOObOnmXnOwrpXtc',
    stripePriceIdYearly: 'price_1TAVK5HhqOObOnmXbjKcba8F',
    price: 29.99,
    priceYearly: 299.99,
    currency: 'eur',
    interval: 'month',
    limits: {
      generationsPerMonth: -1,
      storageGB: 100,
      maxProjectSize: 200,
      exportQuality: '4k',
      watermark: false,
    },
  },
];

export function getPlanById(planId: string): PlanConfig | undefined {
  return PLANS.find((p) => p.id === planId);
}
