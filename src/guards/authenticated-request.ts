import { Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
