import { useState, useEffect } from 'react';
import axios from 'axios';
import TaxSummaryCard from '../components/TaxSummaryCard';

function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const resp = await axios.get('/api/tax/summary/current');
        setSummary(resp.data);
      } catch (err) {
        console.error('Failed to fetch tax summary:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, []);

  if (loading) {
    return <div className="page-header"><h1>Loading dashboard...</h1></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Tax Dashboard</h1>
        <p>Overview of your UK tax obligations</p>
      </div>

      <div className="stats-grid">
        <TaxSummaryCard
          title="VAT Owed (Current Period)"
          amount={summary?.vatOwed ?? 0}
          deadline={summary?.nextVatDeadline}
          status={summary?.vatStatus || 'pending'}
        />
        <TaxSummaryCard
          title="Income Tax Estimate"
          amount={summary?.incomeTaxEstimate ?? 0}
          deadline={summary?.nextSADeadline}
          status="pending"
        />
        <TaxSummaryCard
          title="Corporation Tax"
          amount={summary?.corporationTaxEstimate ?? 0}
          deadline={summary?.nextCTDeadline}
          status="pending"
        />
        <TaxSummaryCard
          title="Total Revenue (YTD)"
          amount={summary?.totalRevenueYTD ?? 0}
          status={null}
        />
      </div>

      <div className="card">
        <div className="card-title">Upcoming Deadlines</div>
        <table>
          <thead>
            <tr>
              <th>Obligation</th>
              <th>Period</th>
              <th>Deadline</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>VAT Return</td>
              <td>Q1 2026/27</td>
              <td>7 Aug 2026</td>
              <td><span className="badge badge-warning">Pending</span></td>
            </tr>
            <tr>
              <td>Self Assessment</td>
              <td>2025/26</td>
              <td>31 Jan 2027</td>
              <td><span className="badge badge-success">On Track</span></td>
            </tr>
            <tr>
              <td>Confirmation Statement</td>
              <td>Annual</td>
              <td>15 Sep 2026</td>
              <td><span className="badge badge-warning">Pending</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-title">Recent Shopify Orders (Tax Relevant)</div>
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Amount</th>
              <th>VAT Rate</th>
              <th>VAT Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>#1042</td>
              <td>20 Jul 2026</td>
              <td>£249.99</td>
              <td>Standard (20%)</td>
              <td>£41.67</td>
            </tr>
            <tr>
              <td>#1041</td>
              <td>19 Jul 2026</td>
              <td>£15.00</td>
              <td>Zero (0%)</td>
              <td>£0.00</td>
            </tr>
            <tr>
              <td>#1040</td>
              <td>18 Jul 2026</td>
              <td>£89.50</td>
              <td>Reduced (5%)</td>
              <td>£4.26</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Dashboard;