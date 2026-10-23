import { runTest } from '../common.case.test.ts'
import { TrieRouter } from './router.ts'

describe('TrieRouter', () => {
  runTest({
    newRouter: () => new TrieRouter(),
  })
})
