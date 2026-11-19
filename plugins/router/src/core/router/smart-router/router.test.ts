import { runTest } from '../common.case.test.ts'
import { RegExpRouter } from '../reg-exp-router/index.ts'
import { TrieRouter } from '../trie-router/index.ts'
import { SmartRouter } from './router.ts'

describe('SmartRouter', () => {
  runTest({
    newRouter: () =>
      new SmartRouter({
        routers: [new RegExpRouter(), new TrieRouter()],
      }),
  })
})
