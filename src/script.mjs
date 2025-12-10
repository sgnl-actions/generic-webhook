/**
 * Generic Webhook Action
 *
 * Makes custom HTTP requests to any endpoint with flexible configuration.
 * Supports all standard HTTP methods and custom headers/body.
 */

import { getAuthorizationHeader, getBaseURL, resolveJSONPathTemplates} from '@sgnl-actions/utils';

/**
 * Helper function to make HTTP request
 * @param {string} method - HTTP method
 * @param {string} url - Full URL to send request to
 * @param {Object} headers - Headers to include
 * @param {string} body - Request body (for methods that support it)
 * @param {number[]} acceptedStatusCodes - Additional status codes to treat as success
 * @returns {Promise<Object>} Response object with statusCode, body, and success flag
 */
async function makeWebhookRequest(method, url, headers, body, acceptedStatusCodes = []) {
  const options = {
    method: method.toUpperCase(),
    headers: headers || {}
  };

  // Only add body for methods that support it
  const methodsWithBody = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (methodsWithBody.includes(options.method) && body) {
    options.body = body;
    // Set Content-Type if not already set and we have a body
    if (!options.headers['Content-Type'] && !options.headers['content-type']) {
      options.headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(url, options);

  // Read response body
  let responseBody = '';
  try {
    responseBody = await response.text();
  } catch {
    // If we can't read the body, that's okay
    responseBody = '';
  }

  // Determine if request was successful
  // Success = 2xx status OR status is in acceptedStatusCodes array
  const isSuccess = (response.status >= 200 && response.status < 300) ||
                    (acceptedStatusCodes && acceptedStatusCodes.includes(response.status));

  return {
    statusCode: response.status,
    body: responseBody,
    success: isSuccess
  };
}

export default {
  /**
   * Main execution handler
   * @param {Object} params - Input parameters
   * @param {string} params.method - HTTP method
   * @param {string} params.requestBody - Request body (for methods that support it)
   * @param {string} params.requestHeaders - Headers to include
   * @param {string} params.address - Full URL to send request to
   *
   * @param {Object} context - Execution context with secrets and environment
   * @param {string} context.environment.ADDRESS - Default target address for the request
   *
   * The configured auth type will determine which of the following environment variables and secrets are available
   * @param {string} context.secrets.BEARER_AUTH_TOKEN
   *
   * @param {string} context.secrets.BASIC_USERNAME
   * @param {string} context.secrets.BASIC_PASSWORD
   *
   * @param {string} context.secrets.OAUTH2_CLIENT_CREDENTIALS_CLIENT_SECRET
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_AUDIENCE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_AUTH_STYLE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_CLIENT_ID
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_SCOPE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_TOKEN_URL
   *
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN
   *
   * @returns {Promise<Object>} Action result
   */
  invoke: async (params, context) => {
    const jobContext = context.data || {};

    // Resolve JSONPath templates in params
    const { result: resolvedParams, errors } = resolveJSONPathTemplates(params, jobContext);
    if (errors.length > 0) {
      console.warn('Template resolution errors:', errors);
    }

    // Validate required parameters
    if (!resolvedParams.method) {
      throw new Error('method is required');
    }

    // Build the URL using utility function
    // getBaseUrl handles params.address vs context.environment.ADDRESS and removes trailing slashes
    let url;
    try {
      url = getBaseURL(resolvedParams, context);
    } catch (error) {
      // If addressSuffix is provided but no base URL, give a more specific error
      if (resolvedParams.addressSuffix) {
        throw new Error('addressSuffix provided but no base address available. Provide either address parameter or ADDRESS environment variable');
      }
      throw error;
    }

    // Append suffix if provided
    if (resolvedParams.addressSuffix) {
      // getBaseUrl already removed trailing slash from base URL
      // Add leading slash to suffix if it doesn't have one
      const suffix = resolvedParams.addressSuffix.startsWith('/') ? resolvedParams.addressSuffix : '/' + resolvedParams.addressSuffix;
      url = url + suffix;
    }

    // Parse request headers if provided as JSON string
    let headers = {};
    if (resolvedParams.requestHeaders) {
      try {
        if (typeof resolvedParams.requestHeaders === 'string') {
          headers = JSON.parse(resolvedParams.requestHeaders);
        } else if (typeof resolvedParams.requestHeaders === 'object') {
          headers = resolvedParams.requestHeaders;
        }
      } catch (e) {
        throw new Error(`Failed to parse requestHeaders: ${e.message}`);
      }
    }

    // Add authentication if available in context and not already set in headers
    if (!headers.Authorization && !headers.authorization) {
      try {
        const authHeader = await getAuthorizationHeader(context);
        headers.Authorization = authHeader;
      } catch (error) {
        // If no auth is configured, that's okay for generic webhook - it's optional
        // Only throw if it's an error other than "no auth configured"
        if (!error.message.includes('No authentication configured')) {
          throw error;
        }
      }
    }

    // Parse request body if provided
    let body = resolvedParams.requestBody;
    if (body && typeof body === 'object') {
      // If body is already an object, stringify it
      body = JSON.stringify(body);
    }

    // Parse accepted status codes
    let acceptedStatusCodes = [];
    if (resolvedParams.acceptedStatusCodes) {
      if (Array.isArray(resolvedParams.acceptedStatusCodes)) {
        acceptedStatusCodes = resolvedParams.acceptedStatusCodes;
      } else if (typeof resolvedParams.acceptedStatusCodes === 'string') {
        try {
          acceptedStatusCodes = JSON.parse(resolvedParams.acceptedStatusCodes);
        } catch (e) {
          throw new Error(`Failed to parse acceptedStatusCodes: ${e.message}`);
        }
      }
    }

    // Make the HTTP request
    const result = await makeWebhookRequest(
      resolvedParams.method,
      url,
      headers,
      body,
      acceptedStatusCodes
    );

    // Add execution timestamp
    result.executedAt = new Date().toISOString();

    // Return successful response with the result
    return {
      status: 'success',
      data: result
    };
  },

  /**
   * Error handler for retryable failures
   * @param {Object} params - Contains the error from invoke
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Recovery result or throws for fatal errors
   */
  error: async (params, _context) => {
    const { error } = params;

    // Check if it's a network-related error (retryable)
    if (error.message && (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('fetch failed') ||
      error.message.includes('network')
    )) {
      // Network errors are retryable
      return { status: 'retry_requested' };
    }

    // Validation errors are fatal
    if (error.message && (
      error.message.includes('is required') ||
      error.message.includes('Failed to parse') ||
      error.message.includes('No URL specified')
    )) {
      throw error; // Re-throw to mark as fatal
    }

    // Default: let framework retry
    return { status: 'retry_requested' };
  },

  /**
   * Cleanup handler
   * @param {Object} params - Input parameters
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Cleanup result
   */
  halt: async (_params, _context) => {
    // No cleanup needed for webhook action
    return { status: 'halted' };
  }
};