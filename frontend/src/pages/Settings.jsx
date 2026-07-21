import { useState } from 'react';
import axios from 'axios';

function Settings() {
  const [plan, setPlan] = useState('sole-trader');
  const [message, setMessage] = useState('');

  const plans = [
    {
      id: 'sole-trader',
      name: 'Sole Trader',
      price: 9,
      features: ['VAT calculation & filing', 'Self Assessment estimates', 'Shopify order sync', 'Email support']
    },
    {
      id: 'small-business',
      name: 'Small Business',
      price: 19,
      features: ['Everything in Sole Trader', 'Open Banking integration', 'Bank reconciliation', 'Corporation Tax estimates', 'Priority support']
    },
    {
      id: 'growth',
      name: 'Growth',
      price: 35,
      features: ['Everything in Small Business', 'Companies House filing', 'Multi-entity support', 'Accountant export (CSV/Xero)', 'Dedicated account manager']
    }
  ];

  const handlePlanChange = async (planId) => {
    setPlan(planId);
    try {
      await axios.post('/api/settings/plan', { plan: planId });
      setMessage(`Plan updated to ${plans.find(p => p.id === planId)?.name}`);
    } catch (err) {
      setMessage('Failed to update plan: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage your account, plan, and integrations</p>
      </div>

      {message && (
        <div className="card" style={{ borderLeft: '4px solid #5c6ac4' }}>
          {message}
        </div>
      )}

      <div className="card">
        <div className="card-title">Shopify Connection</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span className="badge badge-success">Connected</span>
          <span>mystore.myshopify.com</span>
          <button className="btn btn-danger" style={{ marginLeft: 'auto' }}>
            Disconnect
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">HMRC MTD Connection</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span className="badge badge-warning">Not Connected</span>
          <a href="/api/hmrc/auth" className="btn btn-primary">
            Connect HMRC
          </a>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Subscription Plan</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {plans.map((p) => (
            <div
              key={p.id}
              className="card"
              style={{
                border: plan === p.id ? '2px solid #5c6ac4' : '1px solid #dfe3e8',
                cursor: 'pointer',
                textAlign: 'center'
              }}
              onClick={() => handlePlanChange(p.id)}
            >
              <h3>{p.name}</h3>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#5c6ac4', margin: '0.5rem 0' }}>
                £{p.price}<span style={{ fontSize: '0.875rem', color: '#637381' }}>/mo</span>
              </div>
              <ul style={{ listStyle: 'none', textAlign: 'left', fontSize: '0.85rem' }}>
                {p.features.map((f, i) => (
                  <li key={i} style={{ padding: '0.25rem 0' }}>✓ {f}</li>
                ))}
              </ul>
              {plan === p.id && (
                <span className="badge badge-success" style={{ marginTop: '0.5rem' }}>Current Plan</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Settings;