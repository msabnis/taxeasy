const logger = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

class ShopifyError extends AppError {
  constructor(message) {
    super(message, 502, 'SHOPIFY_ERROR');
  }
}

class HmrcError extends AppError {
  constructor(message, statusCode = 502) {
    super(message, statusCode, 'HMRC_ERROR');
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

const errorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  logger.error(`[${code}] ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(statusCode).json({
    error: code,
    message: err.isOperational ? err.message : 'An unexpected error occurred',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = { errorHandler, AppError, ShopifyError, HmrcError, ValidationError };
