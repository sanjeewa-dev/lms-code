import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTenantApi } from '../hooks/useTenantApi';
import { Card, Spinner } from './ui';
import { Icon, type IconName } from './icons';
import type { TenantUser } from '../api/types';

export function UserDirectory({
  title,
  endpoint,
  dataKey,
  icon,
  accent,
}: {
  title: string;
  endpoint: string;
  dataKey: 'students' | 'teachers';
  icon: IconName;
  accent: string;
}) {
  const { slug } = useParams<{ slug: string }>();
  const t = useTenantApi();

  const query = useQuery({
    queryKey: [dataKey, slug],
    queryFn: async () => (await t.get<Record<string, TenantUser[]>>(endpoint)).data[dataKey],
  });

  const users = query.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{users.length} total</p>
        </div>
        <span className={`grid h-11 w-11 place-items-center rounded-xl ${accent}`}>
          <Icon name={icon} />
        </span>
      </div>

      <Card className="p-0">
        {query.isLoading ? (
          <Spinner label="Loading..." />
        ) : users.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">No {dataKey} yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-white/5">
                <tr>
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {users.map((u) => (
                  <tr key={u.id} className="transition hover:bg-slate-50 dark:hover:bg-white/5">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${accent}`}>
                          {u.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{u.email}</td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
