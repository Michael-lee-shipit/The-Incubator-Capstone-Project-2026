import { api } from './api.js';
import { setSession } from './session.js';

const form = document.getElementById('auth-form');
const title = document.getElementById('form-title');
const message = document.getElementById('form-message');
const toggle = document.getElementById('toggle-mode');
const roleContainer = document.getElementById('role-container');
const passwordInput = document.getElementById('password');
const submitButton = document.getElementById('submit-btn');
const errorBanner = document.getElementById('error-banner');
let signup = false;

toggle.addEventListener('click', (event) => {
  event.preventDefault();
  signup = !signup;
  title.textContent = signup ? 'Create your account' : 'Log in';
  message.textContent = signup ? 'Choose your account role. You can use attendee or organizer to try the full flow.' : 'Use your email and password to continue.';
  submitButton.textContent = signup ? 'Sign up' : 'Log in';
  toggle.textContent = signup ? 'Already registered? Log in' : 'Need an account? Sign up';
  roleContainer.hidden = !signup;
  passwordInput.autocomplete = signup ? 'new-password' : 'current-password';
  errorBanner.hidden = true;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBanner.hidden = true;
  submitButton.disabled = true;
  submitButton.textContent = signup ? 'Creating account…' : 'Logging in…';

  const credentials = {
    email: document.getElementById('email').value,
    password: passwordInput.value,
  };
  try {
    const result = signup
      ? await api.signup({ ...credentials, role: document.getElementById('role').value })
      : await api.login(credentials);
    setSession(result);
    window.location.assign(result.user.role === 'organizer' ? '/organizer.html' : '/tickets.html');
  } catch (error) {
    errorBanner.textContent = error.message;
    errorBanner.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = signup ? 'Sign up' : 'Log in';
  }
});
