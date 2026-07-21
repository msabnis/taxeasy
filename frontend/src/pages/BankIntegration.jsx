import { useState, useEffect } from 'react';
import axios from 'axios';

function BankIntegration() {
  const [institutions, setInstitutions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedBank, setSelectedBank] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchInstitutions();
    fetchAccounts();
  }, []);

  const fetchInstitutions = async () => {
    try {
      const resp = await axios.get('/api/banking/institutions');
      setInstitutions(resp.data);
    } catch (err) {
      console.error('Failed to fetch banks:', err);
    }
  };

  const fetchAccounts = async () => {
    try {
      const resp = await axios.get('/api/banking/accounts/current');
      setAccounts(resp.data);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    }
  };

  const handleConnect = async () => {
    if (!selectedBank) {
      setMessage('Please select a bank');
      return;
    }
    setConnecting(true);
    try {
      const resp = await axios.post('/api/banking/connect', {
        institutionId: selectedBank
      });
      window.location.href = resp.data.link;
    } catch (err) {
      setMessage('Connection failed: ' + (err.response?.data?.error || err.message));
      setConnecting(false);
    }
  };

  const handleReconcile = async (accountId) => {
    try {
      setMessage('Reconciling transactions...');
      const resp = await axios.post('/api/banking/reconcile', {
        accountId,
        periodStart: '2026-04-01',
        periodEnd: '2026-06-30'
      });
      setMessage(`Reconciliation complete: ${resp.data.matched} matched, ${resp.data.unmatched} unmatched`);
    } catch (err) {
      setMessage('Reconciliation failed: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Bank Integration</h1>
        <p>Connect your business bank account via Open Banking (GoCardless PSD2)</p>
      </div>

      {message && (
        <div className="card" style={{ borderLeft: '4px solid #5c6ac4' }}>
          {message}
        </div>
      )}

      <div className="card">
        <div className="card-title">Connect a Bank Account</div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Select Your Bank</label>
            <select value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)}>
              <option value="">-- Choose a bank --</option>
              {institutions.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
              <option value="barclays">Barclays</option>
              <option value="hsbc">HSBC</option>
              <option value="lloyds">Lloyds Bank</option>
              <option value="natwest">NatWest</option>
              <option value="santander">Santander</option>
              <option value="starling">Starling Bank</option>
              <option value="monzo">Monzo</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
            {connecting ? 'Connecting...' : 'Connect Bank'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Connected Accounts</div>
        {accounts.length === 0 ? (
          <p style={{ color: '#637381' }}>No bank accounts connected yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>IBAN</th>
                <th>Currency</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id}>
                  <td>{acc.name}</td>
                  <td>{acc.iban}</td>
                  <td>{acc.currency}</td>
                  <td><span className="badge badge-success">{acc.status}</span></td>
                  <td>
                    <button className="btn btn-primary" onClick={() => handleReconcile(acc.id)}>
                      Reconcile
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default BankIntegration;