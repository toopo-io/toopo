import { describe, expect, it } from 'vitest';
import { inviteEn } from './invite.en';

describe('inviteEn', () => {
  it('names the inviter and workspace in the subject and embeds the accept URL', () => {
    const content = inviteEn({
      inviterName: 'Ada',
      workspaceName: 'Acme',
      url: 'https://app.test/en/accept-invitation?id=inv-1',
    });
    expect(content.subject).toContain('Ada');
    expect(content.subject).toContain('Acme');
    expect(content.text).toContain('https://app.test/en/accept-invitation?id=inv-1');
    expect(content.html).toContain('https://app.test/en/accept-invitation?id=inv-1');
  });

  it('escapes HTML in the inviter and workspace names (no injection in the email)', () => {
    const content = inviteEn({
      inviterName: '<script>x</script>',
      workspaceName: 'A&B "Co"',
      url: 'https://app.test/en/accept-invitation?id=inv-1',
    });
    expect(content.html).not.toContain('<script>x</script>');
    expect(content.html).toContain('&lt;script&gt;');
    expect(content.html).toContain('A&amp;B &quot;Co&quot;');
  });
});
