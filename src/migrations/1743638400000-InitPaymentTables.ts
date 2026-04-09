import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitPaymentTables1743638400000 implements MigrationInterface {
  name = 'InitPaymentTables1743638400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "subscriptions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" VARCHAR NOT NULL UNIQUE,
        "stripe_customer_id" VARCHAR NOT NULL,
        "stripe_subscription_id" VARCHAR NOT NULL,
        "plan_id" VARCHAR NOT NULL,
        "status" VARCHAR NOT NULL DEFAULT 'active',
        "current_period_start" TIMESTAMPTZ NOT NULL,
        "current_period_end" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "quotas" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" VARCHAR NOT NULL UNIQUE,
        "plan_id" VARCHAR NOT NULL,
        "generations_used" INT NOT NULL DEFAULT 0,
        "generations_limit" INT NOT NULL,
        "storage_used" BIGINT NOT NULL DEFAULT 0,
        "storage_limit" BIGINT NOT NULL,
        "reset_date" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" VARCHAR NOT NULL,
        "stripe_payment_intent_id" VARCHAR NOT NULL,
        "amount" BIGINT NOT NULL,
        "currency" VARCHAR NOT NULL,
        "status" VARCHAR NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_subscriptions_stripe_subscription_id" ON "subscriptions" ("stripe_subscription_id")`);
    await queryRunner.query(`CREATE INDEX "idx_transactions_user_id" ON "transactions" ("user_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quotas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscriptions"`);
  }
}
