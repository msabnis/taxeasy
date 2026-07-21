import { useState } from 'react';
import axios from 'axios';

function VATReturns() {
  const [vrn, setVrn] = useState('');
  const [calculation, setCalculation] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const handleCalculate = async () => {
    try {
      setMessage('');
      const resp = await axios.post('/api/tax/vat/calculate', {
        periodStart: '2026-04-01',
        periodEnd: '2026-06-30'
      });
      setCalculation(resp.data);
    } catch (err) {
      setMessage('Failed to calculate VAT: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSubmit = async () => {
    if (!vrn) {
      setMessage('Please enter your VRN');
      return;
    }
    setSubmitting(true);
    try {
      const resp = await axios.post('/api/hmrc/vat/returns', {
        vrn,
        returnData: calculation
      });
      setMessage('VAT return submitted successfully! Receipt: ' + (resp.data.formBundleNumber || 'N/A'));
      setCalculation(null);
    } catch (err) {
      setMessage('Submission failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>VAT Returns</h1>
        <p>Calculate and submit your VAT returns via HMRC MTD</p>
      </div>

      {message && (
        <div className="card" style={{ borderLeft: '4px solid #5c6ac4' }}>
          {message}
        </div>
      )}

      <div className="card">
        <div className="card-title">Calculate VAT for Current Period</div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Period</label>
            <input type="text" value="Q1 2026/27 (Apr - Jun 2026)" readOnly />
          </div>
          <button className="btn btn-primary" onClick={handleCalculate}>
            Calculate VAT
          </button>
        </div>
      </div>

      {calculation && (
        <div className="card">
          <div className="card-title">VAT Return Summary (9-Box)</div>
          <table>
            <tbody>
              <tr><td><strong>Box 1</strong> - VAT due on sales</td><td>£{calculation.box1?.toFixed(2)}</td></tr>
              <tr><td><strong>Box 2</strong> - VAT due on acquisitions</td><td>£{calculation.box2?.toFixed(2)}</td></tr>
              <tr><td><strong>Box 3</strong> - Total VAT due</td><td>£{calculation.box3?.toFixed(2)}</td></tr>
              <tr><td><strong>Box 4</strong> - VAT reclaimed</td><td>£{calculation.box4?.toFixed(2)}</td></tr>
              <tr><td><strong>Box 5</strong> - Net VAT due</td><td><strong>£{calculation.box5?.toFixed(2)}</strong></td></tr>
              <tr><td><strong>Box 6</strong> - Total sales (ex VAT)</td><td>£{calculation.box6?.toFixed(2)}</td></tr>
              <tr><td><strong>Box 7</strong> - Total purchases (ex VAT)</td><td>£{calculation.box7?.toFixed(2)}</td></tr>
            </tbody>
          </table>

          <div style={{ marginTop: '1.5rem' }}>
            <div className="form-group">
              <label>Your VAT Registration Number (VRN)</label>
              <input
                type="text"
                value={vrn}
                onChange={(e) => setVrn(e.target.value)}
                placeholder="e.g. 123456789"
                maxLength={9}
              />
            </div>
            <button
              className="btn btn-success"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit to HMRC'}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Previous Returns</div>
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Net VAT</th>
              <th>Submitted</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Q4 2025/26 (Jan - Mar 2026)</td>
              <td>£1,245.30</td>
              <td>5 Apr 2026</td>
              <td><span className="badge badge-success">Filed</span></td>
            </tr>
            <tr>
              <td>Q3 2025/26 (Oct - Dec 2025)</td>
              <td>£987.60</td>
              <td>3 Jan 2026</td>
              <td><span className="badge badge-success">Filed</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default VATReturns;