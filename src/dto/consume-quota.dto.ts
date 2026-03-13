import { IsString, IsEnum, IsNumber, IsNotEmpty, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConsumeQuotaDto {
  @ApiProperty({ description: 'ID utilisateur', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ description: 'Type de quota', enum: ['generation', 'storage'] })
  @IsEnum(['generation', 'storage'])
  type!: 'generation' | 'storage';

  @ApiProperty({ description: 'Quantite a consommer', example: 1 })
  @IsNumber()
  @Min(1)
  amount!: number;
}
