import { User, TokenResponse } from '../types';

export const authApi = {
  login: async (emailOrUsername: string, password: string): Promise<TokenResponse> => {
    const formData = new URLSearchParams();
    formData.append('username', emailOrUsername);
    formData.append('password', password);

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Login failed');
    }
    return response.json();
  },

  register: async (username: string, email: string, password: string): Promise<User> => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, email, password }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Registration failed');
    }
    return response.json();
  },

  testToken: async (token: string): Promise<User> => {
    const response = await fetch('/api/auth/test-token', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Invalid token');
    }
    return response.json();
  },

  updateProfile: async (token: string, username?: string, password?: string): Promise<User> => {
    const response = await fetch('/api/auth/me', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Update failed');
    }
    return response.json();
  },

  deleteAccount: async (token: string): Promise<void> => {
    const response = await fetch('/api/auth/me', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Delete failed');
    }
  }
};
