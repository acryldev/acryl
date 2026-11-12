/**
 * The door's page core for another page to build its own door on (`acryl-door/page`): the channel to the Host, the driver of the
 * document, the user-input clock and the plain DOM indicator. ACRYL's DSH client uses the first three with its own React indicator.
 */

export { PageChannel, SILENCE_MS, type ChannelSource, type PageChannelOptions } from './channel.ts'
export { UiDriver, type DriverActivity, type UiDriverOptions } from './driver/driver.ts'
export { UserInputClock } from './user-input.ts'
export { mountIndicator } from './indicator.ts'
