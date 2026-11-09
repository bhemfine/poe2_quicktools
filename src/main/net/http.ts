import { version } from '../../../package.json'
import { APP_NAME, CONTACT_EMAIL } from '../../shared/notices'

export function buildUserAgent(appVersion: string): string {
  return `${APP_NAME}/${appVersion} (contact: ${CONTACT_EMAIL})`
}

/** The only User-Agent sent to GGG and poe.ninja (PLAN §1.4). */
export const USER_AGENT = buildUserAgent(version)
