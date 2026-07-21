import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/vat-returns', label: 'VAT Returns', icon: '🧾' },
  { path: '/banking', label: 'Bank Integration', icon: '🏦' },
  { path: '/companies-house', label: 'Companies House', icon: '🏢' },
  { path: '/settings', label: 'Settings', icon: '⚙️' }
];

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        🇬🇧 TaxEasy
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => isActive ? 'active' : ''}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div style={{ padding: '1.5rem', marginTop: 'auto', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
        TaxEasy v2.0.0
        <br />
        UK Tax Filing for Shopify
      </div>
    </aside>
  );
}

export default Sidebar;