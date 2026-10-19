import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './styles.css';
import './table/table-layout.css';
import { AppearanceProvider } from './rally/appearance';
import './rally/rally-pages.css';
import './rally/rally-shell.css';
import './table/rally-table.css';
import './rally/rally-dialogs.css';
import './rally/rally-coach.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppearanceProvider><App /></AppearanceProvider>
  </React.StrictMode>,
);
