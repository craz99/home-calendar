/** @type {import('jest').Config} */
const config = {
  // The test environment that will be used for testing, 'node' for server-side code
  testEnvironment: 'node',

  // A map from regular expressions to module names that allow stubbing out resources
  moduleNameMapper: {
    // Mock CSS imports to prevent syntax errors
    '\\.css$': 'identity-obj-proxy',
  },

  // An array of regexp pattern strings that are matched against all test paths before executing the test
  testPathIgnorePatterns: ['<rootDir>/client/'],

  // An empty object indicates to Jest to not use any transformer (e.g., Babel)
  transform: {},

  // Configure Jest to generate a JUnit XML report
  reporters: [
    'default', // Keep the default console reporter
    ['jest-junit', {
      outputDirectory: 'reports',
      outputName: 'junit.xml',
    }],
  ],
};

export default config;