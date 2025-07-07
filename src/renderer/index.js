const React = require('react');
const { createRoot } = require('react-dom/client');
const App = require('./App');

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(React.createElement(App));
