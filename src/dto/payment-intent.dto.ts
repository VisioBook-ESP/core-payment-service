import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaymentIntentRequestDto {
  @ApiProperty({ description: 'ID du plan (premium, enterprise)', example: 'premium' })
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @ApiPropertyOptional({
    description: 'Intervalle de facturation',
    enum: ['month', 'year'],
    default: 'month',
  })
  @IsOptional()
  @IsIn(['month', 'year'])
  interval?: 'month' | 'year';
}

export class PaymentIntentResponseDto {
  @ApiProperty({ description: 'Client secret du PaymentIntent — passé à flutter_stripe initPaymentSheet()' })
  clientSecret!: string;

  @ApiProperty({ description: 'ID du customer Stripe — passé à flutter_stripe initPaymentSheet()' })
  customerId!: string;

  @ApiProperty({ description: 'Ephemeral key Stripe — passé à flutter_stripe initPaymentSheet()' })
  ephemeralKey!: string;

  @ApiProperty({ description: 'ID de la subscription Stripe (statut incomplete, activée après paiement via webhook)' })
  subscriptionId!: string;
}
