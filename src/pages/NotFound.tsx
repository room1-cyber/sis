import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';

export function NotFound() {
  const { t } = useI18n();
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="text-5xl" aria-hidden>
        🚫
      </span>
      <h1 className="text-xl font-extrabold text-slate-800">{t('notFound.title')}</h1>
      <p className="max-w-md text-sm text-slate-500">{t('notFound.body')}</p>
      <Link to="/" className="btn-primary mt-2">
        {t('notFound.backHome')}
      </Link>
    </div>
  );
}
