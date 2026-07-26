import { Link, useParams } from 'react-router-dom';
import { Card } from '../components/ui';
import { Icon, type IconName } from '../components/icons';

export default function ComingSoon({
  title,
  description,
  icon = 'building',
}: {
  title: string;
  description?: string;
  icon?: IconName;
}) {
  const { slug } = useParams<{ slug: string }>();
  return (
    <Card className="mx-auto max-w-xl text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        <Icon name={icon} width={26} height={26} />
      </div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
        {description ?? `${title} is coming soon. This section is planned for a future release.`}
      </p>
      <Link
        to={`/${slug}/dashboard`}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
      >
        Back to dashboard
      </Link>
    </Card>
  );
}
