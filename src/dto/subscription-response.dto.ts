import { ApiProperty } from '@nestjs/swagger';

export class SubscriptionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() planId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() currentPeriodStart!: string;
  @ApiProperty() currentPeriodEnd!: string;
}

export class CheckoutResponseDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty() checkoutUrl!: string;
}
