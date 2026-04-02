import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceKeyGuard } from '../../../src/guards/service-key.guard';

function buildContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('ServiceKeyGuard', () => {
  let guard: ServiceKeyGuard;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfigService.get.mockImplementation((key: string, defaultValue?: string) => {
      if (key === 'INTERNAL_API_KEY') return 'test-internal-key';
      if (key === 'ALLOWED_SERVICES') return undefined;
      return defaultValue;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceKeyGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    guard = module.get<ServiceKeyGuard>(ServiceKeyGuard);
  });

  it('should return true when API key is valid', () => {
    const ctx = buildContext({ 'x-api-key': 'test-internal-key' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw UnauthorizedException when x-api-key header is missing', () => {
    const ctx = buildContext({});
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when API key is invalid', () => {
    const ctx = buildContext({ 'x-api-key': 'wrong-key' });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should return true when API key is valid and service is in whitelist', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'INTERNAL_API_KEY') return 'test-internal-key';
      if (key === 'ALLOWED_SERVICES') return 'core-generation-service,core-user-service';
      return undefined;
    });

    const ctx = buildContext({
      'x-api-key': 'test-internal-key',
      'x-service-name': 'core-generation-service',
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw ForbiddenException when service is not in whitelist', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'INTERNAL_API_KEY') return 'test-internal-key';
      if (key === 'ALLOWED_SERVICES') return 'core-generation-service';
      return undefined;
    });

    const ctx = buildContext({
      'x-api-key': 'test-internal-key',
      'x-service-name': 'unknown-service',
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when x-service-name is missing but whitelist is set', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'INTERNAL_API_KEY') return 'test-internal-key';
      if (key === 'ALLOWED_SERVICES') return 'core-generation-service';
      return undefined;
    });

    const ctx = buildContext({ 'x-api-key': 'test-internal-key' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
