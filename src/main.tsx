import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { DataProvider, useData } from '@/store/DataContext';
import { AuthProvider } from '@/store/AuthContext';
import { I18nProvider } from '@/i18n';
import { ConfirmProvider, ToastProvider } from '@/components/feedback';
import App from './App';

/**
 * Composition root:
 * data (localStorage) -> i18n (language + formatting) -> auth -> feedback -> routes
 */
function Root() {
  const { settings, updateSettings } = useData();
  return (
    <I18nProvider
      lang={settings.language}
      currency={settings.currency}
      arabicNumerals={settings.arabicNumerals}
      hijriDates={settings.hijriDates}
      onChangeLang={(language) => updateSettings({ language })}
    >
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <DataProvider>
      <Root />
    </DataProvider>
  </StrictMode>,
);
