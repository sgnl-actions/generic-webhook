# Generic Webhook Action

A flexible SGNL action for making arbitrary HTTP requests to any endpoint with customizable configuration.

## Overview

The Generic Webhook action provides a versatile way to make HTTP requests with configurable methods, headers, body, and accepted status codes. This action serves as a foundation for custom integrations and can be used directly for simple webhook scenarios.

## Prerequisites

- SGNL's CAEP Hub with Node.js 22 runtime
- Network access to target endpoints
- Optional: Authentication credentials for secured endpoints

## Configuration

### Secrets

Configure these secrets in your SGNL integration if authentication is required:

| Secret | Description | Required |
|--------|-------------|----------|
| `AUTH_TOKEN` | Bearer token for API authentication | No |

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BASE_URL` | Default base URL when address parameter is not provided | No |

### Input Parameters

| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| `method` | string | HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS) | Yes |
| `address` | string | Full URL to send the request to (overrides BASE_URL) | No* |
| `addressSuffix` | string | Path suffix to append to the base address | No |
| `requestBody` | string/object | Request body to send (JSON string or object) | No |
| `requestHeaders` | string/object | Custom headers to include (JSON string or object) | No |
| `acceptedStatusCodes` | array | Additional HTTP status codes to treat as success (e.g., [404]) | No |

*Either `address` or `BASE_URL` environment variable must be provided

### Output Structure

```json
{
  "statusCode": 200,
  "body": "{\"result\":\"success\"}",
  "success": true,
  "executedAt": "2024-01-15T10:30:00.000Z"
}
```

## Usage Examples

### Simple GET Request

```json
{
  "method": "GET",
  "address": "https://api.example.com/users/123"
}
```

### POST Request with Body and Headers

```json
{
  "method": "POST",
  "address": "https://api.example.com",
  "addressSuffix": "users",
  "requestBody": "{\"name\":\"John Doe\",\"email\":\"john@example.com\"}",
  "requestHeaders": "{\"X-API-Version\":\"v2\",\"X-Request-ID\":\"abc123\"}"
}
```

### DELETE Request with Custom Status Codes

```json
{
  "method": "DELETE",
  "address": "https://api.example.com/resource/456",
  "acceptedStatusCodes": [404, 410]
}
```

### Using BASE_URL Environment Variable

With `BASE_URL` set to `https://api.example.com/v1`:

```json
{
  "method": "PATCH",
  "addressSuffix": "/users/789",
  "requestBody": "{\"status\":\"active\"}"
}
```

## Error Handling

The action distinguishes between retryable and fatal errors:

### Retryable Errors (Automatic Retry)
- Network connection failures (ECONNREFUSED, ETIMEDOUT)
- DNS resolution failures (ENOTFOUND)
- General network errors

### Fatal Errors (No Retry)
- Missing required parameters
- Invalid JSON in requestHeaders or requestBody
- Invalid acceptedStatusCodes format
- Missing URL configuration

### Response Validation

- **Success**: HTTP 2xx status codes or codes in `acceptedStatusCodes` array
- **Failure**: All other status codes (action still succeeds but `success` field is false)

## Security Considerations

1. **URL Validation**: The action does not validate URLs. Ensure you trust the endpoints being called.

2. **Authentication**: 
   - Bearer token authentication is automatically added if `AUTH_TOKEN` secret is configured
   - Custom auth headers can be provided via `requestHeaders` parameter
   - Custom headers take precedence over automatic authentication

3. **Request Body**: 
   - JSON bodies are automatically detected and Content-Type is set
   - For non-JSON content, set Content-Type explicitly in requestHeaders

4. **Network Access**: Ensure the SGNL's CAEP Hub has network access to target endpoints

## Development

### Running Tests

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Building

```bash
# Build the distribution bundle
npm run build

# Lint the code
npm run lint

# Fix linting issues
npm run lint:fix
```

## Troubleshooting

### Common Issues

1. **"No URL specified" Error**
   - Ensure either `address` parameter or `BASE_URL` environment variable is set
   
2. **"Failed to parse requestHeaders" Error**
   - Verify requestHeaders is valid JSON if provided as string
   
3. **Network Errors**
   - Check network connectivity from SGNL's CAEP Hub
   - Verify firewall rules allow outbound connections
   
4. **Authentication Failures**
   - Confirm AUTH_TOKEN secret is correctly configured
   - Check if custom Authorization header is needed

### Debug Information

The action returns detailed information in the response:
- `statusCode`: Actual HTTP status from the endpoint
- `body`: Full response body for debugging
- `success`: Boolean indicating if request was successful
- `executedAt`: Timestamp of execution

## Version History

- **v1.0.0** - Initial release with full HTTP method support

## Support

