'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/src/tests/**/*.test.js',
  ],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/migrations/**',
    '!src/seeders/**',
    '!src/config/**',
  ],
  coverageThreshold: {
    global: {
      branches:   20,
      functions:  20,
      lines:      20,
      statements: 20,
    },
  },
  testTimeout: 30000,
  forceExit: true,
  verbose: true,
};
