import { jest } from '@jest/globals';
import script from '../src/script.mjs';

// Mock fetch globally
global.fetch = jest.fn();

describe('Generic Webhook Action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('invoke handler', () => {
    it('should successfully make a GET request with full address', async () => {
      const mockResponse = {
        status: 200,
        text: jest.fn().mockResolvedValue('{"result":"success"}')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'GET',
        address: 'https://api.example.com/endpoint'
      };

      const context = {};

      const result = await script.invoke(params, context);

      expect(result).toEqual({
        status: 'success',
        data: {
          statusCode: 200,
          body: '{"result":"success"}',
          success: true,
          executedAt: expect.any(String)
        }
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/endpoint',
        {
          method: 'GET',
          headers: {}
        }
      );
    });

    it('should successfully make a POST request with body and headers', async () => {
      const mockResponse = {
        status: 201,
        text: jest.fn().mockResolvedValue('{"id":"123"}')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'POST',
        address: 'https://api.example.com',
        addressSuffix: 'users',
        requestBody: '{"name":"John Doe"}',
        requestHeaders: '{"X-Custom-Header":"value"}'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'secret-token'
        }
      };

      const result = await script.invoke(params, context);

      expect(result.status).toBe('success');
      expect(result.data.statusCode).toBe(201);
      expect(result.data.success).toBe(true);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        {
          method: 'POST',
          headers: {
            'X-Custom-Header': 'value',
            'Authorization': 'Bearer secret-token',
            'Content-Type': 'application/json'
          },
          body: '{"name":"John Doe"}'
        }
      );
    });

    it('should use ADDRESS from environment when address param not provided', async () => {
      const mockResponse = {
        status: 200,
        text: jest.fn().mockResolvedValue('OK')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'DELETE',
        addressSuffix: '/items/123'
      };

      const context = {
        environment: {
          ADDRESS: 'https://api.example.com/v1'
        }
      };

      const result = await script.invoke(params, context);

      expect(result.status).toBe('success');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/v1/items/123',
        expect.any(Object)
      );
    });

    it('should handle accepted status codes', async () => {
      const mockResponse = {
        status: 404,
        text: jest.fn().mockResolvedValue('Not Found')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'GET',
        address: 'https://api.example.com/user/999',
        acceptedStatusCodes: [404, 410]
      };

      const context = {};

      const result = await script.invoke(params, context);

      expect(result.status).toBe('success');
      expect(result.data.statusCode).toBe(404);
      expect(result.data.success).toBe(true); // 404 is in acceptedStatusCodes
    });

    it('should handle object request body', async () => {
      const mockResponse = {
        status: 200,
        text: jest.fn().mockResolvedValue('OK')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'PATCH',
        address: 'https://api.example.com/update',
        requestBody: { key: 'value', nested: { data: true } }
      };

      const context = {};

      await script.invoke(params, context);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/update',
        expect.objectContaining({
          body: '{"key":"value","nested":{"data":true}}'
        })
      );
    });

    it('should handle object request headers', async () => {
      const mockResponse = {
        status: 200,
        text: jest.fn().mockResolvedValue('OK')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'PUT',
        address: 'https://api.example.com/resource',
        requestHeaders: {
          'X-API-Key': 'key123',
          'X-Request-ID': 'req456'
        }
      };

      const context = {};

      await script.invoke(params, context);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/resource',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'key123',
            'X-Request-ID': 'req456'
          })
        })
      );
    });

    it('should not add body for GET requests', async () => {
      const mockResponse = {
        status: 200,
        text: jest.fn().mockResolvedValue('OK')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'GET',
        address: 'https://api.example.com',
        requestBody: '{"should":"be ignored"}'
      };

      const context = {};

      await script.invoke(params, context);

      const callArgs = global.fetch.mock.calls[0][1];
      expect(callArgs.body).toBeUndefined();
    });

    it('should handle URL with trailing slash and suffix with leading slash', async () => {
      const mockResponse = {
        status: 200,
        text: jest.fn().mockResolvedValue('OK')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'GET',
        address: 'https://api.example.com/',
        addressSuffix: '/endpoint'
      };

      const context = {};

      await script.invoke(params, context);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/endpoint',
        expect.any(Object)
      );
    });

    it('should throw error when method is missing', async () => {
      const params = {
        address: 'https://api.example.com'
      };

      const context = {};

      await expect(script.invoke(params, context)).rejects.toThrow('method is required');
    });

    it('should throw error when no URL can be determined', async () => {
      const params = {
        method: 'GET'
      };

      const context = {};

      await expect(script.invoke(params, context)).rejects.toThrow('No URL specified');
    });

    it('should throw error when addressSuffix provided without base', async () => {
      const params = {
        method: 'GET',
        addressSuffix: '/endpoint'
      };

      const context = {};

      await expect(script.invoke(params, context)).rejects.toThrow('addressSuffix provided but no base address available');
    });

    it('should throw error for invalid JSON headers', async () => {
      const params = {
        method: 'GET',
        address: 'https://api.example.com',
        requestHeaders: 'invalid json'
      };

      const context = {};

      await expect(script.invoke(params, context)).rejects.toThrow('Failed to parse requestHeaders');
    });

    it('should throw error for invalid JSON accepted status codes', async () => {
      const params = {
        method: 'GET',
        address: 'https://api.example.com',
        acceptedStatusCodes: 'invalid json'
      };

      const context = {};

      await expect(script.invoke(params, context)).rejects.toThrow('Failed to parse acceptedStatusCodes');
    });

    it('should handle response without body gracefully', async () => {
      const mockResponse = {
        status: 204,
        text: jest.fn().mockRejectedValue(new Error('No content'))
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'DELETE',
        address: 'https://api.example.com/resource'
      };

      const context = {};

      const result = await script.invoke(params, context);

      expect(result.status).toBe('success');
      expect(result.data.statusCode).toBe(204);
      expect(result.data.body).toBe('');
      expect(result.data.success).toBe(true);
    });

    it('should not override existing Authorization header', async () => {
      const mockResponse = {
        status: 200,
        text: jest.fn().mockResolvedValue('OK')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'GET',
        address: 'https://api.example.com',
        requestHeaders: '{"Authorization":"Custom auth"}'
      };

      const context = {
        secrets: {
          AUTH_TOKEN: 'should-not-be-used'
        }
      };

      await script.invoke(params, context);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Custom auth'
          })
        })
      );
    });

    it('should mark non-2xx status as failed when not in acceptedStatusCodes', async () => {
      const mockResponse = {
        status: 400,
        text: jest.fn().mockResolvedValue('Bad Request')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'POST',
        address: 'https://api.example.com/fail'
      };

      const context = {};

      await expect(script.invoke(params, context)).rejects.toThrow(
        'Request failed with status code: 400. Response body: Bad Request.'
      );
    });

    it('should throw error with proper format for failed requests with JSON response', async () => {
      const mockResponse = {
        status: 500,
        text: jest.fn().mockResolvedValue('{"error":"Internal server error","details":"Database connection failed"}')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'POST',
        address: 'https://api.example.com/users',
        requestBody: '{"name":"test"}'
      };

      const context = {};

      await expect(script.invoke(params, context)).rejects.toThrow(
        'Request failed with status code: 500. Response body: {"error":"Internal server error","details":"Database connection failed"}.'
      );
    });

    it('should throw error for 404 when not in acceptedStatusCodes', async () => {
      const mockResponse = {
        status: 404,
        text: jest.fn().mockResolvedValue('Not found')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'GET',
        address: 'https://api.example.com/missing'
      };

      const context = {};

      await expect(script.invoke(params, context)).rejects.toThrow(
        'Request failed with status code: 404. Response body: Not found.'
      );
    });

    it('should handle array of accepted status codes as array', async () => {
      const mockResponse = {
        status: 202,
        text: jest.fn().mockResolvedValue('Accepted')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'POST',
        address: 'https://api.example.com/async',
        acceptedStatusCodes: [200, 201, 202, 204]
      };

      const context = {};

      const result = await script.invoke(params, context);

      expect(result.status).toBe('success');
      expect(result.data.statusCode).toBe(202);
      expect(result.data.success).toBe(true);
    });

    it('should add Content-Type header only when body is present', async () => {
      const mockResponse = {
        status: 200,
        text: jest.fn().mockResolvedValue('OK')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'POST',
        address: 'https://api.example.com/endpoint',
        requestBody: '{"data":"value"}'
      };

      const context = {};

      await script.invoke(params, context);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/endpoint',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should not override user-provided Content-Type header', async () => {
      const mockResponse = {
        status: 200,
        text: jest.fn().mockResolvedValue('OK')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'POST',
        address: 'https://api.example.com/endpoint',
        requestBody: 'plain text data',
        requestHeaders: { 'Content-Type': 'text/plain' }
      };

      const context = {};

      await script.invoke(params, context);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/endpoint',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'text/plain'
          })
        })
      );
    });

    it('should handle DELETE method with body', async () => {
      const mockResponse = {
        status: 200,
        text: jest.fn().mockResolvedValue('Deleted')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'DELETE',
        address: 'https://api.example.com/bulk-delete',
        requestBody: '{"ids":[1,2,3]}'
      };

      const context = {};

      await script.invoke(params, context);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/bulk-delete',
        expect.objectContaining({
          method: 'DELETE',
          body: '{"ids":[1,2,3]}'
        })
      );
    });

    it('should handle case-insensitive HTTP methods', async () => {
      const mockResponse = {
        status: 200,
        text: jest.fn().mockResolvedValue('OK')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'post',
        address: 'https://api.example.com/endpoint',
        requestBody: '{"test":"data"}'
      };

      const context = {};

      await script.invoke(params, context);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/endpoint',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('should include executedAt timestamp in successful response', async () => {
      const mockResponse = {
        status: 200,
        text: jest.fn().mockResolvedValue('OK')
      };
      global.fetch.mockResolvedValue(mockResponse);

      const params = {
        method: 'GET',
        address: 'https://api.example.com/endpoint'
      };

      const context = {};

      const beforeTime = new Date().toISOString();
      const result = await script.invoke(params, context);
      const afterTime = new Date().toISOString();

      expect(result.data.executedAt).toBeDefined();
      expect(result.data.executedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(result.data.executedAt >= beforeTime).toBe(true);
      expect(result.data.executedAt <= afterTime).toBe(true);
    });
  });

  describe('error handler', () => {
    it('should mark network errors as retryable', async () => {
      const params = {
        error: new Error('fetch failed: ECONNREFUSED')
      };
      const context = {};

      const result = await script.error(params, context);

      expect(result).toEqual({ status: 'retry_requested' });
    });

    it('should mark timeout errors as retryable', async () => {
      const params = {
        error: new Error('Request timeout: ETIMEDOUT')
      };
      const context = {};

      const result = await script.error(params, context);

      expect(result).toEqual({ status: 'retry_requested' });
    });

    it('should mark ENOTFOUND errors as retryable', async () => {
      const params = {
        error: new Error('getaddrinfo ENOTFOUND api.example.com')
      };
      const context = {};

      const result = await script.error(params, context);

      expect(result).toEqual({ status: 'retry_requested' });
    });

    it('should mark generic network errors as retryable', async () => {
      const params = {
        error: new Error('network error occurred')
      };
      const context = {};

      const result = await script.error(params, context);

      expect(result).toEqual({ status: 'retry_requested' });
    });

    it('should mark validation errors as fatal', async () => {
      const params = {
        error: new Error('method is required')
      };
      const context = {};

      await expect(script.error(params, context)).rejects.toThrow('method is required');
    });

    it('should mark parse errors as fatal', async () => {
      const params = {
        error: new Error('Failed to parse requestHeaders: Unexpected token')
      };
      const context = {};

      await expect(script.error(params, context)).rejects.toThrow('Failed to parse requestHeaders');
    });

    it('should mark missing URL errors as fatal', async () => {
      const params = {
        error: new Error('No URL specified. Provide either address parameter or ADDRESS environment variable')
      };
      const context = {};

      await expect(script.error(params, context)).rejects.toThrow('No URL specified');
    });

    it('should mark HTTP error as retryable by default', async () => {
      const params = {
        error: new Error('Request failed with status code: 500. Response body: Internal Server Error.')
      };
      const context = {};

      const result = await script.error(params, context);

      expect(result).toEqual({ status: 'retry_requested' });
    });

    it('should mark HTTP 400 error as retryable by default', async () => {
      const params = {
        error: new Error('Request failed with status code: 400. Response body: Bad Request.')
      };
      const context = {};

      const result = await script.error(params, context);

      expect(result).toEqual({ status: 'retry_requested' });
    });

    it('should default to retryable for unknown errors', async () => {
      const params = {
        error: new Error('Something unexpected happened')
      };
      const context = {};

      const result = await script.error(params, context);

      expect(result).toEqual({ status: 'retry_requested' });
    });
  });

  describe('halt handler', () => {
    it('should return halted status', async () => {
      const params = {};
      const context = {};

      const result = await script.halt(params, context);

      expect(result).toEqual({ status: 'halted' });
    });
  });
});