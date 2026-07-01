import { Link, useLocation } from 'react-router';

const TABS = [
  { label: 'Home',         to: '/' },
  { label: 'All Skills',   to: '/browse' },
  { label: 'My Favorites', to: '/favorites' },
] as const;

export function MarketplaceTabBar() {
  const { pathname } = useLocation();

  return (
    <nav className="border-b border-slate-200 bg-white" aria-label="Marketplace tabs">
      <div className="flex">
        {TABS.map(tab => {
          const isActive =
            tab.to === '/' ? pathname === '/' : pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={isActive ? 'page' : undefined}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
