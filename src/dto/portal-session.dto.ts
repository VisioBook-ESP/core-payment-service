import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUrl, IsOptional } from 'class-validator';

export class PortalSessionRequestDto {
  @ApiPropertyOptional({
    description: 'URL de retour apr\u00e8s le portail Stripe',
    example: 'https://app.visiobook.com/settings',
  })
  @IsOptional()
  @IsUrl()
  returnUrl?: string;
}

export class PortalSessionResponseDto {
  @ApiProperty({ description: 'URL du portail de facturation Stripe' })
  portalUrl!: string;
}
