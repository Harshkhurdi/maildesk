# Maildesk: remaining account setup

Checked 16 October 2026. Keep passwords, OTPs, client secrets and tokens out of chat. Add new credentials directly to the Maildesk Vercel project as sensitive **Production** environment variables. Tell me which steps are complete; I can redeploy and check the connections afterwards.

## 1. Connect Gmail

Google client credentials already exist in production. You do not need a new project or client.

1. Open https://maildesk-theta.vercel.app/auth/sign-in and sign into Maildesk as **harshkhurdi.ai@gmail.com**. Guest mode cannot connect inboxes.
2. Open **Accounts & settings → Connect Gmail**. Start a fresh connection from this button instead of returning to the old Google tab.
3. Choose the Gmail account to connect. Finish Google's identity check yourself and approve the read-only Gmail permission for your Maildesk app.
4. After Google returns to Maildesk, check that the account is listed, then start or continue its scan. Keep the tab open until the scan finishes.
5. Repeat for each inbox, up to ten. Before connecting additional addresses, add them under **Google Auth Platform → Audience → Test users** in project `maildesk-harsh-20261015`. Use **harshkhurdi@gmail.com** to manage that Cloud project.

The three previously approved test addresses are `harshkhurdi.ai@gmail.com`, `work.harshkhurdi@gmail.com`, and `harshkhurdi@gmail.com`. If Google rejects an address, check the saved test-user list. If it reports a redirect mismatch, the Web application's redirect must be exactly:

`https://maildesk-theta.vercel.app/api/gmail/callback`

Testing-mode Gmail refresh tokens normally expire after seven days, so the initial test connection is not a promise of permanent unattended access. Production publishing/verification needs a separate review. [Google OAuth documentation](https://developers.google.com/identity/protocols/oauth2/).

Tell me: **Gmail connected: [addresses]; scan complete / error shown.** Do not send mail contents or codes.

## 2. Set up the call relay

1. Sign into the [Cloudflare dashboard](https://dash.cloudflare.com/) and open **Realtime → TURN** (the product may be labelled Realtime TURN).
2. Create a TURN key named **Maildesk**. Retain its **Key ID** and the generated **TURN key API token**. This is the key's bearer token, not a Global API key.
3. Open [Maildesk environment variables in Vercel](https://vercel.com/harsh-1c69/maildesk/settings/environment-variables). Add these as sensitive **Production** variables:

| Variable | Value |
| --- | --- |
| `CF_TURN_KEY_ID` | Generated TURN Key ID |
| `CF_TURN_API_TOKEN` | Generated TURN key API token |

4. Review any billing requirement before enabling the service. Tell me **TURN variables saved**. I will redeploy, verify credential generation and then run the call checks with you.

Maildesk already generates short-lived connection credentials on its server. [Cloudflare TURN setup](https://developers.cloudflare.com/realtime/turn/generate-credentials/), [pricing](https://developers.cloudflare.com/realtime/turn/faq/).

## 3. Set up X

1. Sign into the [X Developer Console](https://console.x.com/) using the X account you want to connect. Create an app named **Maildesk** if one does not exist.
2. In its authentication settings, enable **OAuth 2.0** and choose a confidential **Web App**. Use read access. Maildesk requests `tweet.read`, `users.read`, and `offline.access`.
3. Set the website to `https://maildesk-theta.vercel.app` and the callback to exactly `https://maildesk-theta.vercel.app/api/x/callback`.
4. Find the **OAuth 2.0 Client ID and Client Secret**. These are different from an OAuth 1 API key and an app-only bearer token. Save them as sensitive Production variables in the same Vercel page:

| Variable | Value |
| --- | --- |
| `X_CLIENT_ID` | OAuth 2.0 Client ID |
| `X_CLIENT_SECRET` | OAuth 2.0 Client Secret |
| `X_API_ENABLED` | `true`, when you agree to enable API usage |

5. Review API pricing and choose your own spending limit. Timeline access can require purchased credits. Tell me **X variables saved and timeline access enabled**, or **X waiting for access**. I can redeploy and verify the existing Connect X flow afterwards.

[Official X OAuth settings](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code), [X API pricing](https://docs.x.com/x-api/getting-started/pricing).

## 4. Complete the two-person call test

After the relay release is ready, use the approved room:

https://maildesk-theta.vercel.app/conversations?room=7aaae6de-36e3-4166-a6ef-a831a09430fa

1. Open it as **harshkhurdi.ai@gmail.com** in the normal browser.
2. Open it as **work.harshkhurdi@gmail.com** in a private browser or on a second device. That user has room-only access.
3. Keep both signed in. Allow microphone/camera when asked, and accept the test voice and video calls. A second device with headphones helps verify actual sound and picture without feedback.
4. For the relay check, use different networks—for example, Wi-Fi on one device and mobile data on the other. Tell me **Both users ready for calls** when available; I will verify call state, controls, hangup/history and relay use with you.

The earlier call test passed on an earlier release; the renewed two-person test has not been completed. No recording is required.

## 5. Shopping: request appropriate merchant access

This is not unlocked by entering your normal shopping passwords. Automatic prices and orders still need provider-approved APIs and additional integration work.

Start with [Swiggy's developer access application](https://mcp.swiggy.com/builders/access/), selecting **Individual Developer**. Describe Maildesk as a personal workspace requesting **Instamart product search, prices, cart review and orders with explicit confirmation**. Disclose the intended cross-store price comparison and ask whether they permit it. Their published rules restrict certain aggregation and competitive-intelligence uses. Do not claim that a working Swiggy integration or demo already exists, and do not invent static IPs or callback details; tell me if the application asks for those so I can prepare accurate technical material before submission.

Swiggy reviews OAuth redirect details for staging access; production follows a working staging integration. A local stub is possible before approval, but it cannot establish real prices or real-order support. [Onboarding requirements](https://mcp.swiggy.com/builders/docs/operate/access/).

For other stores:

| Store | What is still needed |
| --- | --- |
| Amazon India | Eligible [Creators API](https://affiliate-program.amazon.in/creatorsapi/docs/en-us/introduction) access for catalog data. It is an affiliate product-data API, not a consumer checkout API; personal order placement needs separate approved access. |
| Flipkart | Confirm that an affiliate account can actually obtain [product API access](https://affiliate.flipkart.com/api-docs/af_prod_ref.html). These published feeds do not establish buyer checkout access. |
| Blinkit / Zepto | Provider-issued buyer/product API documentation and permission. I have not verified a suitable public buyer API for either service. Seller integrations do not establish consumer shopping access. |

Tell me **Swiggy applied / staging approved**, and which other stores have approved access. Send the non-secret documentation link or access status. Existing merchant search links and manually saved prices continue to work while this is pending.
