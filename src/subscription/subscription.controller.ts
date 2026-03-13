import { Controller, Get, Post, Body, Req, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { SubscriptionService } from './subscription.service';
import { CreateCheckoutDto } from '../dto/create-checkout.dto';
import { ChangePlanDto } from '../dto/change-plan.dto';
import { PlanResponseDto } from '../dto/plan-response.dto';
import { SubscriptionResponseDto, CheckoutResponseDto } from '../dto/subscription-response.dto';
import { PortalSessionResponseDto } from '../dto/portal-session.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../guards/authenticated-request';

@ApiTags('Subscriptions')
@Controller('subscriptions')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 50, ttl: 60000 } })
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Liste des plans disponibles' })
  @ApiResponse({ status: 200, type: [PlanResponseDto] })
  getPlans(): PlanResponseDto[] {
    return this.subscriptionService.getPlans();
  }

  @Get('current')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Abonnement actuel de l'utilisateur" })
  @ApiResponse({ status: 200, type: SubscriptionResponseDto })
  async getCurrentSubscription(
    @Req() req: AuthenticatedRequest,
  ): Promise<SubscriptionResponseDto | null> {
    return this.subscriptionService.getCurrentSubscription(req.user.userId);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Creer une session de checkout Stripe' })
  @ApiResponse({ status: 201, type: CheckoutResponseDto })
  async createCheckout(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCheckoutDto,
  ): Promise<CheckoutResponseDto> {
    return this.subscriptionService.createCheckoutSession(
      req.user.userId,
      dto.planId,
      dto.successUrl,
      dto.cancelUrl,
      dto.interval,
    );
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Annuler l'abonnement" })
  @ApiResponse({ status: 200 })
  async cancelSubscription(@Req() req: AuthenticatedRequest): Promise<{ message: string }> {
    await this.subscriptionService.cancelSubscription(req.user.userId);
    return { message: 'Subscription canceled successfully' };
  }

  @Post('upgrade')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upgrader vers un plan superieur' })
  @ApiResponse({ status: 200 })
  async upgradePlan(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChangePlanDto,
  ): Promise<{ message: string }> {
    await this.subscriptionService.upgradePlan(req.user.userId, dto.planId);
    return { message: `Subscription upgraded to ${dto.planId}` };
  }

  @Post('downgrade')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Downgrader vers un plan inferieur' })
  @ApiResponse({ status: 200 })
  async downgradePlan(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChangePlanDto,
  ): Promise<{ message: string }> {
    await this.subscriptionService.downgradePlan(req.user.userId, dto.planId);
    return { message: `Subscription downgraded to ${dto.planId}` };
  }

  @Get('portal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Obtenir l'URL du portail de facturation Stripe" })
  @ApiQuery({ name: 'returnUrl', required: false, description: 'URL de retour apres le portail' })
  @ApiResponse({ status: 200, type: PortalSessionResponseDto })
  async getPortalSession(
    @Req() req: AuthenticatedRequest,
    @Query('returnUrl') returnUrl?: string,
  ): Promise<PortalSessionResponseDto> {
    return this.subscriptionService.createPortalSession(req.user.userId, returnUrl);
  }
}
