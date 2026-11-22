# Fix Password Recovery Emails - Resend Setup

## The Real Problem

You're using Gmail SMTP with a personal email address, which causes email providers to mark your password recovery emails as spam. Users never receive them because they're filtered out.

## Quick Fix (5 minutes)

### 1. Sign up for Resend

- Go to [resend.com](https://resend.com)
- Create free account (10,000 emails/month free)
- Verify your email

### 2. Get API Key

- In Resend dashboard → API Keys
- Create new API key
- Copy the key (starts with `re_`)

### 3. Add to Environment

Add this line to your `.env` file:

```env
RESEND_API_KEY=re_your_api_key_here
```

### 4. Restart Development Server

```bash
npm run dev
```

## That's It!

Now your password recovery emails will be delivered reliably to users' inboxes instead of spam folders.

## Why This Works

- ✅ **Professional Service**: Resend is designed for transactional emails
- ✅ **Better Deliverability**: Proper SPF/DKIM authentication
- ✅ **Spam Prevention**: Professional reputation with email providers
- ✅ **No User Setup**: Users just receive emails normally

## Test It

1. Go to your password recovery page
2. Enter a test email address
3. Check the inbox (not spam folder)
4. Email should arrive within seconds

## Alternative (If you want to keep Gmail SMTP)

If you prefer to stick with Gmail SMTP:

1. **Use Gmail Workspace** (paid) instead of personal Gmail
2. **Set up SPF record** for kiarakraft.com domain
3. **Add DKIM signing**
4. **Use business email address**

But Resend is much easier and more reliable for this use case.
