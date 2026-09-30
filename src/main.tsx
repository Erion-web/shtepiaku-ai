import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/outfit/latin-ext-300.css';
import '@fontsource/outfit/latin-ext-400.css';
import '@fontsource/outfit/latin-ext-500.css';
import '@fontsource/outfit/latin-ext-600.css';
import '@fontsource/outfit/latin-300.css';
import '@fontsource/outfit/latin-400.css';
import '@fontsource/outfit/latin-500.css';
import '@fontsource/outfit/latin-600.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
