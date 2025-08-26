// Test password recovery for actual end users (not just developers)
import { sendEmail } from './lib/email';

async function testUserEmailDelivery() {
  console.log('🧪 Testing password recovery email delivery for end users...\n');

  // Test with different email providers that your users might have
  const testEmails = [
    'test@gmail.com', // Most common
    'test@yahoo.com', // Popular alternative
    'test@outlook.com', // Microsoft users
    'test@hotmail.com', // Legacy Microsoft
  ];

  console.log('📧 Email Configuration:');
  console.log(
    'RESEND_API_KEY:',
    process.env.RESEND_API_KEY ? '✅ SET' : '❌ NOT SET'
  );
  console.log('EMAIL_FROM:', process.env.EMAIL_FROM);
  console.log('SMTP_HOST:', process.env.SMTP_HOST || 'NOT SET');
  console.log();

  const testEmail = 'your.test.email@gmail.com'; // Replace with your test email

  console.log(`📨 Sending test password recovery email to: ${testEmail}`);
  console.log('(Replace the email above with your actual test email)\n');

  const resetUrl = 'https://kiarakraft.com/en/reset-password?token=test123';

  const result = await sendEmail({
    to: testEmail,
    subject: '🔐 Password Reset - Kiara Kraft',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Password Reset - Kiara Kraft</title>
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">کیارا کرافت</h1>
          <p style="margin: 8px 0 0; opacity: 0.9;">Kiara Kraft</p>
        </div>
        
        <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
          <h2 style="color: #1f2937; margin-top: 0;">Password Reset Request</h2>
          
          <p>Hello!</p>
          
          <p>We received a request to reset your password for your Kiara Kraft account.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              Reset Password
            </a>
          </div>
          
          <p style="font-size: 14px; color: #666;">
            If you didn't request this password reset, you can safely ignore this email.
          </p>
          
          <p style="font-size: 14px; color: #666;">
            This link will expire in 1 hour for security.
          </p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          
          <p style="font-size: 12px; color: #999; text-align: center;">
            This is a test email from Kiara Kraft password recovery system
          </p>
        </div>
      </body>
      </html>
    `,
    text: `Password Reset - Kiara Kraft\n\nHello!\n\nWe received a request to reset your password.\n\nReset your password here: ${resetUrl}\n\nIf you didn't request this, ignore this email.\n\nThis link expires in 1 hour.`,
  });

  console.log('📊 Email Result:');
  console.log('Success:', result.success ? '✅' : '❌');
  console.log('Provider:', result.provider);
  console.log('Message ID:', result.messageId);

  if (result.success) {
    console.log('\n🎉 SUCCESS! Email sent successfully!');
    console.log('📬 Check your email inbox (not spam folder)');
    console.log('⏱️  Email should arrive within 30 seconds');

    if (result.provider === 'resend') {
      console.log('✨ Using Resend - excellent deliverability!');
    } else if (result.provider === 'smtp') {
      console.log('⚠️  Using SMTP - may go to spam folder');
      console.log('💡 Consider setting up Resend for better delivery');
    }
  } else {
    console.log('\n❌ FAILED to send email');
    console.log('Error:', result.error);

    if (
      !process.env.RESEND_API_KEY &&
      result.error?.includes('No email provider')
    ) {
      console.log('\n💡 SOLUTION: Set up Resend API key in your .env file');
      console.log('   RESEND_API_KEY=re_your_api_key_here');
    }
  }

  console.log('\n📋 Next Steps:');
  console.log(
    '1. Update the testEmail variable above with your real test email'
  );
  console.log('2. Run this script again: npx ts-node test-user-email.ts');
  console.log('3. Check email inbox (and spam folder just in case)');
  console.log('4. Try the password recovery on your actual website');
}

testUserEmailDelivery().catch(console.error);
