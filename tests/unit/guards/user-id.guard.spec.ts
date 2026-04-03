import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { UserIdGuard } from '../../../src/guards/user-id.guard';

function buildContext(headers: Record<string, string | undefined>): ExecutionContext {
  const request = {
    headers,
    user: undefined as unknown,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('UserIdGuard', () => {
  let guard: UserIdGuard;

  beforeEach(() => {
    guard = new UserIdGuard();
  });

  describe('canActivate', () => {
    it('should return true and inject userId when x-user-id header is present', () => {
      const ctx = buildContext({ 'x-user-id': 'user-123' });

      const result = guard.canActivate(ctx);

      expect(result).toBe(true);
      const req = ctx.switchToHttp().getRequest<{ user: { userId: string } }>();
      expect(req.user).toEqual({ userId: 'user-123' });
    });

    it('should throw UnauthorizedException when x-user-id header is missing', () => {
      const ctx = buildContext({});

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when x-user-id header is undefined', () => {
      const ctx = buildContext({ 'x-user-id': undefined });

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('should accept any non-empty x-user-id value', () => {
      const ctx = buildContext({ 'x-user-id': 'uuid-abc-def-456' });

      const result = guard.canActivate(ctx);

      expect(result).toBe(true);
      const req = ctx.switchToHttp().getRequest<{ user: { userId: string } }>();
      expect(req.user.userId).toBe('uuid-abc-def-456');
    });
  });
});
