import { createApp } from './app.js';
import { PORT, DATA_DIR } from './config.js';

createApp().listen(PORT, () => {
  console.log(`plotq listening on http://localhost:${PORT} (data in ${DATA_DIR})`);
});
