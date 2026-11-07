const app = require('./app');
const env = require('./config/env');

app.listen(env.port, () => {
  console.log(`API running at http://localhost:${env.port}/api/v1  (try /health)`);
});
app.use('/api/v1/sites', require('./src/modules/sites/routes'));
app.use('/api/v1/scans', require('./src/modules/scans/routes'));