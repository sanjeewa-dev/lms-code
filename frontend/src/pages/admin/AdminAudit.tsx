import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, Input, Spinner } from '../../components/ui';
import { PageHeading } from '../../components/admin/AdminUi';

export default function AdminAudit() {
  const [action, setAction] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit', action],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (action) params.set('action', action);
      return (await api.get(`/admin/audit?${params}`)).data.logs as any[];
    },
  });

  return (
    <div className="space-y-6">
      <PageHeading title="Audit Log" subtitle="Platform admin actions and support sessions" />
      <Card>
        <div className="mb-4 max-w-sm">
          <Input
            label="Filter action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="e.g. support_session"
          />
        </div>
        {isLoading ? (
          <Spinner />
        ) : (
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="py-2 font-medium">When</th>
                  <th className="font-medium">Actor</th>
                  <th className="font-medium">Action</th>
                  <th className="font-medium">Tenant</th>
                  <th className="font-medium">Target</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((log) => (
                  <tr key={log.id} className="border-t border-slate-100 dark:border-white/5">
                    <td className="whitespace-nowrap py-2.5 text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                    <td>{log.actorEmail}</td>
                    <td className="font-medium text-slate-800 dark:text-slate-100">{log.action}</td>
                    <td>
                      {log.tenant ? (
                        <Link to={`/admin/tenants/${log.tenant.id}`} className="font-medium text-brand-600 hover:underline">
                          {log.tenant.slug}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-slate-400">
                      {log.targetType ?? ''} {log.targetId ? `#${String(log.targetId).slice(0, 8)}` : ''}
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
