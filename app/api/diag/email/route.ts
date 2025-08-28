import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sendEmail } from '@/lib/email';

export async function GET() {
  // Only allow in development or for admin users
  if (process.env.NODE_ENV === 'production') {
    const session = await auth();
    if (!session?.user?.email || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Email diagnostic access denied' },
        { status: 403 }
      );
    }
  }

  try {
    // Check environment variables
    const emailConfig = {
      hasResendKey: !!process.env.RESEND_API_KEY,
      resendKeyPrefix: process.env.RESEND_API_KEY?.substring(0, 8) + '...',
      emailFrom: process.env.EMAIL_FROM,
      hasSmtpHost: !!process.env.SMTP_HOST,
      smtpHost: process.env.SMTP_HOST,
      hasSmtpUser: !!process.env.SMTP_USER,
      smtpUser: process.env.SMTP_USER,
      hasSmtpPass: !!process.env.SMTP_PASS,
      nodeEnv: process.env.NODE_ENV,
      publicAppBase: process.env.PUBLIC_APP_BASE,
    };

    console.log('🔍 Production email config check:', emailConfig);

    return NextResponse.json({
      success: true,
      environment: process.env.NODE_ENV || 'unknown',
      emailConfig,
      message: 'Email configuration checked',
    });
  } catch (error) {
    console.error('Email config check failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Only allow in development or for admin users
  if (process.env.NODE_ENV === 'production') {
    const session = await auth();
    if (!session?.user?.email || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Email diagnostic access denied' },
        { status: 403 }
      );
    }
  }

  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    console.log('🧪 Testing email delivery in production to:', email);

    // Test simple HTML email
    const result = await sendEmail({
      to: email,
      subject: 'Production Email Test - Kiara Kraft',
      html: `
        <h1>Production Email Test</h1>
        <p>This is a test email from the production Kiara Kraft server.</p>
        <p>If you receive this, email delivery is working!</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
        <p>Environment: ${process.env.NODE_ENV}</p>
      `,
      text: 'Production email test - if you receive this, email delivery is working!',
    });

    console.log('📧 Production email test result:', result);

    return NextResponse.json({
      success: true,
      emailResult: result,
      message: result.success
        ? 'Test email sent successfully'
        : 'Test email failed',
    });
  } catch (error) {
    console.error('Production email test failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
