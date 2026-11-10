import { api } from './api.js';
import { setAuthToken, setCurrentUser } from './session.js';

let isSignup = false;
const formTitle = document.getElementById('form-title');
const authForm = document.getElementById('auth-form');
const toggleMode = document.getElementById('toggle-mode');
const roleContainer = document.getElementById('role-container');
const submitBtn = document.getElementById('submit-btn');
const errorBanner = document.getElementById('error-banner');

toggleMode.addEventListener('click', (e) => {
    e.preventDefault();
    isSignup = !isSignup;
    formTitle.textContent = isSignup ? 'Sign Up' : 'Log In';
    submitBtn.textContent = isSignup ? 'Sign Up' : 'Log In';
    toggleMode.textContent = isSignup ? 'Already have an account? Log in' : 'Need an account? Sign up';
    roleContainer.style.display = isSignup ? 'block' : 'none';
    errorBanner.style.display = 'none';
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBanner.style.display = 'none';

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;

    try {
        let response;
        if (isSignup) {
            response = await api.signup({ email, password, role });
        } else {
            response = await api.login({ email, password });
        }

        setAuthToken(response.token);
        setCurrentUser(response.user);

        if (response.user.role === 'organizer') {
            window.location.href = '/organizer.html';
        } else {
            window.location.href = '/tickets.html';
        }
    } catch (err) {
        errorBanner.textContent = err.message;
        errorBanner.style.display = 'block';
    }
});