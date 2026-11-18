/**
 * The door (`plugins/acryl-door`) lets an agent working in this folder look at the running page and act on it, through `.acryl/bin/acryl`. It is on in development
 * and off in production (`NODE_ENV=production`) and when `ACRYL_DOOR=off`: `src/app.ts` leaves its row out then, and the pages leave its script tag out. One process
 * at a time serves a folder's door, so the tests that start the real server set `ACRYL_DOOR=off` and a second `npm start` beside a running one does not fail on it.
 */
export const doorEnabled = (): boolean =>
  process.env.NODE_ENV !== 'production' && process.env.ACRYL_DOOR !== 'off'
