function TaxSummaryCard({ title, amount, deadline, status }) {
  const statusClass = {
    paid: 'badge-success',
    pending: 'badge-warning',
    overdue: 'badge-danger',
    filed: 'badge-success'
  }[status] || 'badge-warning';

  return (
    <div className="stat-card">
      <div className="stat-label">{title}</div>
      <div className="stat-value">
        {amount !== null && amount !== undefined
          ? `£${Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
          : '—'}
      </div>
      {deadline && (
        <div style={{ fontSize: '0.8rem', color: '#637381', marginTop: '0.5rem' }}>
          Due: {new Date(deadline).toLocaleDateString('en-GB')}
        </div>
      )}
      {status && (
        <span className={`badge ${statusClass}`} style={{ marginTop: '0.5rem' }}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      )}
    </div>
  );
}

export default TaxSummaryCard;