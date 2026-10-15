import { useState } from 'react';
import { useAuth } from '@/store/AuthContext';
import { useData } from '@/store/DataContext';
import { useI18n } from '@/i18n';
import { Field } from '@/components/ui';
import { DEMO_CREDENTIALS } from '@/store/seed';
import { ROLE_LABEL_KEY } from '@/store/permissions';

/**
 * Sign-in screen. The demo credentials are listed so the system can be explored
 * immediately after a fresh install.
 */
export function Login() {
  const { t, pick, lang, toggleLang } = useI18n();
  const { login } = useAuth();
  const { settings } = useData();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const result = await login(username, password);
    if (result === 'invalid') setError(t('auth.invalidCredentials'));
    if (result === 'inactive') setError(t('auth.accountInactive'));
    setBusy(false);
  };

  const fillDemo = (demoUsername: string, demoPassword: string) => {
    setUsername(demoUsername);
    setPassword(demoPassword);
    setError('');
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 lg:flex-row">
      <div className="flex flex-1 flex-col justify-center gap-6 px-6 py-10 text-white lg:px-16">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-3xl">🕶️</span>
          <div>
            <p className="text-2xl font-extrabold">{pick(settings.storeNameAr, settings.storeNameEn)}</p>
            <p className="text-sm text-brand-100">{t('app.tagline')}</p>
          </div>
        </div>

        <ul className="grid gap-3 text-sm text-brand-50 sm:grid-cols-2">
          {[
            { icon: '🛒', key: 'nav.pos' as const },
            { icon: '👁️', key: 'nav.prescriptions' as const },
            { icon: '🕶️', key: 'nav.products' as const },
            { icon: '🔬', key: 'nav.labOrders' as const },
            { icon: '📅', key: 'nav.appointments' as const },
            { icon: '📈', key: 'nav.reports' as const },
          ].map((item) => (
            <li key={item.key} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
              <span aria-hidden>{item.icon}</span>
              {t(item.key)}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={toggleLang}
          className="w-fit rounded-xl border border-white/20 px-4 py-2 text-sm font-bold hover:bg-white/10"
        >
          {lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
        </button>
      </div>

      <div className="flex w-full items-center justify-center bg-slate-100 px-4 py-10 lg:w-[480px] lg:rounded-s-[2rem]">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-extrabold text-slate-900">{t('auth.title')}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">{t('auth.subtitle')}</p>

          <form onSubmit={submit} className="space-y-4">
            <Field label={t('auth.username')} required>
              <input
                className="input"
                value={username}
                autoComplete="username"
                autoFocus
                onChange={(event) => setUsername(event.target.value)}
              />
            </Field>
            <Field label={t('auth.password')} required>
              <input
                className="input"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}

            <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>
              {t('auth.signIn')}
            </button>
          </form>

          <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="mb-1 text-sm font-bold text-slate-700">{t('auth.demoAccounts')}</p>
            <p className="mb-3 text-xs text-slate-500">{t('auth.demoHint')}</p>
            <ul className="space-y-1.5">
              {DEMO_CREDENTIALS.map((demo) => (
                <li key={demo.username}>
                  <button
                    type="button"
                    onClick={() => fillDemo(demo.username, demo.password)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-start text-xs transition hover:border-brand-300 hover:bg-brand-50"
                  >
                    <span className="font-bold text-slate-700">{demo.username}</span>
                    <span className="text-slate-400">{t(ROLE_LABEL_KEY[demo.role])}</span>
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                      {demo.password}
                    </code>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} {t('app.name')} — {t('auth.copyright')}
          </p>
        </div>
      </div>
    </div>
  );
}
