import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, Spinner } from '../../components/ui';
import { PageHeading } from '../../components/admin/AdminUi';

export default function AdminPayments() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-payments-rollup'],
    queryFn: async () => (await api.get('/admin/payments/rollup')).data,
  });

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading title="Payments" subtitle={`Cross-tenant rollup for ${data.forMonth}`} />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="py-2 font-medium">Institute</th>
                <th className="font-medium">Approved</th>
                <th className="font-medium">Pending</th>
                <th className="font-medium">Rejected</th>
                <th className="font-medium">Approved amount</th>
              </tr>
            </thead>
            <tbody>
              {(data.rollup ?? []).map((row: any) => (
                <tr key={row.tenant.id} className="border-t border-slate-100 dark:border-white/5">
                  <td className="py-2.5">
                    <Link to={`/admin/tenants/${row.tenant.id}`} className="font-medium text-brand-600 hover:underline">
                      {row.tenant.name ?? row.tenant.id}
                    </Link>
                  </td>
                  <td>{row.approved}</td>
                  <td>{row.pending}</td>
                  <td>{row.rejected}</td>
                  <td className="font-semibold">Rs. {Math.round(row.approvedAmount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(data.rollup ?? []).length === 0 && <p className="py-4 text-sm text-slate-400">No payments this month.</p>}
        </div>
      </Card>
    </div>
  );
}
