import { ApiProperty } from '@nestjs/swagger';

export class PlanLimitsResponseDto {
  @ApiProperty() generationsPerMonth!: number;
  @ApiProperty() storageGB!: number;
  @ApiProperty() maxProjectSize!: number;
  @ApiProperty() exportQuality!: string;
  @ApiProperty() watermark!: boolean;
}

export class PlanResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() price!: number;
  @ApiProperty() currency!: string;
  @ApiProperty() interval!: string;
  @ApiProperty({ type: PlanLimitsResponseDto }) limits!: PlanLimitsResponseDto;
}
