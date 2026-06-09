import type messages from './messages/en.json';

declare module 'next-intl' {
  interface Messages extends Record<string, unknown> {}
}

declare global {
  type IntlMessages = typeof messages;
}
