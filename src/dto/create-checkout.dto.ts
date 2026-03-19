import { IsString, IsUrl, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCheckoutDto {
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

  @ApiProperty({
    description: 'URL de redirection apres succes',
    example: 'https://app.visiobook.com/success',
  })
  @IsUrl()
  successUrl!: string;

  @ApiProperty({
    description: 'URL de redirection apres annulation',
    example: 'https://app.visiobook.com/pricing',
  })
  @IsUrl()
  cancelUrl!: string;
}
