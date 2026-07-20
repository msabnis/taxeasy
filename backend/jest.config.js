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
      branches:   75,
      functions:  75,
      lines:      75,
      statements: 75,
    },
    './src/utils/vatCalculator.js': { lines: 95 },
    './src/services/vatEngine.js':  { lines: 85 },
  },
  testTimeout: 30000,
  forceExit: true,
};
