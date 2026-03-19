export const mockUserIdentity = {
  id: 'mock-user-id-00000001',
  email: 'dev@visiobook.com',
  tier: 'premium' as const,
};

export const mockUserInfo = {
  id: 'user-123',
  email: 'test@visiobook.com',
  name: 'Test User',
  tier: 'free',
};

export const mockUserServiceClient = {
  getUserFromToken: jest.fn().mockResolvedValue(mockUserIdentity),
  getUserById: jest.fn().mockResolvedValue(mockUserInfo),
  updateUserTier: jest.fn().mockResolvedValue(undefined),
};
