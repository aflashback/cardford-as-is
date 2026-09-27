import assert from 'node:assert/strict';
import test from 'node:test';
import { getFamily, mutateFamily, effectiveFamilyGrant } from '../access/family.ts';
import { testDatabase, player } from '../billing/database-test.ts';
const expired = new Date(0).toISOString();
test('five-person family capacity includes payer and reservations; accepted removals are held', async (t) => {
  const pool = await testDatabase(t);
  if (!pool) return;
  const payer = await player(pool, { plan: 'family' });
  const created = await mutateFamily(pool, payer, { commandId: 'create', action: 'create' });
  assert.equal(created.members.length, 1);
  assert.equal(created.members[0]!.seatClass, 'unlimited');
  const people = await Promise.all(
    Array.from({ length: 5 }, () => player(pool, { currentPeriodEnd: expired })),
  );
  const invitations = [];
  for (let i = 0; i < 4; i++) {
    const result = await mutateFamily(pool, payer, {
      commandId: `invite-${i}`,
      action: 'invite',
      inviteeId: people[i]!,
      seatClass: i < 2 ? 'unlimited' : 'limited',
    });
    invitations.push(result.invitations.find((x) => x.inviteeId === people[i])!);
  }
  await assert.rejects(
    mutateFamily(pool, payer, {
      commandId: 'over-cap',
      action: 'invite',
      inviteeId: people[4]!,
      seatClass: 'limited',
    }),
    /No seat/,
  );
  await assert.rejects(
    mutateFamily(pool, people[1]!, {
      commandId: 'wrong-account',
      action: 'accept',
      token: invitations[0]!.token!,
      acknowledgeIndividualCoverage: true,
    }),
    /another verified local account/,
  );
  const accepted = await mutateFamily(pool, people[0]!, {
    commandId: 'accept',
    action: 'accept',
    token: invitations[0]!.token!,
    acknowledgeIndividualCoverage: false,
  });
  assert.equal(accepted.role, 'member');
  assert.equal(accepted.members.length, 1);
  assert.equal(accepted.invitations.length, 0);
  assert.deepEqual(
    Object.keys(accepted.members[0]!).sort(),
    ['assignmentId', 'displayName', 'periodEnd', 'playerId', 'seatClass', 'status'].sort(),
  );
  const client = await pool.connect();
  try {
    assert.equal((await effectiveFamilyGrant(client, people[0]!))?.plan, 'unlimited');
  } finally {
    client.release();
  }
  await mutateFamily(pool, payer, {
    commandId: 'remove',
    action: 'remove',
    assignmentId: accepted.members[0]!.assignmentId,
  });
  const after = await getFamily(pool, payer);
  assert.equal(after.members.find((x) => x.playerId === people[0])!.status, 'held');
  assert.equal((await getFamily(pool, people[0]!)).role, 'none');
  const c = await pool.connect();
  try {
    assert.equal(await effectiveFamilyGrant(c, people[0]!), null);
  } finally {
    c.release();
  }
  await assert.rejects(
    mutateFamily(pool, payer, {
      commandId: 'rotate-held',
      action: 'invite',
      inviteeId: people[4]!,
      seatClass: 'unlimited',
    }),
    /No seat/,
  );
  await mutateFamily(pool, payer, {
    commandId: 'correct-invite',
    action: 'revoke-invite',
    invitationId: invitations[1]!.invitationId,
  });
  await mutateFamily(pool, payer, {
    commandId: 'replace-unaccepted',
    action: 'invite',
    inviteeId: people[4]!,
    seatClass: 'unlimited',
  });
});

test('last-seat race accepts one reservation and invite acceptance preserves separate individual coverage', async (t) => {
  const pool = await testDatabase(t);
  if (!pool) return;
  const payer = await player(pool, { plan: 'family' });
  await mutateFamily(pool, payer, { commandId: 'create', action: 'create' });
  const first = await player(pool);
  const a = await player(pool);
  const b = await player(pool);
  const issued = await mutateFamily(pool, payer, {
    commandId: 'first',
    action: 'invite',
    inviteeId: first,
    seatClass: 'unlimited',
  });
  const result = await Promise.allSettled(
    [a, b].map((inviteeId, i) =>
      mutateFamily(pool, payer, {
        commandId: `race-${i}`,
        action: 'invite',
        inviteeId,
        seatClass: 'unlimited',
      }),
    ),
  );
  assert.equal(result.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(result.filter((x) => x.status === 'rejected').length, 1);
  const invite = issued.invitations[0]!;
  await assert.rejects(
    mutateFamily(pool, first, {
      commandId: 'ack-required',
      action: 'accept',
      token: invite.token!,
      acknowledgeIndividualCoverage: false,
    }),
    /existing individual coverage/,
  );
  await mutateFamily(pool, first, {
    commandId: 'accept',
    action: 'accept',
    token: invite.token!,
    acknowledgeIndividualCoverage: true,
  });
  assert.equal(
    (await pool.query('SELECT profile FROM players WHERE id=$1', [first])).rows[0].profile.plan,
    'unlimited',
  );
  await assert.rejects(
    mutateFamily(pool, first, {
      commandId: 'reuse-token',
      action: 'accept',
      token: invite.token!,
      acknowledgeIndividualCoverage: true,
    }),
    /already used/,
  );
  await assert.rejects(
    mutateFamily(pool, first, {
      commandId: 'payer-only',
      action: 'invite',
      inviteeId: b,
      seatClass: 'limited',
    }),
  );
});

test('expired/revoked invites cannot activate access and guards reject revoked sessions before writes', async (t) => {
  const pool = await testDatabase(t);
  if (!pool) return;
  const payer = await player(pool, { plan: 'family' });
  const invited = await player(pool, { currentPeriodEnd: expired });
  await mutateFamily(pool, payer, { commandId: 'create', action: 'create' });
  const result = await mutateFamily(pool, payer, {
    commandId: 'invite',
    action: 'invite',
    inviteeId: invited,
    seatClass: 'limited',
  });
  const invitation = result.invitations[0]!;
  await pool.query("UPDATE family_invitations SET expires_at=now()-interval '1 second' WHERE id=$1", [
    invitation.invitationId,
  ]);
  await assert.rejects(
    mutateFamily(pool, invited, {
      commandId: 'expired',
      action: 'accept',
      token: invitation.token!,
      acknowledgeIndividualCoverage: true,
    }),
    /expired/,
  );
  await assert.rejects(
    mutateFamily(
      pool,
      payer,
      { commandId: 'revoked-session', action: 'invite', inviteeId: invited, seatClass: 'limited' },
      async () => {
        throw new Error('Revoked session');
      },
    ),
  );
  assert.equal((await pool.query('SELECT * FROM family_invitations')).rowCount, 1);
});
