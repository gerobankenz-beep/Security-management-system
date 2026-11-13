const app = require('./app');
const env = require('./config/env');
const scheduler = require('./jobs/scheduler');

app.listen(env.port, () => {
  console.log(`API running at http://localhost:${env.port}/api/v1  (try /health)`);
  scheduler.start();
});
