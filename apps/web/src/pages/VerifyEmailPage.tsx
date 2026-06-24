import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';

export default function VerifyEmailPage() {
  const { refresh } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'pending' | 'ok' | 'error'>('pending');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setStatus('error');
      setMessage('Missing verification token.');
      return;
    }
    api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
      .then(async () => {
        setStatus('ok');
        await refresh();
        setTimeout(() => navigate('/onboarding'), 1500);
      })
      .catch((e) => {
        setStatus('error');
        setMessage(e instanceof Error ? e.message : 'Verification failed');
      });
  }, [params, refresh, navigate]);

  return (
    <div className="login-page">
      <div className="card login-card">
        <h1 className="page-title">Email verification</h1>
        {status === 'pending' && <p className="muted">Verifying your email…</p>}
        {status === 'ok' && <p className="alert alert-info">Email verified! Redirecting to onboarding…</p>}
        {status === 'error' && (
          <>
            <div className="alert alert-warning">{message}</div>
            <p className="muted">Check your inbox or <Link to="/login">sign in</Link> to resend.</p>
          </>
        )}
      </div>
    </div>
  );
}
