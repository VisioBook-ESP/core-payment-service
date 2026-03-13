import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ResetQuotaDto {
  @ApiProperty({ description: 'UUID de l\'utilisateur dont le quota doit \u00eatre r\u00e9initialis\u00e9' })
  @IsUUID()
  userId!: string;
}
