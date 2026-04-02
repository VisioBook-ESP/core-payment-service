import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from '../../../src/middleware/http-exception.filter';

function buildHost(mockResponse: { status: jest.Mock; json: jest.Mock }): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
    }),
  } as unknown as ArgumentsHost;
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockResponse: { status: jest.Mock; json: jest.Mock };

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('should handle HttpException with object response', () => {
    const exception = new HttpException(
      { message: 'Not found', error: 'NOT_FOUND' },
      HttpStatus.NOT_FOUND,
    );

    filter.catch(exception, buildHost(mockResponse));

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Not found', error: 'NOT_FOUND' }),
    );
  });

  it('should handle HttpException with string response', () => {
    const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

    filter.catch(exception, buildHost(mockResponse));

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'Forbidden' }),
    );
  });

  it('should handle generic Error as 500', () => {
    const exception = new Error('Unexpected crash');

    filter.catch(exception, buildHost(mockResponse));

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: 'Unexpected crash' }),
    );
  });

  it('should include errorCode when present in exception response', () => {
    const exception = new HttpException(
      { message: 'Subscription not found', error: 'NOT_FOUND', errorCode: 'SUBSCRIPTION_NOT_FOUND' },
      HttpStatus.NOT_FOUND,
    );

    filter.catch(exception, buildHost(mockResponse));

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'SUBSCRIPTION_NOT_FOUND' }),
    );
  });

  it('should include a valid ISO timestamp in the response', () => {
    const exception = new HttpException('Bad request', HttpStatus.BAD_REQUEST);

    filter.catch(exception, buildHost(mockResponse));

    const body = mockResponse.json.mock.calls[0][0] as { timestamp: string };
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
