import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ChangePlanDto {
  @ApiProperty({ description: 'Identifiant du nouveau plan', example: 'premium' })
  @IsString()
  @IsNotEmpty()
  planId!: string;
}
