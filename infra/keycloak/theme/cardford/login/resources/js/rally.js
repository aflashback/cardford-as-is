// Presentation/accessibility only. Keycloak owns all form actions and validation.
document.addEventListener('DOMContentLoaded', () => {
  const email = document.querySelector('#kc-register-form input[name="email"], #kc-form-login input[name="username"]');
  if (email) {
    email.placeholder = document.body.dataset.cfEmailPlaceholder;
    email.inputMode = 'email';
    email.autocapitalize = 'none';
    email.spellcheck = false;
    email.setAttribute('aria-required', 'true');
    const descriptions = new Set((email.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    if (document.getElementById('cf-email-help')) descriptions.add('cf-email-help');
    const error = document.getElementById(`input-error-${email.name}`);
    if (error) descriptions.add(error.id);
    if (descriptions.size) email.setAttribute('aria-describedby', [...descriptions].join(' '));
  }
  const nameLabel = document.querySelector('#kc-register-form label[for="firstName"]');
  if (nameLabel && !nameLabel.querySelector('.pf-v5-c-form__label-required')) {
    const optional = document.createElement('span');
    optional.className = 'cf-optional';
    optional.textContent = ` ${document.body.dataset.cfOptional}`;
    nameLabel.append(optional);
  }
});
