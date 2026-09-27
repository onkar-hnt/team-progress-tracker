import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest globals are off in this project, so Testing Library cannot register
// its own teardown. Without this, one test's markup stays in the document and
// the next test's queries match two copies of everything.
afterEach(cleanup)
