import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsUUID, IsNumber, Min, IsOptional, IsString, MaxLength } from 'class-validator';
import { QuotaEntity } from '../entities/quota.entity';
import { UserIdGuard } from '../guards/user-id.guard';
import { ServiceKeyGuard } from '../guards/service-key.guard';
import { AuthenticatedRequest } from '../guards/authenticated-request';

const DEFAULT_TOKENS: Record<string, number> = {
  free: 10000,
  premium: 500000,
  enterprise: 100000000,
};

const TOKEN_ENV_KEY: Record<string, string> = {
  free: 'PLAN_FREE_TOKENS',
  premium: 'PLAN_PREMIUM_TOKENS',
  enterprise: 'PLAN_ENTERPRISE_TOKENS',
};

export function getTokensForPlan(config: ConfigService, planId: string): number {
  const envKey = TOKEN_ENV_KEY[planId];
  const raw = envKey ? config.get<string>(envKey) : undefined;
  const parsed = raw !== undefined ? Number.parseInt(raw, 10) : NaN;
  return Number.isNaN(parsed) ? (DEFAULT_TOKENS[planId] ?? 0) : parsed;
}

class ConsumeTokensDto {
  @IsUUID()
  userId!: string;

  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;
}

@ApiTags('Tokens')
@Controller('tokens')
@UseGuards(ThrottlerGuard)
export class TokensController {
  private readonly logger = new Logger(TokensController.name);

  constructor(
    @InjectRepository(QuotaEntity) private readonly quotaRepo: Repository<QuotaEntity>,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @UseGuards(UserIdGuard)
  @ApiHeader({ name: 'x-user-id', description: "UUID de l'utilisateur" })
  @ApiOperation({ summary: "Solde de tokens de l'utilisateur" })
  @ApiResponse({ status: 200 })
  async getUserTokens(@Req() req: AuthenticatedRequest) {
    const row = await this.quotaRepo.findOne({ where: { userId: req.user.userId } });
    if (!row) {
      const limit = getTokensForPlan(this.config, 'free');
      return {
        userId: req.user.userId,
        plan: 'free',
        used: 0,
        limit,
        balance: limit,
      };
    }
    const used = Number(row.tokensUsed ?? 0);
    const limit = Number(row.tokensLimit ?? 0);
    return {
      userId: row.userId,
      plan: row.planId,
      used,
      limit,
      balance: Math.max(0, limit - used),
    };
  }

  @Post('consume')
  @UseGuards(ServiceKeyGuard)
  @ApiHeader({ name: 'x-api-key', description: 'Cle API interne' })
  @ApiOperation({ summary: 'Consommer des tokens (appel service-to-service)' })
  @ApiResponse({ status: 201 })
  async consumeTokens(@Body() dto: ConsumeTokensDto) {
    const row = await this.quotaRepo.findOne({ where: { userId: dto.userId } });
    if (!row) {
      throw new NotFoundException('Tokens record not found for user');
    }
    const used = Number(row.tokensUsed ?? 0);
    const limit = Number(row.tokensLimit ?? 0);

    if (used + dto.amount > limit) {
      return {
        success: false,
        remaining: Math.max(0, limit - used),
        error: 'INSUFFICIENT_TOKENS',
      };
    }

    await this.quotaRepo.increment({ userId: dto.userId }, 'tokensUsed', dto.amount);
    const remaining = limit - used - dto.amount;
    this.logger.log(
      `User ${dto.userId} consumed ${dto.amount} token(s), ${remaining} remaining` +
        (dto.source ? ` [source=${dto.source}]` : ''),
    );
    return { success: true, remaining };
  }
}
