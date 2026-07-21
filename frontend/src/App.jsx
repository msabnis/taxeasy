import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import VATReturns from './pages/VATReturns';
import BankIntegration from './pages/BankIntegration';
import CompaniesHouse from './pages/CompaniesHouse';
import Settings from './pages/Settings';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/vat-returns" element={<VATReturns />} />
        <Route path="/banking" element={<BankIntegration />} />
        <Route path="/companies-house" element={<CompaniesHouse />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}

export default App;