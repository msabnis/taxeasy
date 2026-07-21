import { useState } from 'react';
import axios from 'axios';

function CompaniesHouse() {
  const [companyNumber, setCompanyNumber] = useState('');
  const [profile, setProfile] = useState(null);
  const [filingHistory, setFilingHistory] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLookup = async () => {
    if (!companyNumber) {
      setMessage('Please enter a company number');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const [profileResp, historyResp] = await Promise.all([
        axios.get(`/api/companies-house/company/${companyNumber}`),
        axios.get(`/api/companies-house/filing-history/${companyNumber}`)
      ]);
      setProfile(profileResp.data);
      setFilingHistory(historyResp.data);
    } catch (err) {
      setMessage('Lookup failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleFileCS = async () => {
    try {
      setMessage('Filing confirmation statement...');
      const resp = await axios.post('/api/companies-house/confirmation-statement', {
        companyNumber
      });
      setMessage(`Confirmation statement filed! Reference: ${resp.data.reference}`);
    } catch (err) {
      setMessage('Filing failed: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Companies House</h1>
        <p>Manage your company filings and compliance</p>
      </div>

      {message && (
        <div className="card" style={{ borderLeft: '4px solid #5c6ac4' }}>
          {message}
        </div>
      )}

      <div className="card">
        <div className="card-title">Company Lookup</div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Company Number</label>
            <input
              type="text"
              value={companyNumber}
              onChange={(e) => setCompanyNumber(e.target.value)}
              placeholder="e.g. 12345678"
            />
          </div>
          <button className="btn btn-primary" onClick={handleLookup} disabled={loading}>
            {loading ? 'Searching...' : 'Lookup'}
          </button>
        </div>
      </div>

      {profile && (
        <div className="card">
          <div className="card-title">Company Profile</div>
          <table>
            <tbody>
              <tr><td><strong>Name</strong></td><td>{profile.name}</td></tr>
              <tr><td><strong>Number</strong></td><td>{profile.companyNumber}</td></tr>
              <tr><td><strong>Status</strong></td><td><span className="badge badge-success">{profile.status}</span></td></tr>
              <tr><td><strong>Type</strong></td><td>{profile.type}</td></tr>
              <tr><td><strong>Incorporated</strong></td><td>{profile.incorporatedOn}</td></tr>
              <tr><td><strong>SIC Codes</strong></td><td>{(profile.sicCodes || []).join(', ')}</td></tr>
              <tr><td><strong>Accounts Next Due</strong></td><td>{profile.accounts?.nextDue || 'N/A'}</td></tr>
              <tr><td><strong>CS Next Due</strong></td><td>{profile.confirmationStatement?.nextDue || 'N/A'}</td></tr>
            </tbody>
          </table>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
            <button className="btn btn-success" onClick={handleFileCS}>
              File Confirmation Statement
            </button>
            <button className="btn btn-primary">
              File Annual Accounts
            </button>
          </div>
        </div>
      )}

      {filingHistory.length > 0 && (
        <div className="card">
          <div className="card-title">Filing History</div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {filingHistory.map((item, idx) => (
                <tr key={idx}>
                  <td>{item.date}</td>
                  <td>{item.type}</td>
                  <td>{item.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default CompaniesHouse;