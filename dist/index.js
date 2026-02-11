// SGNL Job Script - Auto-generated bundle
'use strict';

/**
 * SGNL Actions - Authentication Utilities
 *
 * Shared authentication utilities for SGNL actions.
 * Supports: Bearer Token, Basic Auth, OAuth2 Client Credentials, OAuth2 Authorization Code
 */

/**
 * User-Agent header value for all SGNL CAEP Hub requests.
 */
const SGNL_USER_AGENT = 'SGNL-CAEP-Hub/2.0';

/**
 * Get OAuth2 access token using client credentials flow
 * @param {Object} config - OAuth2 configuration
 * @param {string} config.tokenUrl - Token endpoint URL
 * @param {string} config.clientId - Client ID
 * @param {string} config.clientSecret - Client secret
 * @param {string} [config.scope] - OAuth2 scope
 * @param {string} [config.audience] - OAuth2 audience
 * @param {string} [config.authStyle] - Auth style: 'InParams' or 'InHeader' (default)
 * @returns {Promise<string>} Access token
 */
async function getClientCredentialsToken(config) {
  const { tokenUrl, clientId, clientSecret, scope, audience, authStyle } = config;

  if (!tokenUrl || !clientId || !clientSecret) {
    throw new Error('OAuth2 Client Credentials flow requires tokenUrl, clientId, and clientSecret');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');

  if (scope) {
    params.append('scope', scope);
  }

  if (audience) {
    params.append('audience', audience);
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
    'User-Agent': SGNL_USER_AGENT
  };

  if (authStyle === 'InParams') {
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
  } else {
    const credentials = btoa(`${clientId}:${clientSecret}`);
    headers['Authorization'] = `Basic ${credentials}`;
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers,
    body: params.toString()
  });

  if (!response.ok) {
    let errorText;
    try {
      const errorData = await response.json();
      errorText = JSON.stringify(errorData);
    } catch {
      errorText = await response.text();
    }
    throw new Error(
      `OAuth2 token request failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('No access_token in OAuth2 response');
  }

  return data.access_token;
}

/**
 * Get the Authorization header value from context using available auth method.
 * Supports: Bearer Token, Basic Auth, OAuth2 Authorization Code, OAuth2 Client Credentials
 *
 * @param {Object} context - Execution context with environment and secrets
 * @param {Object} context.environment - Environment variables
 * @param {Object} context.secrets - Secret values
 * @returns {Promise<string>} Authorization header value (e.g., "Bearer xxx" or "Basic xxx")
 */
async function getAuthorizationHeader(context) {
  const env = context.environment || {};
  const secrets = context.secrets || {};

  // Method 1: Simple Bearer Token
  if (secrets.BEARER_AUTH_TOKEN) {
    const token = secrets.BEARER_AUTH_TOKEN;
    return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  // Method 2: Basic Auth (username + password)
  if (secrets.BASIC_PASSWORD && secrets.BASIC_USERNAME) {
    const credentials = btoa(`${secrets.BASIC_USERNAME}:${secrets.BASIC_PASSWORD}`);
    return `Basic ${credentials}`;
  }

  // Method 3: OAuth2 Authorization Code - use pre-existing access token
  if (secrets.OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN) {
    const token = secrets.OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN;
    return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  // Method 4: OAuth2 Client Credentials - fetch new token
  if (secrets.OAUTH2_CLIENT_CREDENTIALS_CLIENT_SECRET) {
    const tokenUrl = env.OAUTH2_CLIENT_CREDENTIALS_TOKEN_URL;
    const clientId = env.OAUTH2_CLIENT_CREDENTIALS_CLIENT_ID;
    const clientSecret = secrets.OAUTH2_CLIENT_CREDENTIALS_CLIENT_SECRET;

    if (!tokenUrl || !clientId) {
      throw new Error('OAuth2 Client Credentials flow requires TOKEN_URL and CLIENT_ID in env');
    }

    const token = await getClientCredentialsToken({
      tokenUrl,
      clientId,
      clientSecret,
      scope: env.OAUTH2_CLIENT_CREDENTIALS_SCOPE,
      audience: env.OAUTH2_CLIENT_CREDENTIALS_AUDIENCE,
      authStyle: env.OAUTH2_CLIENT_CREDENTIALS_AUTH_STYLE
    });

    return `Bearer ${token}`;
  }

  throw new Error(
    'No authentication configured. Provide one of: ' +
    'BEARER_AUTH_TOKEN, BASIC_USERNAME/BASIC_PASSWORD, ' +
    'OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN, or OAUTH2_CLIENT_CREDENTIALS_*'
  );
}

/**
 * Get the base URL/address for API calls
 * @param {Object} params - Request parameters
 * @param {string} [params.address] - Address from params
 * @param {Object} context - Execution context
 * @returns {string} Base URL
 */
function getBaseURL(params, context) {
  const env = context.environment || {};
  const address = params?.address || env.ADDRESS;

  if (!address) {
    throw new Error('No URL specified. Provide address parameter or ADDRESS environment variable');
  }

  // Remove trailing slash if present
  return address.endsWith('/') ? address.slice(0, -1) : address;
}

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

var script = {
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

    // Validate required parameters
    if (!params.method) {
      throw new Error('method is required');
    }

    // Build the URL using utility function
    // getBaseUrl handles params.address vs context.environment.ADDRESS and removes trailing slashes
    let url;
    try {
      url = getBaseURL(params, context);
    } catch (error) {
      // If addressSuffix is provided but no base URL, give a more specific error
      if (params.addressSuffix) {
        throw new Error('addressSuffix provided but no base address available. Provide either address parameter or ADDRESS environment variable');
      }
      throw error;
    }

    // Append suffix if provided
    if (params.addressSuffix) {
      // getBaseUrl already removed trailing slash from base URL
      // Add leading slash to suffix if it doesn't have one
      const suffix = params.addressSuffix.startsWith('/') ? params.addressSuffix : '/' + params.addressSuffix;
      url = url + suffix;
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

    // Add User-Agent if not already set in custom headers
    if (!headers['User-Agent'] && !headers['user-agent']) {
      headers['User-Agent'] = SGNL_USER_AGENT;
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

    if (!result.success) {
      throw new Error(
        `Request failed with status code: ${result.statusCode}. Response body: ${result.body}.`
      );
    }

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

module.exports = script;
