/**
 * Generic Webhook Action
 *
 * Makes custom HTTP requests to any endpoint with flexible configuration.
 * Supports all standard HTTP methods and custom headers/body.
 */

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
   * * The configured auth type will determine which of the following secrets are available
   * @param {string} context.secrets.BEARER_AUTH_TOKEN
   * @param {string} context.secrets.BASIC_USERNAME
   * @param {string} context.secrets.BASIC_PASSWORD
   * @param {string} context.secrets.OAUTH2_CLIENT_CREDENTIALS_AUDIENCE
   * @param {string} context.secrets.OAUTH2_CLIENT_CREDENTIALS_AUTH_STYLE
   * @param {string} context.secrets.OAUTH2_CLIENT_CREDENTIALS_CLIENT_ID
   * @param {string} context.secrets.OAUTH2_CLIENT_CREDENTIALS_CLIENT_SECRET
   * @param {string} context.secrets.OAUTH2_CLIENT_CREDENTIALS_SCOPE
   * @param {string} context.secrets.OAUTH2_CLIENT_CREDENTIALS_TOKEN_URL
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_AUTH_STYLE
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_AUTH_URL
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_AUTHORIZATION_CODE
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_CLIENT_ID
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_CLIENT_SECRET
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_LAST_TOKEN_ROTATION_TIMESTAMP
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_REDIRECT_URI
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_REFRESH_TOKEN
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_SCOPE
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_TOKEN_LIFETIME_FREQUENCY
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_TOKEN_ROTATION_FREQUENCY
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_TOKEN_ROTATION_INTERVAL
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_TOKEN_URL
   *
   * @returns {Promise<Object>} Action result
   */
  invoke: async (params, context) => {
    // Validate required parameters
    if (!params.method) {
      throw new Error('method is required');
    }

    // Determine the URL to use
    let url;
    if (params.address) {
      // If full address is provided, use it directly
      url = params.address;
      // Append suffix if provided
      if (params.addressSuffix) {
        // Handle trailing/leading slashes to avoid double slashes
        if (url.endsWith('/') && params.addressSuffix.startsWith('/')) {
          url = url + params.addressSuffix.substring(1);
        } else if (!url.endsWith('/') && !params.addressSuffix.startsWith('/')) {
          url = url + '/' + params.addressSuffix;
        } else {
          url = url + params.addressSuffix;
        }
      }
    } else if (context.environment && context.environment.ADDRESS) {
      // Use base URL from environment
      url = context.environment.ADDRESS;
      if (params.addressSuffix) {
        // Handle trailing/leading slashes to avoid double slashes
        if (url.endsWith('/') && params.addressSuffix.startsWith('/')) {
          url = url + params.addressSuffix.substring(1);
        } else if (!url.endsWith('/') && !params.addressSuffix.startsWith('/')) {
          url = url + '/' + params.addressSuffix;
        } else {
          url = url + params.addressSuffix;
        }
      }
    } else if (params.addressSuffix) {
      throw new Error('addressSuffix provided but no base address available. Provide either address parameter or address environment variable');
    } else {
      throw new Error('No URL specified. Provide either address parameter or address environment variable');
    }

    // Parse request headers if provided as JSON string
    let headers = {};
    if (params.requestHeaders) {
      try {
        if (typeof params.requestHeaders === 'string') {
          headers = JSON.parse(params.requestHeaders);
        } else if (typeof params.requestHeaders === 'object') {
          headers = params.requestHeaders;
        }
      } catch (e) {
        throw new Error(`Failed to parse requestHeaders: ${e.message}`);
      }
    }

    // Add authentication if available in context
    if (context.secrets && context.secrets.BEARER_AUTH_TOKEN) {
      if (!headers.Authorization && !headers.authorization) {
        headers.Authorization = `Bearer ${context.secrets.BEARER_AUTH_TOKEN}`;
      }
    }

    // Parse request body if provided
    let body = params.requestBody;
    if (body && typeof body === 'object') {
      // If body is already an object, stringify it
      body = JSON.stringify(body);
    }

    // Parse accepted status codes
    let acceptedStatusCodes = [];
    if (params.acceptedStatusCodes) {
      if (Array.isArray(params.acceptedStatusCodes)) {
        acceptedStatusCodes = params.acceptedStatusCodes;
      } else if (typeof params.acceptedStatusCodes === 'string') {
        try {
          acceptedStatusCodes = JSON.parse(params.acceptedStatusCodes);
        } catch (e) {
          throw new Error(`Failed to parse acceptedStatusCodes: ${e.message}`);
        }
      }
    }

    // Make the HTTP request
    const result = await makeWebhookRequest(
      params.method,
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