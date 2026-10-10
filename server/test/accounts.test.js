import test from "node:test";
import assert from "node:assert/strict";
import { loadAccounts, selectAccount, requireCreds, toAccountList, replyRecipients } from "../accounts.js";

const defaultEnv = {
  PRIVATEEMAIL_USER: "login@example.com",
  PRIVATEEMAIL_PASS: "default-secret",
  PRIVATEEMAIL_FROM: "Mailbox <alias@example.com>",
};

test("Old variables load one default account", () => {
  assert.deepEqual(loadAccounts(defaultEnv), [{
    number: 1,
    user: "login@example.com",
    pass: "default-secret",
    from: "Mailbox <alias@example.com>",
    default: true,
  }]);
});

test("EMAIL_USER and EMAIL_PASS supply the default account", () => {
  const [account] = loadAccounts({ EMAIL_USER: "old@example.com", EMAIL_PASS: "old-secret" });
  assert.equal(account.user, "old@example.com");
  assert.equal(account.pass, "old-secret");
  assert.equal(account.from, "old@example.com");
  assert.equal(account.default, true);
  const [preferred] = loadAccounts({ ...defaultEnv, EMAIL_USER: "old@example.com", EMAIL_PASS: "old-secret" });
  assert.equal(preferred.user, defaultEnv.PRIVATEEMAIL_USER);
  assert.equal(preferred.pass, defaultEnv.PRIVATEEMAIL_PASS);
});

test("Numbered accounts allow gaps and skip accounts without a login address", () => {
  const accounts = loadAccounts({
    ...defaultEnv,
    PRIVATEEMAIL_PASS_2: "unused-secret",
    PRIVATEEMAIL_FROM_2: "unused@example.com",
    PRIVATEEMAIL_USER_3: "third@example.com",
    PRIVATEEMAIL_PASS_3: "third-secret",
    PRIVATEEMAIL_FROM_3: "Third <third-from@example.com>",
    PRIVATEEMAIL_USER_4: "  ",
    PRIVATEEMAIL_USER_5: "fifth@example.com",
    PRIVATEEMAIL_PASS_5: "fifth-secret",
  });
  assert.deepEqual(accounts.map((account) => account.number), [1, 3, 5]);
  assert.equal(accounts[1].user, "third@example.com");
  assert.equal(accounts[1].pass, "third-secret");
  assert.equal(accounts[1].from, "Third <third-from@example.com>");
  assert.equal(accounts[1].default, false);
  assert.equal(selectAccount(accounts, "fifth@example.com"), accounts[2]);
});

test("Omitting account selects the default account", () => {
  const accounts = loadAccounts({ ...defaultEnv, PRIVATEEMAIL_USER_2: "second@example.com" });
  assert.equal(selectAccount(accounts), accounts[0]);
});

test("An unknown account returns an error without passwords", () => {
  const accounts = loadAccounts(defaultEnv);
  for (const address of ["unknown@example.com", "", "alias@example.com"]) {
    assert.throws(() => selectAccount(accounts, address), (error) => {
      assert.match(error.message, /Unknown account/);
      assert.match(error.message, /login@example\.com/);
      assert.ok(!error.message.includes(defaultEnv.PRIVATEEMAIL_PASS));
      return true;
    });
  }
});

test("Login address matching ignores case and outer spaces", () => {
  const accounts = loadAccounts({
    ...defaultEnv,
    PRIVATEEMAIL_USER_2: "  Second@Example.com  ",
    PRIVATEEMAIL_PASS_2: "second-secret",
  });
  assert.equal(accounts[1].user, "Second@Example.com");
  assert.equal(selectAccount(accounts, "  SECOND@example.COM  "), accounts[1]);
  assert.equal(selectAccount(accounts, " LOGIN@EXAMPLE.COM "), accounts[0]);
});

test("Each From address defaults to its account login address", () => {
  const env = {};
  for (let number = 1; number <= 5; number++) {
    const suffix = number === 1 ? "" : `_${number}`;
    env[`PRIVATEEMAIL_USER${suffix}`] = `account${number}@example.com`;
    env[`PRIVATEEMAIL_PASS${suffix}`] = `secret-${number}`;
  }
  for (const account of loadAccounts(env)) {
    assert.equal(account.from, account.user);
  }
});

test("Empty values and whole variable literals are unset for every account", () => {
  for (let number = 1; number <= 5; number++) {
    const suffix = number === 1 ? "" : `_${number}`;
    const userKey = `PRIVATEEMAIL_USER${suffix}`;
    const passKey = `PRIVATEEMAIL_PASS${suffix}`;
    const fromKey = `PRIVATEEMAIL_FROM${suffix}`;
    const env = { [userKey]: `account${number}@example.com`, [passKey]: `secret-${number}` };
    for (const value of ["", "  ", "  ${VAR}  ", "${}"]) {
      const [account] = loadAccounts({ ...env, [fromKey]: value }).filter((entry) => entry.number === number);
      assert.equal(account.from, account.user);
      const [noPass] = loadAccounts({ ...env, [passKey]: value }).filter((entry) => entry.number === number);
      assert.equal(noPass.pass, "");
      assert.equal(toAccountList([noPass])[0].configured, false);
      const noUser = loadAccounts({ ...env, [userKey]: value });
      if (number === 1) {
        assert.equal(noUser[0].user, "");
        assert.throws(() => requireCreds(noUser[0]), /Missing PRIVATEEMAIL_USER \/ PRIVATEEMAIL_PASS/);
      } else {
        assert.ok(!noUser.some((entry) => entry.number === number));
      }
    }
    const [literalFrom] = loadAccounts({ ...env, [fromKey]: `  \${${fromKey}}  ` })
      .filter((entry) => entry.number === number);
    assert.equal(literalFrom.from, literalFrom.user);
  }
});

test("Unset primary variables permit EMAIL_USER and EMAIL_PASS fallback", () => {
  const [account] = loadAccounts({
    PRIVATEEMAIL_USER: " ${PRIVATEEMAIL_USER} ",
    PRIVATEEMAIL_PASS: " ",
    PRIVATEEMAIL_FROM: "${PRIVATEEMAIL_FROM}",
    EMAIL_USER: "old@example.com",
    EMAIL_PASS: "old-secret",
  });
  assert.equal(account.user, "old@example.com");
  assert.equal(account.pass, "old-secret");
  assert.equal(account.from, "old@example.com");
  const [unset] = loadAccounts({ EMAIL_USER: "${EMAIL_USER}", EMAIL_PASS: "${EMAIL_PASS}" });
  assert.equal(unset.user, "");
  assert.equal(unset.pass, "");
});

test("Nonempty passwords keep spaces and partial variable literals", () => {
  const [account] = loadAccounts({ ...defaultEnv, PRIVATEEMAIL_PASS: " secret-${VALUE} " });
  assert.equal(account.pass, " secret-${VALUE} ");
});

test("The account list exposes full addresses and configuration without passwords", () => {
  const accounts = loadAccounts({
    ...defaultEnv,
    PRIVATEEMAIL_USER_2: "second@example.com",
    PRIVATEEMAIL_PASS_2: "second-secret",
    PRIVATEEMAIL_USER_3: "third@example.com",
  });
  const list = toAccountList(accounts);
  assert.deepEqual(list, [
    { user: "login@example.com", from: "Mailbox <alias@example.com>", default: true, configured: true },
    { user: "second@example.com", from: "second@example.com", default: false, configured: true },
    { user: "third@example.com", from: "third@example.com", default: false, configured: false },
  ]);
  const json = JSON.stringify(list);
  assert.doesNotMatch(json, /pass|password/i);
  for (const password of [defaultEnv.PRIVATEEMAIL_PASS, "second-secret"]) {
    assert.ok(!json.includes(password));
  }
});

test("Account 6 is ignored", () => {
  const env = {};
  for (let number = 1; number <= 6; number++) {
    const suffix = number === 1 ? "" : `_${number}`;
    env[`PRIVATEEMAIL_USER${suffix}`] = `account${number}@example.com`;
    env[`PRIVATEEMAIL_PASS${suffix}`] = `secret-${number}`;
    env[`PRIVATEEMAIL_FROM${suffix}`] = `from${number}@example.com`;
  }
  const accounts = loadAccounts(env);
  assert.equal(accounts.length, 5);
  assert.throws(() => selectAccount(accounts, "account6@example.com"), /Unknown account/);
  assert.ok(!JSON.stringify(toAccountList(accounts)).includes("from6@example.com"));
});

test("An account without a password fails on use and names its variable", () => {
  for (let number = 2; number <= 5; number++) {
    const accounts = loadAccounts({ ...defaultEnv, [`PRIVATEEMAIL_USER_${number}`]: "extra@example.com" });
    const account = selectAccount(accounts, "extra@example.com");
    assert.throws(() => requireCreds(account), new RegExp(`Missing PRIVATEEMAIL_PASS_${number}`));
    assert.equal(toAccountList(accounts)[1].configured, false);
  }
});

test("Missing default credentials keep the old error", () => {
  for (const env of [{}, { PRIVATEEMAIL_USER: "login@example.com" }, { PRIVATEEMAIL_PASS: "default-secret" }]) {
    const accounts = loadAccounts(env);
    assert.equal(accounts.length, 1);
    assert.throws(() => requireCreds(selectAccount(accounts)), {
      message: "Missing PRIVATEEMAIL_USER / PRIVATEEMAIL_PASS. Set them in the plugin configure / MCP env.",
    });
  }
  assert.deepEqual(toAccountList(loadAccounts({})), []);
  assert.doesNotThrow(() => requireCreds(selectAccount(loadAccounts(defaultEnv))));
});

test("Reply-all keeps CC separate and removes self and duplicate addresses", () => {
  const account = loadAccounts(defaultEnv)[0];
  const recipients = replyRecipients({
    from: "sender@example.com",
    to: ["LOGIN@EXAMPLE.COM", " Alias@Example.com ", "other@example.com", "OTHER@EXAMPLE.COM", "SENDER@example.com"],
    cc: ["copy@example.com", "COPY@EXAMPLE.COM", "Other@Example.com", "login@example.com", "ALIAS@example.com", "sender@example.com"],
  }, account, true);
  assert.deepEqual(recipients, {
    to: "sender@example.com, other@example.com",
    cc: "copy@example.com",
  });
});

test("Reply-all compares bare addresses in display names", () => {
  const account = loadAccounts({ ...defaultEnv, PRIVATEEMAIL_FROM: "Mailbox <ALIAS@example.com>" })[0];
  assert.deepEqual(replyRecipients({
    from: "Sender <sender@example.com>",
    to: ["Login <login@example.com>", "Alias <alias@example.com>", "SENDER@EXAMPLE.COM"],
    cc: ["Copy <copy@example.com>", "COPY@EXAMPLE.COM", "Alias <ALIAS@example.com>"],
  }, account, true), { to: "Sender <sender@example.com>", cc: "Copy <copy@example.com>" });
});

test("Reply-all passes undefined when CC is empty", () => {
  assert.deepEqual(replyRecipients({
    from: "sender@example.com",
    to: ["login@example.com"],
    cc: ["sender@example.com", "alias@example.com"],
  }, loadAccounts(defaultEnv)[0], true), { to: "sender@example.com", cc: undefined });
});

test("Reply-all can keep the sender when the sender is yourself", () => {
  const account = loadAccounts(defaultEnv)[0];
  for (const from of [account.user, account.from]) {
    assert.deepEqual(replyRecipients({
      from,
      to: ["other@example.com", "login@example.com", "alias@example.com"],
      cc: ["copy@example.com", "OTHER@example.com"],
    }, account, true), { to: `${from}, other@example.com`, cc: "copy@example.com" });
  }
});

test("Reply-all handles a missing sender", () => {
  assert.deepEqual(replyRecipients({ to: ["other@example.com"] }, loadAccounts(defaultEnv)[0], true), {
    to: "other@example.com",
    cc: undefined,
  });
});

test("A reply without reply-all uses only the original sender", () => {
  const account = loadAccounts(defaultEnv)[0];
  for (const from of ["Sender <sender@example.com>", account.user]) {
    assert.deepEqual(replyRecipients({
      from,
      to: ["other@example.com"],
      cc: ["copy@example.com"],
    }, account, false), { to: from, cc: undefined });
  }
});
