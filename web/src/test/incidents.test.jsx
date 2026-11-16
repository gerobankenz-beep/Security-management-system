import { render, screen, within } from '@testing-library/react';
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

describe('incidents', () => {
  it('lists incidents with status counts and filters by status', async () => {
    const user = await openAs('manager@example.com', '/incidents');
    expect(await screen.findByRole('heading', { name: 'Incidents' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Review incident 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review incident 3' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Status'), 'resolved');
    expect(await screen.findByRole('button', { name: 'Review incident 3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review incident 1' })).not.toBeInTheDocument();
  });

  it('needs a note to resolve, then saves and updates the list', async () => {
    const user = await openAs('manager@example.com', '/incidents');
    await user.click(await screen.findByRole('button', { name: 'Review incident 1' }));
    const panel = await screen.findByLabelText('Incident details');
    expect(await within(panel).findByText(/photographing the main gate/)).toBeInTheDocument();
    await user.selectOptions(within(panel).getByLabelText('Status'), 'resolved');
    await user.click(within(panel).getByRole('button', { name: 'Save changes' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(/resolution_note|note|required/i);
    await user.type(within(panel).getByLabelText('Resolution note'), 'Checked with the supervisor. No threat.');
    await user.click(within(panel).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Incident 1 updated');
    await user.selectOptions(screen.getByLabelText('Status'), 'resolved');
    expect(await screen.findByRole('button', { name: 'Review incident 1' })).toBeInTheDocument();
  });

  it('shows a supervisor only the incidents at their own site', async () => {
    await openAs('supervisor@example.com', '/incidents');
    expect(await screen.findByRole('button', { name: 'Review incident 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review incident 3' })).not.toBeInTheDocument();
  });
});
