import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth/AuthContext';
import { resetMocks } from '../mocks';
import { request } from '../api/client';
import * as sitesApi from '../api/sites';
import * as rostersApi from '../api/rosters';
import * as guardsApi from '../api/guards';
import { mondayOfToday } from './testUtil';

beforeEach(() => resetMocks());

async function openAs(email, path) {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), 'Password123!');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  return user;
}

describe('roster builder', () => {
  it('shows the week grid, adds a guard, and removes them with the chip button', async () => {
    const user = await openAs('manager@example.com', '/rosters/1');
    expect(await screen.findByRole('heading', { name: /Kololo Office Park: week of/ })).toBeInTheDocument();
    // two guards were pre-booked on the first Day shift; remove one using the Remove button, not by text
    const remove = await screen.findByRole('button', { name: /^Remove John M\. from Day on / });
    await user.click(remove);
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Remove John M\. from Day on / })).not.toBeInTheDocument());
    // add Ruth to the first Night cell
    const add = screen.getAllByLabelText(/^Add guard to Night on /)[0];
    await user.selectOptions(add, 'Ruth N.');
    expect(await screen.findByRole('button', { name: /^Remove Ruth N\. from Night on / })).toBeInTheDocument();
  });

  it('keeps Publish disabled and lists the broken rules while the roster is incomplete', async () => {
    await openAs('manager@example.com', '/rosters/1');
    const panel = await screen.findByLabelText('Live checks');
    expect(await within(panel).findByText(/rules? broken/)).toBeInTheDocument();
    expect(within(panel).getAllByText('Min guards per shift').length).toBeGreaterThan(0);
    expect(within(panel).getByRole('button', { name: 'Publish roster' })).toBeDisabled();
  });

  it('flags too little rest between a night shift and the next day shift', async () => {
    const user = await openAs('manager@example.com', '/rosters/1');
    const panel = await screen.findByLabelText('Live checks');
    await user.selectOptions((await screen.findAllByLabelText(/^Add guard to Night on /))[0], 'Amina K.'); // Amina already works that Day
    expect(await within(panel).findByText('Min rest hours')).toBeInTheDocument();
  });

  it('can create, publish and unpublish a roster when its rules are met', async () => {
    const user = await openAs('admin@example.com', '/rosters');
    await sitesApi.updateSite(2, { guards_required_day: 0, guards_required_night: 0 }); // nothing required, so an empty week is valid
    await user.selectOptions(await screen.findByLabelText('Site'), 'Nakasero Warehouse');
    await user.click(screen.getByRole('button', { name: 'Create roster' }));
    const panel = await screen.findByLabelText('Live checks');
    expect(await within(panel).findByText(/All checks pass/)).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Publish roster' }));
    expect(await screen.findByText(/Roster published/)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Unpublish roster' }));
    await user.click(screen.getByRole('button', { name: 'Click again to confirm' }));
    expect(await screen.findByText(/draft again/)).toBeInTheDocument();
  });

  it('rejects a week that does not start on a Monday', async () => {
    const user = await openAs('admin@example.com', '/rosters');
    await user.selectOptions(await screen.findByLabelText('Site'), 'Kololo Office Park');
    const week = screen.getByLabelText('Week starting (a Monday)');
    await user.clear(week);
    await user.type(week, '2026-11-11');
    await user.click(screen.getByRole('button', { name: 'Create roster' }));
    expect(await screen.findByText(/must be a Monday/)).toBeInTheDocument();
  });

  it('a supervisor can read a roster but gets no edit controls', async () => {
    await openAs('supervisor@example.com', '/rosters/1');
    await screen.findByRole('heading', { name: /Kololo Office Park/ });
    expect(screen.queryByRole('button', { name: 'Publish roster' })).not.toBeInTheDocument();
    expect(screen.queryAllByLabelText(/^Add guard to/)).toHaveLength(0);
  });
});

describe('attendance', () => {
  it('lists today, filters to exceptions, and corrects a no-show with a required reason', async () => {
    const user = await openAs('manager@example.com', '/attendance');
    expect(await screen.findByText('Amina K.')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Exceptions' }));
    await waitFor(() => expect(screen.queryByText('Amina K.')).not.toBeInTheDocument()); // on time, so not an exception
    expect(screen.getByText('John M.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Correct Ruth N.' }));
    await user.click(screen.getByRole('button', { name: 'Save correction' }));          // no reason yet
    expect(await screen.findByText('is required')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Reason for the correction'), 'Phone was dead, supervisor saw him on site');
    await user.selectOptions(screen.getByLabelText('Status'), 'on_time');
    await user.click(screen.getByRole('button', { name: 'Save correction' }));
    expect(await screen.findByText('Correction saved')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Correct Ruth N.' })).not.toBeInTheDocument()); // no longer an exception
  });
});

describe('attendance before anyone arrives', () => {
  it('shows a published shift with no check-in as pending and offers no correction yet', async () => {
    const user = await openAs('admin@example.com', '/attendance');
    await screen.findByText('Amina K.');
    await sitesApi.updateSite(2, { guards_required_day: 0, guards_required_night: 0 });
    await guardsApi.setGuardSites(4, [1, 2]);
    const roster = (await rostersApi.createRoster({ site_id: 2, week_start: mondayOfToday() })).data;
    const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
    await rostersApi.addShift(roster.id, { guard_id: 4, shift_template_id: 1, date: today });
    await rostersApi.publishRoster(roster.id);
    await user.click(screen.getByLabelText('Day'));            // any interaction re-reads the list
    await user.click(screen.getByRole('tab', { name: 'Exceptions' }));
    await user.click(screen.getByRole('tab', { name: 'All shifts' }));
    expect(await screen.findByText('Nakasero Warehouse')).toBeInTheDocument();
    expect(screen.getByText('No record yet')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });
});

describe('flags', () => {
  it('shows open flags with evidence and confirms one', async () => {
    const user = await openAs('manager@example.com', '/flags');
    expect(await screen.findByRole('cell', { name: 'Too fast' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review flag 77' }));
    const detail = await screen.findByLabelText('Flag details');
    expect(await within(detail).findByText(/scanned 4 seconds apart/)).toBeInTheDocument();
    expect(within(detail).getByText('Back gate')).toBeInTheDocument();
    await user.type(within(detail).getByLabelText('Note (optional)'), 'Confirmed with supervisor');
    await user.click(within(detail).getByRole('button', { name: 'Confirm flag' }));
    expect(await screen.findByText('Flag confirmed')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('cell', { name: 'Too fast' })).not.toBeInTheDocument()); // open list no longer has it
  });

  it('filters by rule and can dismiss', async () => {
    const user = await openAs('supervisor@example.com', '/flags');
    await screen.findByRole('cell', { name: 'Too fast' });
    await user.selectOptions(screen.getByLabelText('Rule'), 'Missed checkpoint');
    await waitFor(() => expect(screen.queryByRole('cell', { name: 'Too fast' })).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Review flag 78' }));
    await user.click(await screen.findByRole('button', { name: 'Dismiss flag' }));
    expect(await screen.findByText('Flag dismissed')).toBeInTheDocument();
  });
});

describe('notification bell and dashboard', () => {
  it('shows the unread count, opens the list and marks one read', async () => {
    const user = await openAs('manager@example.com', '/');
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' });
    await user.click(bell);
    await user.click(await screen.findByRole('button', { name: /High-severity flag/ }));
    expect(await screen.findByRole('heading', { name: 'Patrol flags' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument();
  });

  it('dashboard has live numbers and exactly one quick-links block', async () => {
    await openAs('manager@example.com', '/');
    expect(await screen.findByText('Guards on duty')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Quick links')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Flags to review \(2\)/ })).toBeInTheDocument();
    expect(screen.queryByText('Not built yet')).not.toBeInTheDocument();
  });

  it('the mock API enforces the same rules as the real one', async () => {
    await openAs('admin@example.com', '/');
    await screen.findByText('Guards on duty');
    await expect(rostersApi.publishRoster(1)).rejects.toMatchObject({ status: 409, code: 'ROSTER_INVALID' });
    await expect(rostersApi.addShift(2, { guard_id: 4, shift_template_id: 1, date: '2026-01-01' })).rejects.toMatchObject({ status: 409 }); // published roster
    await expect(request('/flags/77', { method: 'PATCH', body: { status: 'maybe' } })).rejects.toMatchObject({ status: 400 });
  });
});
