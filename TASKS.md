# TASKS.md - core-payment-service

Checklist exhaustive des taches a accomplir pour le microservice `core-payment-service`.

## Legende des priorites

| Priorite | Description | Critere |
|----------|-------------|---------|
| **P0** | Critique/Bloquant | Service non fonctionnel sans ces taches |
| **P1** | Essentiel | Fonctionnalites core requises pour le MVP |
| **P2** | Important | Ameliorations significatives, qualite |
| **P3** | Nice-to-have | Optimisations, features avancees |

---

## P0 - Critique/Bloquant

### Infrastructure & Setup

- [x] Initialisation projet NestJS avec CLI
- [x] Configuration TypeScript strict mode
- [x] Setup structure de dossiers standardisee VisioBook
  ```
  src/
  ├── controllers/
  ├── services/
  ├── adapters/
  ├── dto/
  ├── entities/
  ├── guards/
  ├── middleware/
  ├── config/
  └── utils/
  ```
- [x] Configuration ESLint + Prettier (standards VisioBook)
- [x] Setup .env.example avec toutes les variables requises (pas de JWT_SECRET, la Gateway valide le token)
- [x] Configuration du port 8087
- [x] Setup Docker
  - [x] Dockerfile multi-stage (builder + runner)
  - [x] docker-compose.yml pour developpement local
  - [x] docker-compose.dev.yml pour hot-reload
- [x] Configuration package.json scripts
  - [x] `start:dev` - developpement avec hot-reload
  - [x] `start:prod` - production
  - [x] `build` - compilation TypeScript
  - [x] `test` - tests unitaires
  - [x] `test:e2e` - tests integration
  - [x] `test:cov` - couverture

### Integration Stripe

- [x] Installation Stripe SDK (`stripe`)
- [x] Creation StripeAdapter
  - [x] Methode `createCheckoutSession()`
  - [x] Methode `createCustomer()`
  - [x] Methode `getSubscription()`
  - [x] Methode `cancelSubscription()`
  - [x] Methode `verifyWebhookSignature()`
  - [x] Methode `createSubscriptionWithPaymentIntent()` - flux natif in-app
  - [x] Methode `createEphemeralKey()` - flutter_stripe Payment Sheet
- [x] Configuration produits/prix dans Stripe Dashboard (mode test)
  - [x] Plan Free (pas de prix Stripe)
  - [x] Plan Premium (monthly/yearly) — price IDs intégrés dans plans.config.ts
  - [x] Plan Enterprise (monthly/yearly) — price IDs intégrés dans plans.config.ts

### Core Modules

#### SubscriptionModule

- [x] `SubscriptionController`
  - [x] `GET /api/v1/subscriptions/plans` - Liste des plans
  - [x] `GET /api/v1/subscriptions/current` - Abonnement actuel
  - [x] `POST /api/v1/subscriptions/checkout` - Session checkout
  - [x] `POST /api/v1/subscriptions/cancel` - Annulation
- [x] `SubscriptionService`
  - [x] `getPlans()` - Recuperer les plans
  - [x] `getCurrentSubscription(userId)` - Abonnement utilisateur
  - [x] `createCheckoutSession(userId, planId)` - Creer session
  - [x] `cancelSubscription(userId)` - Annuler

#### QuotaModule

- [x] `QuotaController`
  - [x] `GET /api/v1/quotas` - Quotas utilisateur
  - [x] `POST /api/v1/quotas/consume` - Consommer quota (internal)
- [x] `QuotaService`
  - [x] `getUserQuota(userId)` - Recuperer quotas
  - [x] `consumeQuota(userId, type, amount)` - Consommer
  - [x] `checkQuotaAvailable(userId, type)` - Verifier disponibilite

#### WebhookModule

- [x] `WebhookController`
  - [x] `POST /api/v1/webhooks/stripe` - Handler Stripe
- [x] `WebhookService`
  - [x] Handler `checkout.session.completed`
  - [x] Handler `customer.subscription.created`
  - [x] Handler `customer.subscription.updated`
  - [x] Handler `customer.subscription.deleted`
  - [x] Handler `invoice.paid`
  - [x] Handler `invoice.payment_failed`

### DTOs & Validation

- [x] `CreateCheckoutDto`
- [x] `CancelSubscriptionDto`
- [x] `ConsumeQuotaDto`
- [x] `PlanResponseDto`
- [x] `SubscriptionResponseDto`
- [x] `QuotaResponseDto`

### Entities

- [x] `SubscriptionEntity`
  - [x] id (UUID)
  - [x] userId
  - [x] stripeCustomerId
  - [x] stripeSubscriptionId
  - [x] planId
  - [x] status (active, canceled, past_due, trialing)
  - [x] currentPeriodStart
  - [x] currentPeriodEnd
  - [x] createdAt, updatedAt
- [x] `QuotaEntity`
  - [x] id (UUID)
  - [x] userId
  - [x] planId
  - [x] generationsUsed
  - [x] generationsLimit
  - [x] storageUsed
  - [x] storageLimit
  - [x] resetDate
  - [x] createdAt, updatedAt
- [x] `TransactionEntity`
  - [x] id (UUID)
  - [x] userId
  - [x] stripePaymentIntentId
  - [x] amount
  - [x] currency
  - [x] status (succeeded, failed, pending, refunded)
  - [x] createdAt

---

## P1 - Essentiel (MVP)

### Endpoints supplementaires

- [x] `POST /api/v1/subscriptions/upgrade` - Upgrade plan
- [x] `POST /api/v1/subscriptions/downgrade` - Downgrade plan
- [x] `POST /api/v1/quotas/reset` - Reset quotas (admin)
- [x] `GET /api/v1/subscriptions/portal` - Customer portal Stripe
- [x] `POST /api/v1/subscriptions/payment-intent` - PaymentIntent pour Payment Sheet natif (flutter_stripe)

### Base de donnees PostgreSQL (propre au microservice)

- [x] Installation TypeORM + driver PostgreSQL (`@nestjs/typeorm`, `typeorm`, `pg`)
- [x] Configuration TypeORM (`src/config/typeorm.config.ts`, `src/config/data-source.ts`)
- [x] Conversion entities interfaces → classes `@Entity()` decorees TypeORM
  - [x] `SubscriptionEntity` avec colonnes UUID, timestamptz, index
  - [x] `QuotaEntity` avec colonnes int/bigint pour quotas
  - [x] `TransactionEntity` avec colonnes bigint pour amount
- [x] `DatabaseModule` partage (`src/database/database.module.ts`)
- [x] `DatabaseClient` reecrit avec TypeORM repositories (meme API publique)
- [x] Migration initiale (`src/migrations/1743638400000-InitPaymentTables.ts`)
- [x] PostgreSQL dans `docker-compose.yml` (postgres:16-alpine)
- [x] `DATABASE_URL` dans `charts/values.yaml` et `.env.example`
- [x] Scripts migration dans `package.json` (`migration:run`, `migration:revert`, `migration:generate`)

### Integration Services Internes

- [x] ~~Client HTTP vers `core-database-service`~~ → Remplace par PostgreSQL direct (voir ci-dessus)
  - [x] ~~Configuration HttpModule~~
  - [x] `DatabaseClient` service (reecrit avec TypeORM)
  - [x] Methodes CRUD pour subscriptions
  - [x] Methodes CRUD pour quotas
  - [x] Methodes CRUD pour transactions
- [x] Client HTTP vers `core-user-service`
  - [x] Definir interface `UserIdentity` : contrat attendu de `GET /api/v1/users/me` (`{ id, email, tier }`)
  - [x] `UserServiceClient` (appels reels vers core-user-service)
    - [x] `getUserFromToken(token)` - Appel `GET /api/v1/users/me` avec Bearer token pour resoudre userId
    - [x] `getUserById(userId)` - Appel `GET /api/v1/users/:id`
    - [x] `updateUserTier(userId, tier)` - Appel `PATCH /api/v1/users/:id/tier`
  - [x] `UserServiceMock` - Implementation mock pour developpement local (sans core-user-service disponible)
    - [x] Variable d'env `USER_SERVICE_MOCK=true` pour activer le mock
    - [x] Retourne utilisateur fixe : `{ id: "mock-user-id-00000001", email: "dev@visiobook.com", tier: "premium" }`
    - [x] Injection conditionnelle : `UserServiceMock` si `USER_SERVICE_MOCK=true`, sinon `UserServiceClient` reel
- [x] Client HTTP vers `core-notification-service`
  - [x] `NotificationServiceClient`
  - [x] `sendSubscriptionConfirmation(userId, planName)`
  - [x] `sendPaymentFailed(userId)`
  - [x] `sendSubscriptionCanceled(userId)`

### Securite

> **Principe** : La Gateway valide le JWT en amont. Ce service ne valide pas
> le token lui-meme. Il le transmet au `core-user-service` pour resoudre l'identite.

- [x] JwtAuthGuard (token pre-valide par la Gateway)
  - [x] Extraction du token Bearer depuis le header Authorization
  - [x] Appel `UserServiceClient.getUserFromToken(token)` pour obtenir userId/email
  - [x] Injection de l'identite utilisateur dans `req.user`
  - [x] Gestion des erreurs 401 (token absent, user-service injoignable)
- [x] Service-only Guard pour endpoints internes
  - [x] Validation API key interne
  - [x] Whitelist des services autorises
- [x] Validation signature Stripe webhooks
  - [x] Middleware de verification
  - [x] Gestion erreurs signature invalide
- [x] Rate limiting
  - [x] Configuration par endpoint
  - [x] 50 req/min pour /subscriptions
  - [x] 100 req/min pour /quotas

### Configuration Plans

- [x] Fichier de configuration des plans
- [x] Plan Free
  - [x] 3 generations/mois
  - [x] 1 GB stockage
  - [x] Export 720p
  - [x] Watermark
- [x] Plan Premium
  - [x] 50 generations/mois
  - [x] 10 GB stockage
  - [x] Export 1080p
  - [x] Sans watermark
- [x] Plan Enterprise
  - [x] Generations illimitees
  - [x] 100 GB stockage
  - [x] Export 4K
  - [x] Sans watermark

### Gestion des erreurs

- [x] Exception filters globaux
- [x] Codes erreur standardises
  - [x] SUBSCRIPTION_NOT_FOUND
  - [x] QUOTA_EXCEEDED
  - [x] PAYMENT_FAILED
  - [x] INVALID_PLAN
  - [x] STRIPE_ERROR
- [x] Responses d'erreur formatees

---

## P2 - Important (Qualite)

### Tests

#### Tests unitaires

- [x] `SubscriptionService.spec.ts`
  - [x] Test getPlans()
  - [x] Test getCurrentSubscription()
  - [x] Test createCheckoutSession()
  - [x] Test cancelSubscription()
  - [x] Test activateSubscription()
  - [x] Test upgradePlan()
  - [x] Test downgradePlan()
  - [x] Test createPortalSession()
- [x] `QuotaService.spec.ts`
  - [x] Test getUserQuota()
  - [x] Test consumeQuota() - succes
  - [x] Test consumeQuota() - quota depasse
  - [x] Test checkQuotaAvailable() - generation
  - [x] Test checkQuotaAvailable() - storage
  - [x] Test resetQuota()
- [x] `WebhookService.spec.ts`
  - [x] Test tous les handlers d'events
  - [x] Test customer.subscription.created
  - [x] Test customer.subscription.updated (avec/sans userId)
- [x] `StripeAdapter.spec.ts`
  - [x] Mocks Stripe SDK

#### Tests controllers

- [x] `SubscriptionController.spec.ts`
  - [x] upgradePlan, downgradePlan, getPortalSession
- [x] `QuotaController.spec.ts`
  - [x] resetQuota
- [x] `WebhookController.spec.ts`

#### Tests integration

- [ ] `subscription.e2e-spec.ts`
  - [ ] Workflow complet checkout
  - [ ] Workflow annulation
- [ ] `webhook.e2e-spec.ts`
  - [ ] Simulation events Stripe
- [ ] `quota.e2e-spec.ts`
  - [ ] Workflow consommation

#### Tests Guards / Auth

- [x] `JwtAuthGuard.spec.ts`
  - [x] Test extraction Bearer token
  - [x] Test appel UserServiceClient.getUserFromToken()
  - [x] Test injection req.user avec userId/email
  - [x] Test 401 si token absent
  - [x] Test 401 si user-service retourne erreur
- [x] `ServiceKeyGuard.spec.ts`
  - [x] Test cle valide → true
  - [x] Test cle absente → 401
  - [x] Test cle invalide → 401
  - [x] Test whitelist ALLOWED_SERVICES — service autorise → true
  - [x] Test whitelist ALLOWED_SERVICES — service non autorise → 403
  - [x] Test whitelist sans x-service-name → 403

#### Tests middleware

- [x] `GlobalExceptionFilter.spec.ts`
  - [x] HttpException objet → format standardise
  - [x] HttpException string → format standardise
  - [x] Error generique → 500
  - [x] errorCode present → expose dans la reponse
  - [x] timestamp ISO valide

#### Mocks

- [x] `stripe.mock.ts` - Mock complet Stripe SDK
- [x] `database.mock.ts` - Mock core-database-service
- [x] `user-service.mock.ts` - Mock core-user-service
  - [x] `getUserFromToken()` retournant `UserIdentity` fixe (`{ id, email, tier }`)
  - [x] `getUserById()` retournant profil utilisateur de test
  - [x] `updateUserTier()` retournant `{ success: true }`
- [x] `notification.mock.ts` - Mock core-notification-service

#### Couverture

- [x] Atteindre couverture > 80%
- [x] Configuration Jest coverage (collectCoverageFrom excluant wrappers HTTP, modules, entities, DTOs)
- [ ] Rapport coverage HTML

### Logging

- [x] Installation Winston ou Pino
- [x] Configuration logging JSON structure
  - [x] timestamp (ISO 8601)
  - [x] level (debug/info/warn/error)
  - [x] message
  - [x] service: "core-payment-service"
  - [ ] version
  - [ ] correlation_id
- [ ] Middleware correlation ID
  - [ ] Extraction header `x-correlation-id`
  - [ ] Propagation aux services appeles
- [x] Logs pour:
  - [x] Requetes HTTP entrantes
  - [x] Appels services externes
  - [x] Events Stripe recus
  - [x] Erreurs avec stack trace

### Health Checks

- [x] `GET /health` - Etat general
- [x] `GET /health/ready` - Readiness
  - [ ] Verification connexion database
  - [ ] Verification connexion Stripe
- [ ] `GET /health/live` - Liveness

### Documentation API

- [x] Installation `@nestjs/swagger`
- [x] Configuration Swagger UI sur `/api/docs`
- [ ] Documentation tous les endpoints
  - [ ] Descriptions
  - [ ] Exemples request/response
  - [ ] Codes de statut
- [ ] Schemas DTOs documentes

### Validation

- [x] Installation `class-validator` + `class-transformer`
- [x] Validation globale (ValidationPipe)
- [x] Validation DTOs
  - [x] @IsUUID()
  - [x] @IsString()
  - [x] @IsEnum()
  - [x] @IsNumber()
  - [x] @IsUrl()
  - [x] @Min() / @Max()

---

## P3 - Nice-to-have (Optimisations)

### Monitoring Prometheus

- [ ] Installation `@willsoto/nestjs-prometheus`
- [ ] Endpoint `/metrics`
- [ ] Metriques HTTP
  - [ ] `http_request_duration_seconds` (histogram)
  - [ ] `http_requests_total` (counter)
  - [ ] `http_request_errors_total` (counter)
- [ ] Metriques business
  - [ ] `payment_checkout_total{status}` (counter)
  - [ ] `payment_webhook_received_total{event}` (counter)
  - [ ] `subscription_active_total{plan}` (gauge)
  - [ ] `quota_consumption_total{type}` (counter)
  - [ ] `payment_amount_total{currency}` (counter)

### Alertes

- [ ] Configuration regles Prometheus
  - [ ] Alerte payment_failure_rate > 5%
  - [ ] Alerte webhook_processing_error
  - [ ] Alerte service_unavailable
- [ ] Integration Slack/PagerDuty

### Circuit Breaker

- [ ] Installation `@nestjs/terminus` ou `opossum`
- [ ] Circuit breaker pour Stripe API
- [ ] Circuit breaker pour core-user-service
- [ ] Circuit breaker pour core-notification-service
- [ ] Configuration seuils
  - [ ] Failure threshold: 5
  - [ ] Success threshold: 3
  - [ ] Timeout: 30s

### Retry Policies

- [ ] Retry automatique webhooks (max 3)
- [ ] Exponential backoff
- [ ] Dead letter queue pour echecs

### Idempotency

- [ ] Idempotency keys pour checkout
- [ ] Prevention double processing webhooks

### Features avancees

- [ ] Gestion des factures
  - [ ] `GET /api/v1/invoices` - Liste factures
  - [ ] `GET /api/v1/invoices/:id` - Detail facture
  - [ ] `GET /api/v1/invoices/:id/pdf` - PDF facture
- [ ] Historique des paiements
  - [ ] `GET /api/v1/payments/history` - Historique
- [ ] Gestion des remboursements
  - [ ] `POST /api/v1/refunds` - Demande remboursement
- [ ] Coupons et promotions
  - [ ] `POST /api/v1/coupons/apply` - Appliquer coupon
  - [ ] Integration Stripe Coupons
- [ ] Periodes d'essai
  - [ ] Configuration trial_period_days
  - [ ] Workflow fin de trial

### Infrastructure avancee

- [ ] Helm chart pour Kubernetes
- [ ] Configuration HPA (autoscaling)
- [ ] PodDisruptionBudget
- [ ] NetworkPolicy
- [ ] ServiceAccount avec RBAC minimal

---

## Progression

### Statistiques

| Priorite | Total | Termine | Progression |
|----------|-------|---------|-------------|
| P0 | 90 | 90 | 100% |
| P1 | 65 | 65 | 100% |
| P2 | 77 | 67 | 87% |
| P3 | 55 | 0 | 0% |
| **Total** | **287** | **222** | **77%** |

### Jalons

| Jalon | Priorites | Date cible | Statut |
|-------|-----------|------------|--------|
| MVP Ready | P0 + P1 | TBD | En attente |
| Production Ready | P0 + P1 + P2 | TBD | En attente |
| Feature Complete | Toutes | TBD | En attente |

---

## Notes

### Definition of Done (DoD)

Une tache est consideree comme terminee quand:
- [ ] Code implemente et fonctionnel
- [ ] Tests unitaires ecrits (couverture > 80%)
- [ ] Code review effectuee
- [ ] Documentation mise a jour si necessaire
- [ ] Pas de regressions sur les tests existants

### References

- [Documentation microservice](./docs/microservices/core-payment-service.md)
- [Guide developpeur VisioBook](./docs/dev/guide-developpeur.md)
- [User Stories](./docs/epics/user_stories.md)
- [Stripe API Documentation](https://stripe.com/docs/api)
- [NestJS Documentation](https://docs.nestjs.com/)

---

*Derniere mise a jour: 2026-04-03 — v0.6.0 Migration vers PostgreSQL direct avec TypeORM (remplacement core-database-service)*
