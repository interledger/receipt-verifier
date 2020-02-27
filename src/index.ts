import reduct from 'reduct'
import { App } from './services/App'

try {
  const app = reduct()(App)
  app.start()
  console.log('App listening on port: ' + this.config.port)
} catch (err) {
  console.error('fatal:', err)
  process.exit(1)
}
