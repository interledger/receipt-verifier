import reduct from 'reduct'
import { App } from './services/App'

try {
  const app = reduct()(App)
  app.start()
} catch (err) {
  console.error('fatal:', err)
  process.exit(1)
}
