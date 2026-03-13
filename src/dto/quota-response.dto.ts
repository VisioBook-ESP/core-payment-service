import { ApiProperty } from '@nestjs/swagger';

export class QuotaGenerationsDto {
  @ApiProperty() used!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() resetDate!: string;
}

export class QuotaStorageDto {
  @ApiProperty() used!: number;
  @ApiProperty() limit!: number;
}

export class QuotaResponseDto {
  @ApiProperty() userId!: string;
  @ApiProperty() plan!: string;
  @ApiProperty({ type: QuotaGenerationsDto }) generations!: QuotaGenerationsDto;
  @ApiProperty({ type: QuotaStorageDto }) storage!: QuotaStorageDto;
}

export class ConsumeQuotaResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() remaining!: number;
  @ApiProperty({ required: false }) error?: string;
}
