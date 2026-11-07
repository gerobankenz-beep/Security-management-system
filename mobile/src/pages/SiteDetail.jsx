// One site: overview, checkpoints, routes, people.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getSite } from '../api/sites';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import PageHeader from '../components/PageHeader';
import Tabs from '../components/Tabs';
import StaleNotice from '../components/StaleNotice';
import Loading from '../components/Loading';
import ErrorBox from '../components/ErrorBox';
import CheckpointsTab from './site/CheckpointsTab';
import RoutesTab from './site/RoutesTab';
import PeopleTab from './site/PeopleTab';

export default function SiteDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const canRoute = ['admin', 'ops_manager'].includes(user.role);
  const canSeeGuards = ['admin', 'ops_manager', 'supervisor'].includes(user.role);
  const [tab, setTab] = useState('overview');
  const { data: site, loading, error, staleAt, reload } = useApi(() => getSite(id), [id], { cacheKey: `site:${id}` });

  const tabs = [{ key: 'overview', label: 'Overview' }, { key: 'checkpoints', label: 'Checkpoints' }, { key: 'routes', label: 'Routes' },
    ...(canSeeGuards ? [{ key: 'people', label: 'People' }] : [])];

  return (
    <>
      <PageHeader title={site ? site.name : 'Site'} subtitle={site ? site.address : ''}
        actions={<><Link className="btn" to="/sites">Back to sites</Link>{isAdmin && site && <> <Link className="btn btn-primary" to={`/sites/${id}/edit`}>Edit site</Link></>}</>} />
      <StaleNotice at={staleAt} />
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {site && (
        <>
          <Tabs tabs={tabs} active={tab} onChange={setTab} />
          {tab === 'overview' && (
            <div className="card">
              <dl className="details">
                <dt>Status</dt><dd>{site.is_active ? 'Active' : 'Inactive'}</dd>
                <dt>Coordinates</dt><dd>{site.latitude}, {site.longitude}</dd>
                <dt>Geofence radius</dt><dd>{site.geofence_radius_m} m</dd>
                <dt>Guards needed</dt><dd>{site.guards_required_day} by day, {site.guards_required_night} by night</dd>
                <dt>Patrols per night</dt><dd>{site.patrols_per_night}</dd>
              </dl>
            </div>
          )}
          {tab === 'checkpoints' && <CheckpointsTab siteId={id} canEdit={isAdmin} canSheet={canRoute} />}
          {tab === 'routes' && <RoutesTab siteId={id} canEdit={canRoute} />}
          {tab === 'people' && <PeopleTab siteId={id} isAdmin={isAdmin} canSeeGuards={canSeeGuards} />}
        </>
      )}
    </>
  );
}
