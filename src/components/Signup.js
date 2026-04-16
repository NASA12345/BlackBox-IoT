import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../lib/components/Button';
import { Input } from '../lib/components/Input';
import { Label } from '../lib/components/Label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../lib/components/Card';
import { Alert, AlertDescription } from '../lib/components/Alert';
import { useToast } from '../contexts/ToastContext';

const Signup = () => {
  const [roleType, setRoleType] = useState('user'); // 'user' or 'driver'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { signUpAsUser, signUpAsDriver } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      toast({
        title: 'Signup failed',
        description: 'Passwords do not match',
        variant: 'destructive',
      });
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      toast({
        title: 'Signup failed',
        description: 'Password must be at least 6 characters',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      if (roleType === 'user') {
        await signUpAsUser(email, password, fullName, phone);
        toast({
          title: 'Account created',
          description: 'User account created successfully.',
          variant: 'success',
        });
        navigate('/home');
      } else {
        await signUpAsDriver(email, password, fullName, phone, licenseNumber, vehicleNumber);
        toast({
          title: 'Account created',
          description: 'Driver account created successfully.',
          variant: 'success',
        });
        navigate('/driver-dashboard');
      }
    } catch (err) {
      setError(err.message || 'Failed to signup');
      toast({
        title: 'Signup failed',
        description: err.message || 'Failed to signup',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
              BB
            </div>
          </div>
          <CardTitle className="text-3xl font-bold">Create Your Account</CardTitle>
          <CardDescription className="text-base">Join BlackBox to start tracking your journeys</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2 justify-center">
            <Button
              type="button"
              variant={roleType === 'user' ? 'default' : 'outline'}
              size="lg"
              onClick={() => setRoleType('user')}
              className="flex-1"
            >
              👤 User
            </Button>
            <Button
              type="button"
              variant={roleType === 'driver' ? 'default' : 'outline'}
              size="lg"
              onClick={() => setRoleType('driver')}
              className="flex-1"
            >
              🚗 Driver
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name *</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>

            {roleType === 'driver' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="space-y-2">
                  <Label htmlFor="licenseNumber">License Number *</Label>
                  <Input
                    id="licenseNumber"
                    type="text"
                    placeholder="DL123456789"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vehicleNumber">Vehicle Number *</Label>
                  <Input
                    id="vehicleNumber"
                    type="text"
                    placeholder="ABC-1234"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <Button 
              type="submit" 
              disabled={loading} 
              className="w-full h-11 text-base font-semibold"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </Button>
          </form>

          <p className="text-center text-sm">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700 underline-offset-2 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Signup;
