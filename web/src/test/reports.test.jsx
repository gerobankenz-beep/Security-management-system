import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth/AuthContext';
import { resetMocks } from '../mocks';

beforeEach(() => resetMocks());

async function openAs(email, path) {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), 'Password123!');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  return user;
}

describe('weekly field report', () => {
  it('shows summary cards, tables and Data as of for the manager', async () => {
    await openAs('manager@example.com', '/reports');
    expect(await screen.findByText(/Data as of/)).toBeInTheDocument();
    expect(screen.getByText('Shifts scheduled')).toBeInTheDocument();
    expect(screen.getByText('Missed checkpoints')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
  });
  it('shows a client only proof of service, no payroll and no export', async () => {
    await openAs('grace@example.com', '/reports');
    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    expect(await screen.findByText(/rounds walked/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Payroll' })).not.toBeInTheDocument();
  });
});

describe('monthly payroll', () => {
  it('creates a run, refuses an empty reason, adds an adjustment, reviews and finalises', async () => {
    const user = await openAs('admin@example.com', '/payroll');
    await user.click(await screen.findByRole('button', { name: /^Create run for/ }));
    expect(await screen.findByText('Net pay')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add adjustment' }));
    await user.type(screen.getByLabelText('Amount (UGX)'), '5000');
    await user.click(screen.getByRole('button', { name: 'Save adjustment' }));
    expect(await screen.findByText('A reason is required')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Reason (required)'), 'Uniform');
    await user.click(screen.getByRole('button', { name: 'Save adjustment' }));
    await waitFor(() => expect(screen.getByText('Adjustment saved')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    const fin = await screen.findByRole('button', { name: 'Finalise run' });
    await user.click(fin); await user.click(screen.getByRole('button', { name: /lock this month/ }));
    expect(await screen.findByText('Payroll finalised and locked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recalculate' })).not.toBeInTheDocument();
  });
  it('shows the shift by shift calculation for a guard', async () => {
    const user = await openAs('admin@example.com', '/payroll');
    await user.click(await screen.findByRole('button', { name: /^Create run for/ }));
    await user.click(await screen.findByRole('button', { name: /^View Amina/ }));
    expect(await screen.findByText(/shift by shift/)).toBeInTheDocument();
  });
  it('keeps payroll away from the manager', async () => {
    await openAs('manager@example.com', '/payroll');
    expect(screen.queryByText('Monthly payroll')).not.toBeInTheDocument();
  });
});
