package http

import (
	"io"
	"net/http"
	"strings"
)

// AUTH-LOCAL-009: callback navigation gets an explicit recovery path without
// trusting/reflection of callback parameters or changing the rejected status.
// API clients retain the JSON error contract. No automatic retry loop is used.
func authCallbackFailure(w http.ResponseWriter, r *http.Request, status int, code string) {
	if !strings.Contains(r.Header.Get("Accept"), "text/html") {
		authFailure(w, status, code)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
	w.WriteHeader(status)
	_, _ = io.WriteString(w, authCallbackRecoveryHTML)
}

const authCallbackRecoveryHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Sign in again — CardFord</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eee9dc;color:#242820;font:16px/1.6 system-ui,sans-serif;min-height:100svh;padding:0 28px 32px}
.shell{max-width:560px;margin:auto}header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:24px 0 20px;border-bottom:1px solid #cacaba}.brand{display:flex;align-items:center;gap:10px;font-size:23px;font-weight:800;letter-spacing:-.04em}.brand img{width:34px;height:34px}.environment{font-size:12px;color:#5d6257;text-align:right}
main{position:relative;isolation:isolate;padding-top:54px}main::before{content:"";position:absolute;right:0;top:16px;width:132px;height:132px;background:url('/brand/cardford-symbol-mono.svg') center/contain no-repeat;opacity:.055;z-index:-1;pointer-events:none}h1{margin:0 0 16px;font-size:clamp(28px,6vw,38px);line-height:1.2;letter-spacing:-.04em}p{margin:0 0 20px;color:#5d6257}a{color:#a83d29;text-underline-offset:3px}a:focus-visible{outline:3px solid #5d6257;outline-offset:4px}.primary{display:flex;align-items:center;justify-content:center;min-height:48px;margin:28px 0 16px;padding:12px 16px;border-radius:7px;background:#bd442d;color:#fffdf8;font-weight:650;text-decoration:none}.primary:hover{background:#a83d29}.secondary{display:inline-flex;align-items:center;min-height:44px}@media(max-width:400px){body{padding-inline:22px}.environment{max-width:88px;font-size:11px}main{padding-top:40px}}
</style>
</head>
<body><div class="shell">
<header><div class="brand"><img src="/brand/cardford-symbol.svg" alt="" width="34" height="34"><span>CardFord</span></div><span class="environment">Local development</span></header>
<main>
<h1>Let’s try signing in again</h1>
<p>We couldn’t complete this sign-in. The attempt may have expired or been opened in a different browser.</p>
<p>Start again in this browser, then enter the newest code from your email. If it still doesn’t work, try again shortly.</p>
<a class="primary" href="/auth/login">Start sign-in again</a>
<a class="secondary" href="/">Back to CardFord</a>
</main></div></body></html>`
