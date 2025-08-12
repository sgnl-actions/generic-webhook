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
          AUTH_TOKEN: 'secret-token'
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

    it('should use BASE_URL from environment when address not provided', async () => {
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
          BASE_URL: 'https://api.example.com/v1'
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

      const result = await script.invoke(params, context);

      expect(result.status).toBe('success'); // Action succeeded
      expect(result.data.statusCode).toBe(400);
      expect(result.data.success).toBe(false); // But request failed
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
        error: new Error('No URL specified. Provide either address parameter or BASE_URL environment variable')
      };
      const context = {};

      await expect(script.error(params, context)).rejects.toThrow('No URL specified');
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