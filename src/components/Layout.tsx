import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/store/AuthContext';
import { useData } from '@/store/DataContext';
import { useI18n, type TranslationKey } from '@/i18n';
import { useConfirm, useToast } from '@/components/feedback';
import { ROLE_LABEL_KEY, type Permission } from '@/store/permissions';
import { Modal } from '@/components/ui';
import type { Role } from '@/types';
import { isSameDay } from '@/lib/date';

/* ---------------------------------------------------------------------------
 * Application shell: sidebar navigation, top bar, quick search and the
 * language / session controls.
 * ------------------------------------------------------------------------- */

interface NavItem {
  to: string;
  labelKey: TranslationKey;
  icon: string;
  permission: Permission;
  badge?: number;
}

interface NavGroup {
  titleKey: TranslationKey;
  items: NavItem[];
}

export function useNavigation(): NavGroup[] {
  const { labOrders, appointments } = useData();

  return useMemo(() => {
    const todayCount = appointments.filter(
      (item) => isSameDay(item.date, new Date()) && item.status !== 'cancelled',
    ).length;
    const openLabOrders = labOrders.filter(
      (item) => item.status !== 'delivered' && item.status !== 'cancelled',
    ).length;

    return [
      {
        titleKey: 'nav.dashboard',
        items: [{ to: '/', labelKey: 'nav.dashboard', icon: '📊', permission: 'dashboard.view' }],
      },
      {
        titleKey: 'nav.sales',
        items: [
          { to: '/pos', labelKey: 'nav.pos', icon: '🛒', permission: 'pos.use' },
          { to: '/invoices', labelKey: 'nav.invoices', icon: '🧾', permission: 'invoices.view' },
          { to: '/returns', labelKey: 'nav.returns', icon: '↩️', permission: 'invoices.view' },
        ],
      },
      {
        titleKey: 'nav.clinic',
        items: [
          { to: '/customers', labelKey: 'nav.customers', icon: '👥', permission: 'customers.view' },
          { to: '/prescriptions', labelKey: 'nav.prescriptions', icon: '👁️', permission: 'prescriptions.view' },
          {
            to: '/appointments',
            labelKey: 'nav.appointments',
            icon: '📅',
            permission: 'appointments.view',
            badge: todayCount || undefined,
          },
          {
            to: '/lab-orders',
            labelKey: 'nav.labOrders',
            icon: '🔬',
            permission: 'labOrders.view',
            badge: openLabOrders || undefined,
          },
        ],
      },
      {
        titleKey: 'nav.inventory',
        items: [
          { to: '/products', labelKey: 'nav.products', icon: '🕶️', permission: 'products.view' },
          { to: '/stock-movements', labelKey: 'nav.stockMovements', icon: '📦', permission: 'products.view' },
          { to: '/suppliers', labelKey: 'nav.suppliers', icon: '🚚', permission: 'suppliers.view' },
          { to: '/purchases', labelKey: 'nav.purchases', icon: '🛍️', permission: 'purchases.view' },
        ],
      },
      {
        titleKey: 'nav.admin',
        items: [
          { to: '/reports', labelKey: 'nav.reports', icon: '📈', permission: 'reports.view' },
          { to: '/users', labelKey: 'nav.users', icon: '👤', permission: 'users.manage' },
          { to: '/settings', labelKey: 'nav.settings', icon: '⚙️', permission: 'settings.manage' },
        ],
      },
    ];
  }, [labOrders, appointments]);
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { t, pick } = useI18n();
  const { user, hasPermission } = useAuth();
  const { settings } = useData();
  const groups = useNavigation();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-2xl">
          🕶️
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-white">
            {pick(settings.storeNameAr, settings.storeNameEn)}
          </p>
          <p className="truncate text-[11px] text-brand-200">{t('app.tagline')}</p>
        </div>
      </div>

      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group) => {
          const items = group.items.filter((item) => hasPermission(item.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.titleKey}>
              <p className="nav-group">{t(group.titleKey)}</p>
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                >
                  <span aria-hidden className="text-lg">
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate">{t(item.labelKey)}</span>
                  {item.badge ? (
                    <span className="rounded-full bg-accent-400 px-2 py-0.5 text-[11px] font-bold text-brand-900">
                      {item.badge}
                    </span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      {user && (
        <div className="border-t border-white/10 px-4 py-3">
          <p className="truncate text-sm font-bold text-white">{user.fullName}</p>
          <p className="text-[11px] text-brand-200">{t(ROLE_LABEL_KEY[user.role as Role])}</p>
        </div>
      )}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { t, lang, toggleLang } = useI18n();
  const { user, logout } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const handleLogout = async () => {
    const confirmed = await confirm({
      title: t('auth.logoutConfirm'),
      message: user?.fullName ?? '',
      confirmLabel: t('nav.logout'),
      tone: 'primary',
    });
    if (!confirmed) return;
    logout();
    toast.info(t('auth.loggedOut'));
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="no-print fixed inset-y-0 start-0 hidden w-64 bg-brand-900 lg:block">
        <SidebarContent />
      </aside>

      {drawerOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 bg-brand-900 shadow-pop animate-slide-in">
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:ps-64">
        <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-3 py-3 backdrop-blur sm:px-5">
          <button
            type="button"
            className="btn-icon lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label={t('nav.toggleSidebar')}
          >
            ☰
          </button>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-start text-sm text-slate-400 transition hover:border-brand-300 hover:bg-white sm:max-w-md"
          >
            <span aria-hidden>🔍</span>
            <span className="flex-1 truncate">{t('search.hint')}</span>
            <kbd className="hidden rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 sm:block">
              Ctrl K
            </kbd>
          </button>

          <div className="flex items-center gap-1.5">
            <button type="button" onClick={toggleLang} className="btn-secondary btn-sm" title={t('nav.language')}>
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
            {user && (
              <div className="hidden items-center gap-2 rounded-xl border border-slate-200 px-2.5 py-1.5 sm:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">
                  {user.fullName.slice(0, 1)}
                </span>
                <span className="max-w-[9rem] truncate text-xs font-bold text-slate-700">{user.fullName}</span>
              </div>
            )}
            <button type="button" onClick={handleLogout} className="btn-ghost btn-sm" title={t('nav.logout')}>
              🚪
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-3 py-5 sm:px-5 sm:py-6">{children}</main>

        <footer className="no-print mx-auto max-w-[1500px] px-5 pb-6 text-center text-xs text-slate-400">
          {t('app.name')} · {t('app.version')} 1.0.0
        </footer>
      </div>

      <QuickSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

interface QuickSearchProps {
  open: boolean;
  onClose: () => void;
}

/** Ctrl + K palette that searches customers, products and invoices at once. */
export function QuickSearch({ open, onClose }: QuickSearchProps) {
  const { t, pick, money } = useI18n();
  const { customers, products, invoices } = useData();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const term = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (term.length < 1) return { customers: [], products: [], invoices: [] };
    const like = (value?: string) => (value ?? '').toLowerCase().includes(term);
    return {
      customers: customers
        .filter((item) => like(item.name) || like(item.nameEn) || like(item.phone) || like(item.code))
        .slice(0, 5),
      products: products
        .filter((item) => like(item.nameAr) || like(item.nameEn) || like(item.sku) || like(item.barcode))
        .slice(0, 5),
      invoices: invoices
        .filter((item) => like(item.number) || like(item.customerName) || like(item.customerPhone))
        .slice(0, 5),
    };
  }, [term, customers, products, invoices]);

  const go = (path: string) => {
    navigate(path);
    onClose();
  };

  const totalMatches = matches.customers.length + matches.products.length + matches.invoices.length;

  return (
    <Modal open={open} onClose={onClose} title={t('search.title')} subtitle={t('search.shortcut')} size="md">
      <input
        autoFocus
        className="input mb-4"
        value={query}
        placeholder={t('search.hint')}
        onChange={(event) => setQuery(event.target.value)}
      />

      {term.length > 0 && totalMatches === 0 && (
        <p className="py-6 text-center text-sm text-slate-400">{t('search.noMatches')}</p>
      )}

      <div className="space-y-4">
        {matches.customers.length > 0 && (
          <section>
            <p className="section-title">{t('search.customers')}</p>
            <ul className="space-y-1">
              {matches.customers.map((customer) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    onClick={() => go(`/customers/${customer.id}`)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-start hover:bg-brand-50"
                  >
                    <span className="font-semibold text-slate-700">{customer.name}</span>
                    <span className="text-xs text-slate-400">
                      {customer.code} · {customer.phone}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {matches.products.length > 0 && (
          <section>
            <p className="section-title">{t('search.products')}</p>
            <ul className="space-y-1">
              {matches.products.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => go('/products')}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-start hover:bg-brand-50"
                  >
                    <span className="font-semibold text-slate-700">{pick(product.nameAr, product.nameEn)}</span>
                    <span className="text-xs text-slate-400">
                      {product.sku} · {money(product.price)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {matches.invoices.length > 0 && (
          <section>
            <p className="section-title">{t('search.invoices')}</p>
            <ul className="space-y-1">
              {matches.invoices.map((invoice) => (
                <li key={invoice.id}>
                  <button
                    type="button"
                    onClick={() => go(`/invoices/${invoice.id}`)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-start hover:bg-brand-50"
                  >
                    <span className="font-semibold text-slate-700">
                      {invoice.number} — {invoice.customerName}
                    </span>
                    <span className="text-xs text-slate-400">{money(invoice.total)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}


