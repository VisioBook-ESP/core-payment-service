import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTokensColumns1745500000000 implements MigrationInterface {
  name = 'AddTokensColumns1745500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "quotas" ADD COLUMN IF NOT EXISTS "tokens_used" BIGINT NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotas" ADD COLUMN IF NOT EXISTS "tokens_limit" BIGINT NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quotas" DROP COLUMN IF EXISTS "tokens_limit"`);
    await queryRunner.query(`ALTER TABLE "quotas" DROP COLUMN IF EXISTS "tokens_used"`);
  }
}
