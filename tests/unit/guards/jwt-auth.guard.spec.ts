import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../src/guards/jwt-auth.guard';
import { UserServiceClient } from '../../../src/services/user-service.client';
import { mockUserServiceClient, mockUserIdentity } from '../../mocks/user-service.mock';

function buildContext(authHeader?: string): ExecutionContext {
  const request = {
    headers: { authorization: authHeader },
    user: undefined as unknown,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: UserServiceClient, useValue: mockUserServiceClient },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  describe('canActivate', () => {
    it('should return true and inject user when token is valid', async () => {
      const ctx = buildContext('Bearer valid-token');

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(mockUserServiceClient.getUserFromToken).toHaveBeenCalledWith('valid-token');

      const req = ctx.switchToHttp().getRequest<{ user: unknown }>();
      expect(req.user).toEqual({
        userId: mockUserIdentity.id,
        email: mockUserIdentity.email,
        tier: mockUserIdentity.tier,
      });
    });

    it('should throw UnauthorizedException when Authorization header is missing', async () => {
      const ctx = buildContext(undefined);

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      expect(mockUserServiceClient.getUserFromToken).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when header does not start with Bearer', async () => {
      const ctx = buildContext('Basic dXNlcjpwYXNz');

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      expect(mockUserServiceClient.getUserFromToken).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when header is only "Bearer " with no token', async () => {
      const ctx = buildContext('Bearer ');

      // getUserFromToken is called with empty string — mock rejection simulates user-service error
      mockUserServiceClient.getUserFromToken.mockRejectedValueOnce(new Error('empty token'));

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user-service returns an error', async () => {
      mockUserServiceClient.getUserFromToken.mockRejectedValueOnce(new Error('Service unavailable'));

      const ctx = buildContext('Bearer some-valid-looking-token');

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user-service returns 401', async () => {
      mockUserServiceClient.getUserFromToken.mockRejectedValueOnce(
        new UnauthorizedException('Invalid token'),
      );

      const ctx = buildContext('Bearer expired-token');

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });
});
