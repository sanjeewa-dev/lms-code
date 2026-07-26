import { useAuth } from '../context/AuthContext';
import { AdminPayments } from '../components/payments/AdminPayments';
import { StudentPayments } from '../components/payments/StudentPayments';

export default function Payments() {
  const { user } = useAuth();
  const isReviewer = user?.role === 'admin' || user?.role === 'teacher';
  return isReviewer ? <AdminPayments /> : <StudentPayments />;
}
