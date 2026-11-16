import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth/AuthContext';
import { request } from '../api/client';

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider><App /></AuthProvider>
    </MemoryRouter>
  );
}

async function loginAs(email, password = 'Password123!') {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('login and navigation', () => {
  it('sends a visitor who is not logged in to the login page', async () => {
    renderApp('/sites');
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows an error for a wrong password', async () => {
    renderApp('/login');
    await loginAs('admin@example.com', 'wrong-password');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password');
  });

  it('admin sees the dashboard and the Users menu', async () => {
    renderApp('/login');
    await loginAs('admin@example.com');
    expect(await screen.findByText('Guards on duty')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav).toHaveTextContent('Users');
    expect(nav).toHaveTextContent('Audit log');
  });

  it('supervisor does not see the Users menu', async () => {
    renderApp('/login');
    await loginAs('supervisor@example.com');
    await screen.findByText('Guards on duty');
    expect(screen.getByRole('navigation', { name: 'Main' })).not.toHaveTextContent('Users');
  });

  it('supervisor who opens /users directly gets a no-access page', async () => {
    renderApp('/users');
    await loginAs('supervisor@example.com');
    expect(await screen.findByText('No access')).toBeInTheDocument();
  });

  it('client lands on Reports and cannot see the Dashboard menu', async () => {
    renderApp('/login');
    await loginAs('grace@example.com');
    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).not.toHaveTextContent('Dashboard');
  });

  it('guard is told to use the mobile app', async () => {
    renderApp('/login');
    await loginAs('amina@example.com');
    expect(await screen.findByText('Please use the mobile app')).toBeInTheDocument();
  });

  it('admin can open the sites list', async () => {
    renderApp('/login');
    await loginAs('admin@example.com');
    await screen.findByText('Guards on duty');
    await userEvent.setup().click(screen.getByRole('link', { name: 'Sites' }));
    expect(await screen.findByText('Kololo Office Park')).toBeInTheDocument();
  });
});

describe('api client (mock mode)', () => {
  it('rejects requests with no token using the standard error shape', async () => {
    await expect(request('/sites')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  it('answers 501 for endpoints that have no mock yet', async () => {
    const { data } = await request('/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'Password123!' } });
    localStorage.setItem('patrol_token', data.token);
    await expect(request('/incidents/1/photos', { method: 'POST' })).rejects.toMatchObject({ status: 501 });
  });
});
