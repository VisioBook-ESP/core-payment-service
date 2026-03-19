import { HttpException, HttpStatus } from '@nestjs/common';

export class PaymentException extends HttpException {
  constructor(errorCode: string, message: string, status: HttpStatus) {
    super({ statusCode: status, errorCode, message }, status);
  }
}

export class SubscriptionNotFoundException extends PaymentException {
  constructor(message = 'Subscription not found') {
    super('SUBSCRIPTION_NOT_FOUND', message, HttpStatus.NOT_FOUND);
  }
}

export class InvalidPlanException extends PaymentException {
  constructor(message = 'Invalid plan') {
    super('INVALID_PLAN', message, HttpStatus.BAD_REQUEST);
  }
}

export class StripeException extends PaymentException {
  constructor(message = 'Stripe error') {
    super('STRIPE_ERROR', message, HttpStatus.BAD_GATEWAY);
  }
}

export class PaymentFailedException extends PaymentException {
  constructor(message = 'Payment failed') {
    super('PAYMENT_FAILED', message, HttpStatus.PAYMENT_REQUIRED);
  }
}
