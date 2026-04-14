import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../lib/components/Button';
import { Input } from '../lib/components/Input';
import { Label } from '../lib/components/Label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../lib/components/Card';
import { Alert, AlertDescription } from '../lib/components/Alert';
import { useToast } from '../contexts/ToastContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, currentUser, userRole, loading: authLoading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && currentUser && userRole) {
      if (userRole === 'driver') {
        navigate('/driver-dashboard', { replace: true });
      } else {
        navigate('/home', { replace: true });
      }
    }
  }, [authLoading, currentUser, userRole, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      toast({
        title: 'Welcome back',
        description: 'Login successful.',
        variant: 'success',
      });
    } catch (err) {
      setError(err.message || 'Failed to login');
      toast({
        title: 'Login failed',
        description: err.message || 'Failed to login',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
              BB
            </div>
          </div>
          <CardTitle className="text-3xl font-bold">BlackBox Insurance</CardTitle>
          <CardDescription className="text-base">Track your journey, stay protected</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button 
              type="submit" 
              disabled={loading} 
              className="w-full h-11 text-base font-semibold"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">or</span>
            </div>
          </div>

          <p className="text-center text-sm">
            Don't have an account?{' '}
            <Link to="/signup" className="font-semibold text-blue-600 hover:text-blue-700 underline-offset-2 hover:underline">
              Create account
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
