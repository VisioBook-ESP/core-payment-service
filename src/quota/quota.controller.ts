import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { QuotaService } from './quota.service';
import { ConsumeQuotaDto } from '../dto/consume-quota.dto';
import { ResetQuotaDto } from '../dto/reset-quota.dto';
import { QuotaResponseDto, ConsumeQuotaResponseDto } from '../dto/quota-response.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ServiceKeyGuard } from '../guards/service-key.guard';
import { AuthenticatedRequest } from '../guards/authenticated-request';

@ApiTags('Quotas')
@Controller('quotas')
@UseGuards(ThrottlerGuard)
export class QuotaController {
  constructor(private readonly quotaService: QuotaService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Quotas de l\'utilisateur connecte' })
  @ApiResponse({ status: 200, type: QuotaResponseDto })
  async getUserQuota(@Req() req: AuthenticatedRequest): Promise<QuotaResponseDto> {
    return this.quotaService.getUserQuota(req.user.userId);
  }

  @Post('consume')
  @UseGuards(ServiceKeyGuard)
  @ApiHeader({ name: 'x-api-key', description: 'Cle API interne' })
  @ApiOperation({ summary: 'Consommer un quota (appel interne)' })
  @ApiResponse({ status: 200, type: ConsumeQuotaResponseDto })
  async consumeQuota(@Body() dto: ConsumeQuotaDto): Promise<ConsumeQuotaResponseDto> {
    return this.quotaService.consumeQuota(dto.userId, dto.type, dto.amount);
  }

  @Post('reset')
  @UseGuards(ServiceKeyGuard)
  @ApiHeader({ name: 'x-api-key', description: 'Cle API interne (admin)' })
  @ApiOperation({ summary: 'Reinitialiser les quotas d\'un utilisateur (admin)' })
  @ApiResponse({ status: 200 })
  async resetQuota(@Body() dto: ResetQuotaDto): Promise<{ message: string }> {
    await this.quotaService.resetQuota(dto.userId);
    return { message: 'Quota reset successfully' };
  }
}
