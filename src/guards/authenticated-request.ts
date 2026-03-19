import { Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  tier: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
