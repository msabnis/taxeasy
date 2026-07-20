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
      branches:   30,
      functions:  30,
      lines:      30,
      statements: 30,
    },
  },
  testTimeout: 30000,
  forceExit: true,
  verbose: true,
};
