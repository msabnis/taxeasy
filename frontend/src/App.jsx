import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import '@shopify/polaris/build/esm/styles.css';

import Dashboard from './pages/Dashboard';
import VATReturns from './pages/VATReturns';
import CompaniesHouse from './pages/CompaniesHouse';
import BankIntegration from './pages/BankIntegration';
import Settings from './pages/Settings';

function App() {
  return (
    <AppProvider i18n={enTranslations}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/vat" element={<VATReturns />} />
          <Route path="/companies-house" element={<CompaniesHouse />} />
          <Route path="/bank" element={<BankIntegration />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
