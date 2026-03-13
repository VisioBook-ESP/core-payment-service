export interface QuotaEntity {
  id: string;
  userId: string;
  planId: string;
  generationsUsed: number;
  generationsLimit: number;
  storageUsed: number;
  storageLimit: number;
  resetDate: string;
  createdAt: string;
  updatedAt: string;
}
