# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-03-27

### Added
- **`POST /api/v1/subscriptions/payment-intent`** : nouvel endpoint pour le parcours de paiement natif in-app (flutter_stripe Payment Sheet)
  - Crée une subscription Stripe en statut `incomplete` via `payment_behavior: 'default_incomplete'`
  - Retourne `{ clientSecret, customerId, ephemeralKey, subscriptionId }` prêts à être passés à `flutter_stripe initPaymentSheet()`
  - L'activation de l'abonnement est déclenchée automatiquement par le webhook `customer.subscription.updated` après confirmation du paiement côté mobile
- **`StripeAdapter.createSubscriptionWithPaymentIntent()`** : crée une subscription Stripe incomplète avec PaymentIntent embarqué (expand `latest_invoice.payment_intent`), définit les metadata `userId` / `planId` sur la subscription pour la résolution webhook
- **`StripeAdapter.createEphemeralKey()`** : génère une ephemeral key Stripe liée au customer pour flutter_stripe
- **`src/dto/payment-intent.dto.ts`** : `PaymentIntentRequestDto` (`planId`, `interval`) et `PaymentIntentResponseDto` (`clientSecret`, `customerId`, `ephemeralKey`, `subscriptionId`)

### Changed
- **`WebhookService.handleSubscriptionUpdated()`** : gère désormais le cas `status → active` en appelant `SubscriptionService.activateSubscription()` (mise à jour DB, tier utilisateur, quotas, notification) — couvre le flux Payment Sheet où la subscription transite de `incomplete` à `active` après confirmation du paiement
  - Le `planId` est dérivé du `priceId` Stripe actuel (lookup dans `PLANS`) plutôt que des metadata, pour être robuste aux upgrades/downgrades où les metadata peuvent être obsolètes

## [0.3.5] - 2026-03-20

### Added
- **`tests/unit/controllers/webhook.controller.spec.ts`** : 3 tests unitaires couvrant `WebhookController`
  - Webhook valide → `{ received: true }`
  - Header `stripe-signature` absent → 400
  - Signature invalide (Stripe SDK throw) → 400
- **`tests/unit/guards/service-key.guard.spec.ts`** : 6 tests unitaires couvrant `ServiceKeyGuard`
  - Clé valide → true
  - Clé absente → 401
  - Clé invalide → 401
  - Whitelist `ALLOWED_SERVICES` — service autorisé → true
  - Whitelist — service non autorisé → 403
  - Whitelist — `x-service-name` absent → 403
- **`tests/unit/middleware/http-exception.filter.spec.ts`** : 5 tests unitaires couvrant `GlobalExceptionFilter`
  - `HttpException` objet → format standardisé avec statusCode/error/message
  - `HttpException` string → format standardisé
  - `Error` générique → 500
  - `errorCode` présent → exposé dans la réponse
  - Timestamp ISO valide dans chaque réponse

### Changed
- **`tests/unit/services/subscription.service.spec.ts`** : +11 tests — `upgradePlan` (6 cas), `downgradePlan` (5 cas), `createPortalSession` (3 cas)
- **`tests/unit/controllers/subscription.controller.spec.ts`** : +3 tests — `upgradePlan`, `downgradePlan`, `getPortalSession`
- **`tests/unit/services/quota.service.spec.ts`** : +4 tests — `resetQuota` (2 cas), `checkQuotaAvailable` storage (2 cas)
- **`tests/unit/controllers/quota.controller.spec.ts`** : +1 test — `resetQuota`
- **`tests/unit/services/webhook.service.spec.ts`** : +3 tests — `customer.subscription.created`, `customer.subscription.updated` (avec/sans userId)
- **`tests/mocks/database.mock.ts`** : ajout de `updateSubscriptionPlan` et `resetQuotaUsage`
- **`tests/mocks/stripe.mock.ts`** : ajout de `updateSubscription`
- **`package.json` Jest config** : `collectCoverageFrom` affiné — exclusion des wrappers HTTP (`database.client`, `notification.client`, `user-service.client`, `user-service.mock`), modules NestJS, entities, DTOs, health — la couverture mesure uniquement la logique métier du service

### Notes
- Couverture de tests > 80% atteinte sur le périmètre métier (adapters, guards, middleware, services, controllers)
- 88 tests, 100% pass

## [0.3.4] - 2026-03-20

### Added
- **`tests/unit/adapters/stripe.adapter.spec.ts`** : 10 tests unitaires couvrant l'intégralité du `StripeAdapter`
  - `createCustomer` (avec et sans nom)
  - `createCheckoutSession` (vérification des params Stripe)
  - `getSubscription`
  - `cancelSubscription`
  - `updateSubscription` (avec proration `create_prorations` et sans proration `none`)
  - `createPortalSession`
  - `verifyWebhookSignature` (succès + signature invalide → throw)
  - Stripe SDK mocké via `jest.mock('stripe')` — aucun appel réseau réel
- **`tests/unit/guards/jwt-auth.guard.spec.ts`** : 6 tests unitaires couvrant `JwtAuthGuard`
  - Token valide → `req.user` injecté avec `userId`, `email`, `tier`
  - Header `Authorization` absent → 401
  - Format non-Bearer (ex: Basic auth) → 401
  - Token vide après `Bearer ` → 401
  - `UserServiceClient.getUserFromToken()` throw → 401
  - `UserServiceClient` retourne 401 → 401 propagé

### Notes
- Configuration : `charts/values.yaml` est la source de vérité pour les variables d'environnement (Helm/K8s) — le `.env.example` est pour la doc locale uniquement

## [0.3.3] - 2026-03-13

### Changed
- **Price IDs Stripe mis à jour** dans `src/config/plans.config.ts` — compte test `acct_1Sq9o8HhqOObOnmX`
  - Premium mensuel : `price_1TAVJXHhqOObOnmXf8SOVKMG` (9,99 €/mois)
  - Premium annuel : `price_1TAVJXHhqOObOnmXvilu4kwL` (99,99 €/an)
  - Enterprise mensuel : `price_1TAVK5HhqOObOnmXnOwrpXtc` (29,99 €/mois)
  - Enterprise annuel : `price_1TAVK5HhqOObOnmXbjKcba8F` (299,99 €/an)

## [0.3.2] - 2026-03-13

### Changed
- **Price IDs Stripe mis à jour** dans `src/config/plans.config.ts` suite à la recréation des produits (compte `acct_1Sq9nqH9Hn5hxlVy`, abandonné)
  - Premium mensuel : `price_1TATnlH9Hn5hxlVyXLGJUfNt` (9,99 €/mois)
  - Premium annuel : `price_1TATnlH9Hn5hxlVyy2KdmUAY` (99,99 €/an)
  - Enterprise mensuel : `price_1TAToRH9Hn5hxlVy7hVyX7mi` (29,99 €/mois)
  - Enterprise annuel : `price_1TAToRH9Hn5hxlVyGDYLKaTc` (299,99 €/an)

## [0.3.1] - 2026-03-13

### Added
- **Stripe CLI v1.37.3** installé en dev local (binaire `/usr/local/bin/stripe`)
- **Price IDs réels** intégrés dans `src/config/plans.config.ts` (mode test Stripe)
  - Premium mensuel : `price_1TATFZH9Hn5hxlVy2cXGamSv` (9,99 €/mois)
  - Premium annuel : `price_1TATFZH9Hn5hxlVyBn36FLRW` (99,99 €/an)
  - Enterprise mensuel : `price_1TATHKH9Hn5hxlVy2UdtYoXF` (29,99 €/mois)
  - Enterprise annuel : `price_1TATHKH9Hn5hxlVydGlkDlGh` (299,99 €/an)
- **`PlanConfig.stripePriceIdYearly` / `priceYearly`** : support des tarifs annuels dans l'interface
- **`CreateCheckoutDto.interval`** : champ optionnel `"month" | "year"` pour choisir le cycle de facturation au checkout (défaut : `"month"`)

### Changed
- **`SubscriptionService.createCheckoutSession()`** : sélectionne automatiquement le price ID mensuel ou annuel selon le paramètre `interval`

## [0.3.0] - 2026-03-13

### Added
- **`POST /api/v1/subscriptions/upgrade`** : upgrade vers un plan superieur avec proration Stripe (`create_prorations`)
- **`POST /api/v1/subscriptions/downgrade`** : downgrade vers un plan inferieur sans proration
- **`GET /api/v1/subscriptions/portal`** : exposition du portail de facturation Stripe (query param `returnUrl`)
- **`POST /api/v1/quotas/reset`** : reinitialisation admin des quotas (generations_used + storage_used = 0)
- **`CancelSubscriptionDto`** : DTO avec champ `reason` optionnel
- **`ChangePlanDto`** : DTO partage pour upgrade/downgrade (`planId`)
- **`ResetQuotaDto`** : DTO admin pour reset quota (`userId`)
- **`PortalSessionRequestDto` / `PortalSessionResponseDto`** : DTOs portail Stripe
- **`src/common/payment.exceptions.ts`** : exceptions typees avec `errorCode` — `SubscriptionNotFoundException`, `InvalidPlanException`, `StripeException`, `PaymentFailedException`
- **`StripeAdapter.updateSubscription()`** : mise a jour d'un abonnement Stripe existant (change de price ID)
- **`DatabaseClient.updateSubscriptionPlan()`** : mise a jour du `plan_id` d'un abonnement
- **`DatabaseClient.resetQuotaUsage()`** : remise a zero de `generations_used`, `storage_used` et `reset_date`
- **`ServiceKeyGuard` whitelist** : support optionnel de `ALLOWED_SERVICES` (CSV) + header `x-service-name` pour restreindre les services autorises

### Changed
- **`GlobalExceptionFilter`** : le champ `errorCode` est maintenant expose dans la reponse si present dans l'exception
- **`SubscriptionService`** : remplacement des `NotFoundException` / `BadRequestException` generiques par `SubscriptionNotFoundException` et `InvalidPlanException`

## [0.2.3] - 2026-03-13

### Fixed
- **WebhookService `handleSubscriptionDeleted`** : utilisait `updateSubscriptionStatus` avec l'ID Stripe (`sub_xxx`) au lieu de l'UUID interne — remplacé par `updateSubscriptionStatusByStripeId`
- **WebhookService `handleSubscriptionUpdated`** : mapping de statut incomplet (`active` ou `past_due` seulement) — remplacé par une `statusMap` couvrant `active`, `trialing`, `canceled`, `past_due` (fallback `past_due` pour les statuts Stripe non gérés)
- **WebhookController** : double gestion de la réponse HTTP — suppression du `@Res()` manuel ; le controller retourne maintenant `{ received: true }` via NestJS (signature invalide → 400, traitement échoué → 500 géré par `GlobalExceptionFilter`)

### Added
- **`DatabaseClient.updateSubscriptionStatusByStripeId`** : nouvelle méthode pour mettre à jour le statut d'un abonnement via `stripe_subscription_id` (WHERE `stripe_subscription_id = ?`)
- **`mockDatabaseClient`** : ajout de `updateSubscriptionStatusByStripeId` dans le mock de test

## [0.2.2] - 2026-02-27

### Added
- **Contrat core-user-service** (README + TASKS) : documentation explicite du flux de resolution d'identite
  - Interface `UserIdentity` : contrat attendu de `GET /api/v1/users/me` (`{ id, email, tier }`)
  - Clarification que la source du token (Gateway ou autre upstream) est inconnue pour l'instant
    et sans importance pour ce service — le token est considere deja valide
  - Description etape par etape du role du `JwtAuthGuard` dans la resolution d'identite
- **Strategie de mock inter-services** (README + TASKS) : developpement et tests sans core-user-service
  - Variable d'env `USER_SERVICE_MOCK=true` pour activer l'injection du mock
  - `UserServiceMock` retournant un `UserIdentity` fixe (`mock-user-id-00000001`, `dev@visiobook.com`, `tier: premium`)
  - Injection conditionnelle : `UserServiceMock` si `USER_SERVICE_MOCK=true`, sinon `UserServiceClient` reel
  - Mock `user-service.mock.ts` etendu : `getUserFromToken`, `getUserById`, `updateUserTier`

## [0.2.1] - 2026-02-13

### Fixed
- **Entities TASKS.md** : alignement de la documentation sur le code implementé
  - `SubscriptionEntity.status` : ajout du statut `trialing` manquant
  - `TransactionEntity.status` : ajout des valeurs explicites (`succeeded`, `failed`, `pending`, `refunded`)
  - Convention de nommage : `created_at`/`updated_at` corrigés en `createdAt`/`updatedAt` (camelCase, conforme au code)

## [0.2.0] - 2026-02-13

### Changed
- **Architecture auth** : le JWT n'est plus valide par ce service.
  La Gateway valide le token en amont ; le `JwtAuthGuard` extrait le Bearer token
  et appelle `core-user-service GET /users/me` pour resoudre l'identite utilisateur (userId, email).
- Suppression de la dependance `JWT_SECRET` dans la configuration du service
- `UserServiceClient` : ajout methode `getUserFromToken(token)` pour la resolution d'identite via le token
- Mise a jour README.md, TASKS.md et CHANGELOG.md pour refleter ce changement

## [0.1.0] - 2026-02-06

### Added
- Initialisation projet NestJS avec TypeScript strict mode
- Configuration package.json avec scripts (dev, build, test, lint, e2e)
- ESLint (flat config) + Prettier
- ConfigModule avec .env.example (toutes les variables documentees)
- ValidationPipe globale (whitelist, forbidNonWhitelisted, transform)
- Swagger UI sur /api/docs
- Logging structure avec Pino (nestjs-pino)
- Rate limiting avec @nestjs/throttler
- Health checks (GET /health, GET /health/ready) via @nestjs/terminus
- Global exception filter avec format d'erreur standardise

- SubscriptionModule
  - GET /api/v1/subscriptions/plans (public)
  - GET /api/v1/subscriptions/current (auth JWT)
  - POST /api/v1/subscriptions/checkout (auth JWT)
  - POST /api/v1/subscriptions/cancel (auth JWT)

- QuotaModule
  - GET /api/v1/quotas (auth JWT)
  - POST /api/v1/quotas/consume (service-only, x-api-key)

- WebhookModule
  - POST /api/v1/webhooks/stripe (verification signature Stripe)
  - Handlers: checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed

- StripeAdapter (createCustomer, createCheckoutSession, getSubscription, cancelSubscription, createPortalSession, verifyWebhookSignature)
- Configuration des 3 plans (Free, Premium, Enterprise) avec limites
- Entities (Subscription, Quota, Transaction)
- DTOs avec validation class-validator
- Guards (JwtAuthGuard avec delegation auth Gateway, ServiceKeyGuard)
- Clients inter-services (DatabaseClient, UserServiceClient, NotificationClient)

- Docker multi-stage Dockerfile + Dockerfile.dev
- docker-compose.yml avec Redis
- Tests unitaires (SubscriptionService, QuotaService, WebhookService, controllers)
- Mocks complets (Stripe, Database, UserService, Notification)

---

*Format: [version] - date*
