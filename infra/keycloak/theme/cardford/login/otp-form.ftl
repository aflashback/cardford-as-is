<#-- Phase Two 0.91 email OTP form: preserve native action, field and submit names. -->
<#import "template.ftl" as layout>
<@layout.registrationLayout displayUsername=false; section>
    <#if section = "header">
        ${msg("cfCheckEmail")}
    <#elseif section = "form">
        <p class="cf-code-recipient">${msg("cfCodeSent")} <strong>${auth.attemptedUsername}</strong>.</p>
        <form id="kc-otp-login-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
            <div class="${properties.kcFormGroupClass!}">
                <label for="otp" class="${properties.kcFormLabelClass!}">${msg("cfEmailCode")}</label>
                <span class="${properties.kcInputClass!}<#if messagesPerField.existsError('totp')> pf-m-error</#if>">
                    <input id="otp" name="otp" type="text" autocomplete="one-time-code" inputmode="numeric" autofocus
                        aria-describedby="cf-code-help<#if messagesPerField.existsError('totp')> input-error-otp-code</#if>"
                        aria-invalid="${messagesPerField.existsError('totp')?c}" />
                </span>
                <#if messagesPerField.existsError('totp')>
                    <span id="input-error-otp-code" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">${kcSanitize(messagesPerField.get('totp'))?no_esc}</span>
                </#if>
                <p id="cf-code-help" class="cf-helper">${msg("cfCodeHelp")}</p>
            </div>
            <div id="kc-form-buttons" class="cf-code-actions">
                <input class="${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!}" name="submit" id="kc-submit" type="submit" value="${msg('cfVerifyEmail')}" />
                <input class="${properties.kcButtonSecondaryClass!} ${properties.kcButtonBlockClass!}" name="resend" id="kc-resend" type="submit" value="${msg('cfResendCode')}" />
            </div>
            <a class="cf-change-email" href="${url.loginRestartFlowUrl}">${msg("cfChangeEmail")}</a>
        </form>
    </#if>
</@layout.registrationLayout>
