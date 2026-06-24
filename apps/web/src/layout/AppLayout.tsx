import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const ALL_NAV = [
  { to: '/', label: 'Dashboard', roles: ['Admin', 'Marketer', 'Agent'] },
  { to: '/setup', label: 'WhatsApp Setup', roles: ['Admin'] },
  { to: '/contacts', label: 'Contacts', roles: ['Admin', 'Marketer'] },
  { to: '/lists', label: 'Lists', roles: ['Admin', 'Marketer'] },
  { to: '/templates', label: 'Templates', roles: ['Admin', 'Marketer'] },
  { to: '/campaigns', label: 'Campaigns', roles: ['Admin', 'Marketer'] },
  { to: '/automations', label: 'Automations', roles: ['Admin', 'Marketer'] },
  { to: '/knowledge', label: 'Knowledge', roles: ['Admin', 'Marketer'] },
  { to: '/reports', label: 'Reports', roles: ['Admin', 'Marketer'] },
  { to: '/inbox', label: 'Inbox', roles: ['Admin', 'Marketer', 'Agent'] },
  { to: '/integrations', label: 'CRM Import', roles: ['Admin', 'Marketer'] },
  { to: '/developer', label: 'Developer', roles: ['Admin'] },
  { to: '/billing', label: 'Billing', roles: ['Admin'] },
  { to: '/help', label: 'Help', roles: ['Admin', 'Marketer', 'Agent'] },
  { to: '/settings', label: 'Team', roles: ['Admin'] },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const nav = ALL_NAV.filter((item) => user && item.roles.includes(user.role));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">Reach<span>.</span></div>
        <nav>
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="muted">{user?.organizationName}</span>
          <span className="chip chip-default">{user?.role}</span>
          <span>{user?.fullName}</span>
          <button type="button" className="btn btn-ghost" onClick={handleLogout}>
            Log out
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
