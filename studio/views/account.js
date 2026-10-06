// Account sign-in and license status (decisions 0003, 0006, 0008). EVCore Studio needs an account
// with a license: the licenses bought at csharness.com, which are added to the account with the
// order's email automatically. There is no free trial (owner, 2026-09-26).
import {esc, badge, date} from '../core/ui.js';

export const usable = license => ['valid', 'development', 'demo'].includes(license?.state);

const MESSAGES = {
  signed_out: ['Sign in to EVCore Studio', 'Use the email address you bought Studio with at csharness.com; your license is already on that account. New to EVCore? Create an account with the email you will order with.'],
  email_not_confirmed: ['Confirm your email address', 'Enter the code from that email to finish setting up your account. The email also has a link: if you use that instead, come back and sign in.'],
  no_license: ['This account has no active Studio license', 'Licenses bought at csharness.com are added to the account with the order’s email address, usually within a minute. If you just ordered, check again shortly. Bought with a different email? Contact support@csharness.com with your order number. The EVCore device works on its own with its built-in screen.'],
  expired: ['Studio needs to check your license', 'EVCore Studio works offline for 30 days after its last check. Connect this computer to the internet, then check again.'],
  clock: ['Check this computer’s date and time', 'The computer’s clock appears to have been set back. Correct the date and time, then check again.'],
  'sign-up': ['Create your EVCore account', 'If you bought Studio, use the email address from your order and your license is added automatically. Not bought yet? Pre-order at csharness.com with this email and your license appears here.'],
  reset: ['Reset your password', 'Enter your account email and we will email you a code to choose a new password.'],
  'reset-code': ['Choose a new password', 'Enter the code from the email and your new password. Studio signs you in straight away.'],
  not_configured: ['This copy of EVCore Studio cannot sign in', 'This build is missing its account settings. Contact CS Harness for an updated version.']
};

// Full-screen gate shown instead of the app until the license is usable.
export function accountGate(license, state) {
  const mode = state.accountMode;
  const key = (license?.state || 'signed_out') === 'signed_out' && mode !== 'sign-in' ? mode : license?.state;
  const [title, body] = MESSAGES[key] || MESSAGES.signed_out;
  const signedIn = ['no_license', 'expired', 'clock'].includes(license?.state);
  const verifying = key === 'email_not_confirmed';
  const email = license?.email || state.accountEmail || '';
  const form = verifying
    ? `<form data-form="account-verify" class="stack">
        <label class="field">Confirmation code<input id="account-code" class="code-input" name="code" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,12}" maxlength="12" spellcheck="false" title="The digits from the confirmation email"></label>
        <button class="primary" type="submit" ${state.accountBusy ? 'disabled' : ''}>${state.accountBusy ? 'Please wait…' : 'Confirm email'}</button>
        <div class="actions"><button type="button" class="quiet" data-action="account-resend" ${state.accountBusy ? 'disabled' : ''}>Send a new code</button><button type="button" class="quiet" data-action="account-sign-out">Back to sign in</button></div></form>`
    : key === 'reset-code'
    ? `<form data-form="account-reset-code" class="stack">
        <label class="field">Reset code<input id="account-code" class="code-input" name="code" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,12}" maxlength="12" spellcheck="false" title="The digits from the reset email"></label>
        <label class="field">New password (at least 8 characters)<input id="account-password" name="password" type="password" required minlength="8" autocomplete="new-password"></label>
        <label class="field">Confirm new password<input id="account-password2" name="password2" type="password" required minlength="8" autocomplete="new-password"></label>
        <button class="primary" type="submit" ${state.accountBusy ? 'disabled' : ''}>${state.accountBusy ? 'Please wait…' : 'Set new password'}</button>
        <div class="actions"><button type="button" class="quiet" data-action="account-reset-resend" ${state.accountBusy ? 'disabled' : ''}>Send a new code</button><button type="button" class="quiet" data-action="account-mode" data-mode="sign-in">Back to sign in</button></div></form>`
    : mode === 'reset'
    ? `<form data-form="account-reset" class="stack"><label class="field">Email<input id="account-email" name="email" type="email" required autocomplete="email" value="${esc(state.accountEmail)}"></label>
        <button class="primary" type="submit" ${state.accountBusy ? 'disabled' : ''}>${state.accountBusy ? 'Please wait…' : 'Email me a code'}</button><button type="button" class="quiet" data-action="account-mode" data-mode="sign-in">Back to sign in</button></form>`
    : `<form data-form="${mode === 'sign-up' ? 'account-sign-up' : 'account-sign-in'}" class="stack">
        <label class="field">Email<input id="account-email" name="email" type="email" required autocomplete="email" value="${esc(state.accountEmail || license?.email || '')}"></label>
        <label class="field">Password${mode === 'sign-up' ? ' (at least 8 characters)' : ''}<input id="account-password" name="password" type="password" required minlength="${mode === 'sign-up' ? 8 : 1}" autocomplete="${mode === 'sign-up' ? 'new-password' : 'current-password'}"></label>
        ${mode === 'sign-up' ? '<label class="field">Confirm password<input id="account-password2" name="password2" type="password" required minlength="8" autocomplete="new-password"></label>' : ''}
        <button class="primary" type="submit" ${state.accountBusy ? 'disabled' : ''}>${state.accountBusy ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
        ${mode === 'sign-up' ? '<button type="button" class="quiet" data-action="account-mode" data-mode="sign-in">I already have an account</button>'
          : '<div class="actions"><button type="button" class="quiet" data-action="account-mode" data-mode="sign-up">Create an account</button><button type="button" class="quiet" data-action="account-mode" data-mode="reset">Forgot password?</button></div>'}</form>`;
  return `<div class="gate"><div class="gatecard" role="main"><div class="brand dark">EVCORE<span>STUDIO</span></div>
    <h1 id="main-heading" tabindex="-1">${esc(title)}</h1>${verifying && email ? `<p>We emailed a confirmation code to <b>${esc(email)}</b>.</p>` : ''}${key === 'reset-code' && state.accountEmail ? `<p>If <b>${esc(state.accountEmail)}</b> has an EVCore account, we emailed it a reset code.</p>` : ''}<p>${esc(body)}</p>
    ${state.accountMessage ? `<div class="notice" role="status">${esc(state.accountMessage)}</div>` : ''}
    ${signedIn ? `<div class="actions"><button class="primary" data-action="account-renew" ${state.accountBusy ? 'disabled' : ''}>Check again</button>${license?.state === 'no_license' ? '<button data-action="open-website" data-page="/pages/software">Buy a license</button>' : ''}<button data-action="account-sign-out">Sign out</button></div>`
      : license?.state === 'not_configured' ? '' : form}
    <p class="protocol-note">${license?.email && signedIn ? `Signed in as ${esc(license.email)}. ` : ''}Your customers’ records stay on this device unless you turn on record sync in Settings.
      <button class="linklike" data-action="open-website" data-page="/pages/download">Help with installing and signing in</button></p></div></div>`;
}

// Account panel for Device & settings.
export function accountPanel(license) {
  if (license?.state === 'demo') return `<section class="panel"><h2>Account</h2><div class="notice">Interactive demo: no account. In EVCore Studio you sign in with the email you ordered with, and your license is already on it.</div></section>`;
  if (license?.state === 'development') return `<section class="panel"><h2>Account</h2><div class="notice">Development build: accounts and licensing are off.</div></section>`;
  return `<section class="panel"><div class="panelhead"><h2>Account</h2>${badge(license?.state === 'valid' ? 'LICENSED' : 'NOT LICENSED', license?.state === 'valid' ? '' : 'amber')}</div>
    <p>Signed in as <b>${esc(license?.email || '')}</b> · ${license?.plan === 'pro' ? 'Studio Pro' : 'Studio'}${license?.plan === 'pro' ? '' : ' (manual diagnosis, work orders and reports; device features need Studio Pro)'}</p>
    <p>License checked ${license?.issued ? esc(date(license.issued)) : '—'}; works offline until <b>${license?.expires ? esc(date(license.expires)) : '—'}</b>${license?.daysLeft ? ` (${license.daysLeft} days)` : ''}.</p>
    <h3>Registered devices</h3>${license?.devices?.length ? `<ul>${license.devices.map(s => `<li class="mono">${esc(s)}</li>`).join('')}</ul>` : '<p class="muted">No devices are registered to this account yet. Contact CS Harness with the serial number on your device.</p>'}
    <p class="protocol-note">Studio runs tests only on devices registered to this account. Simulators are always available.</p>
    <div class="actions"><button data-action="account-renew">Check license now</button><button data-action="account-sign-out">Sign out</button></div></section>`;
}

const bridge = () => globalThis.evcore?.license;

async function apply(ctx, promise) {
  ctx.state.accountBusy = true; ctx.render();
  try {
    const result = await promise;
    ctx.state.accountMessage = result.message || '';
    if (result.email) ctx.state.accountEmail = result.email;
    await ctx.setLicense(result);
    return result;
  } catch (error) { ctx.state.accountMessage = error.message; return undefined; }
  finally { ctx.state.accountBusy = false; ctx.render(); }
}

export const accountActions = {
  'account-mode'(el, ctx) { ctx.state.accountMode = el.dataset.mode; ctx.state.accountMessage = ''; ctx.render(); },
  'account-renew'(_el, ctx) { return apply(ctx, bridge().renew()); },
  'account-resend'(_el, ctx) { return apply(ctx, bridge().resendConfirmation(ctx.license?.email || ctx.state.accountEmail)); },
  'account-reset-resend'(_el, ctx) { return apply(ctx, bridge().resetPassword(ctx.state.accountEmail)); },
  'account-sign-out'(_el, ctx) { ctx.state.accountMode = 'sign-in'; return apply(ctx, bridge().signOut()); }
};

export const accountForms = {
  'account-sign-in'(_form, data, ctx) { ctx.state.accountEmail = String(data.get('email')); return apply(ctx, bridge().signIn(String(data.get('email')), String(data.get('password')))); },
  'account-sign-up'(_form, data, ctx) {
    ctx.state.accountEmail = String(data.get('email'));
    if (data.get('password') !== data.get('password2')) { ctx.state.accountMessage = 'The passwords do not match.'; ctx.render(); return undefined; }
    return apply(ctx, bridge().signUp(String(data.get('email')), String(data.get('password')))).then(() => { ctx.state.accountMode = 'sign-in'; ctx.render(); });
  },
  'account-verify'(_form, data, ctx) { return apply(ctx, bridge().verifyEmail(ctx.license?.email || ctx.state.accountEmail, String(data.get('code')))); },
  'account-reset'(_form, data, ctx) {
    ctx.state.accountEmail = String(data.get('email'));
    return apply(ctx, bridge().resetPassword(ctx.state.accountEmail)).then(result => { if (result?.resetSent) { ctx.state.accountMode = 'reset-code'; ctx.render(); } });
  },
  'account-reset-code'(_form, data, ctx) {
    if (data.get('password') !== data.get('password2')) { ctx.state.accountMessage = 'The passwords do not match.'; ctx.render(); return undefined; }
    return apply(ctx, bridge().completeReset(ctx.state.accountEmail, String(data.get('code')), String(data.get('password'))))
      .then(result => { if (result && result.state !== 'signed_out') { ctx.state.accountMode = 'sign-in'; ctx.render(); } });
  }
};
