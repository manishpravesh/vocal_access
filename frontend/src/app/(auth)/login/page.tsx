'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import nhost from '@/lib/nhost';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const { session, error } = await nhost.auth.signIn({ email, password });
        if (error) throw error;
        if (session) router.push('/select-org');
      } else {
        const { session, error } = await nhost.auth.signUp({ email, password });
        if (error) throw error;
        if (session) router.push('/select-org');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: 'linear-gradient(135deg, var(--bg-primary) 0%, #1e1b4b 100%)' }}>
      <div className="glass-card w-full max-w-md animate-fade-in">
        <h1 className="text-center">{isLogin ? 'Welcome Back' : 'Create Account'}</h1>
        <p className="text-center mb-6">AI Agent Workflow Builder</p>

        {error && (
          <div className="badge badge-danger mb-4 w-full justify-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Email</label>
            <input 
              type="email" 
              className="input-field" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
            />
          </div>
          <div className="input-group">
            <label className="input-label">Password</label>
            <input 
              type="password" 
              className="input-field" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />
          </div>
          <button type="submit" className="btn btn-primary w-full mt-4" disabled={loading}>
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            type="button" 
            className="text-sm text-blue-400 hover:text-blue-300"
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
