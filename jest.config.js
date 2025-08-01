module.exports = {
  // Support both JS and JSX files
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.js',
    '<rootDir>/src/**/__tests__/**/*.jsx',
    '<rootDir>/src/**/*.test.js',
    '<rootDir>/src/**/*.test.jsx'
  ],
  
  // Default environment for Node.js tests
  testEnvironment: 'node',
  
  // Override environment for specific files
  projects: [
    {
      displayName: 'main-process',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/src/main/**/*.test.js',
        '<rootDir>/src/main/**/__tests__/**/*.js',
        '<rootDir>/src/shared/**/*.test.js',
        '<rootDir>/src/shared/**/__tests__/**/*.js'
      ]
    },
    {
      displayName: 'renderer-process', 
      testEnvironment: 'jsdom',
      testMatch: [
        '<rootDir>/src/renderer/**/*.test.jsx',
        '<rootDir>/src/renderer/**/__tests__/**/*.jsx'
      ],
      moduleNameMapper: {
        '\\.(css|less|scss)$': 'identity-obj-proxy'
      }
    }
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/**/*.test.{js,jsx}',
    '!src/**/__tests__/**',
    '!src/renderer/index.jsx' // Entry point
  ],
  
  // Test timeout
  testTimeout: 10000,
  
  // Verbose output
  verbose: true
}; 