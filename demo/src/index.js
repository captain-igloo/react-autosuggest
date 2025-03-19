import React from 'react';
import { createRoot } from 'react-dom/client';
import App from 'App/App';

const container = document.getElementById('demo');

if (container) {
  createRoot(container).render(<App />);
}
